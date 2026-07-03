import os
import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, HRFlowable
from reportlab.platypus import Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas
from reportlab.graphics.barcode import createBarcodeDrawing
from reportlab.graphics.shapes import Drawing
from reportlab.lib.units import mm

# ── Colores de marca Beatss ──────────────────────────────────────────────────
BRAND_CYAN      = colors.HexColor("#00ccff")
BRAND_PURPLE    = colors.HexColor("#7c3aed")
BRAND_DARK      = colors.HexColor("#0e111c")
GRAY_BORDER     = colors.HexColor("#cbd5e0")
GRAY_LIGHT      = colors.HexColor("#f7fafc")
GRAY_MID        = colors.HexColor("#edf2f7")
GRAY_TEXT       = colors.HexColor("#2d3748")
GRAY_MUTED      = colors.HexColor("#718096")
DARK_TEXT       = colors.HexColor("#1a202c")
TOTAL_BG        = colors.HexColor("#e8f8ff")   # Celeste muy suave para la fila VALOR TOTAL

# Ruta al logo real (desde el directorio del script)
_HERE = os.path.dirname(os.path.abspath(__file__))
LOGO_PATH = os.path.join(_HERE, "public", "logo.png")


class NumberedCanvasSRI(canvas.Canvas):
    """Canvas personalizado para RIDE que añade números de página, clave de acceso y barra de marca al pie."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_footer(num_pages)
            super().showPage()
        super().save()

    def draw_footer(self, page_count):
        self.saveState()
        w = self._pagesize[0]

        # Línea separadora suave
        self.setStrokeColor(GRAY_BORDER)
        self.setLineWidth(0.5)
        self.line(40, 44, w - 40, 44)

        # Texto legal
        self.setFont("Helvetica", 7.5)
        self.setFillColor(GRAY_MUTED)
        self.drawString(40, 32, "Este documento es una representación impresa de un Comprobante Electrónico autorizado por el SRI.")

        # Paginación
        self.setFont("Helvetica-Bold", 7.5)
        self.setFillColor(GRAY_TEXT)
        self.drawRightString(w - 40, 32, f"Pág. {self._pageNumber} / {page_count}")

        # Acento de color (línea inferior muy fina en cyan)
        self.setStrokeColor(BRAND_CYAN)
        self.setLineWidth(2)
        self.line(40, 22, w - 40, 22)

        self.restoreState()


def _build_logo_image(max_width=110, max_height=48):
    """Devuelve un RLImage con el logo escalado, o None si no existe."""
    if not os.path.isfile(LOGO_PATH):
        return None
    try:
        img = RLImage(LOGO_PATH)
        # Escalar proporcionalmente
        orig_w, orig_h = img.drawWidth, img.drawHeight
        ratio = min(max_width / orig_w, max_height / orig_h)
        img.drawWidth  = orig_w * ratio
        img.drawHeight = orig_h * ratio
        return img
    except Exception as e:
        print(f"[RIDE] Warning: no se pudo cargar el logo: {e}")
        return None


def generar_ride_pdf(dest_filepath, factura_xml_str, autorizacion_data=None):
    """
    Genera el archivo PDF RIDE premium a partir del XML de la factura autorizada.
    factura_xml_str : XML string de la factura.
    autorizacion_data: dict opcional con número y fecha de autorización.
    """
    from lxml import etree

    # ── Parsear XML ──────────────────────────────────────────────────────────
    try:
        root = etree.fromstring(factura_xml_str.encode("utf-8"))
    except Exception:
        root = etree.fromstring(factura_xml_str.strip().encode("utf-8"))

    def get_val(xpath_query, default=""):
        res = root.xpath(xpath_query)
        return res[0].text if res and res[0].text else default

    # ── Extraer datos del XML ─────────────────────────────────────────────────
    ambiente_cod   = get_val("//infoTributaria/ambiente")
    ambiente       = "PRUEBAS" if ambiente_cod == "1" else "PRODUCCIÓN"
    emision        = "NORMAL"

    razon_social      = get_val("//infoTributaria/razonSocial")
    nombre_comercial  = get_val("//infoTributaria/nombreComercial", razon_social)
    ruc               = get_val("//infoTributaria/ruc")
    clave_acceso      = get_val("//infoTributaria/claveAcceso")
    estab             = get_val("//infoTributaria/estab")
    pto_emi           = get_val("//infoTributaria/ptoEmi")
    secuencial        = get_val("//infoTributaria/secuencial")
    dir_matriz        = get_val("//infoTributaria/dirMatriz")

    num_factura       = f"{estab}-{pto_emi}-{secuencial}"
    num_autorizacion  = clave_acceso
    fecha_autorizacion = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if autorizacion_data:
        num_autorizacion   = autorizacion_data.get("numeroAutorizacion", num_autorizacion)
        fecha_autorizacion = autorizacion_data.get("fechaAutorizacion", fecha_autorizacion)

    fecha_emision          = get_val("//infoFactura/fechaEmision")
    dir_establecimiento    = get_val("//infoFactura/dirEstablecimiento", dir_matriz)
    obligado_contabilidad  = get_val("//infoFactura/obligadoContabilidad", "NO")
    tipo_id_comprador      = get_val("//infoFactura/tipoIdentificacionComprador")
    razon_social_comprador = get_val("//infoFactura/razonSocialComprador")
    identificacion_comprador = get_val("//infoFactura/identificacionComprador")
    dir_comprador          = get_val("//infoFactura/direccionComprador", "Quito")

    total_sin_impuestos = float(get_val("//infoFactura/totalSinImpuestos", "0.00"))
    total_descuento     = float(get_val("//infoFactura/totalDescuento",    "0.00"))
    importe_total       = float(get_val("//infoFactura/importeTotal",      "0.00"))

    regimen_rimpe_text = ""
    contrib_rimpe = root.xpath("//infoTributaria/contribuyenteRimpe")
    if contrib_rimpe:
        regimen_rimpe_text = contrib_rimpe[0].text

    contrib_especial  = get_val("//infoTributaria/contribuyenteEspecial")
    agente_retencion  = get_val("//infoTributaria/agenteRetencion")

    # ── Documento ReportLab ───────────────────────────────────────────────────
    doc = SimpleDocTemplate(
        dest_filepath,
        pagesize=letter,
        leftMargin=40,
        rightMargin=40,
        topMargin=48,
        bottomMargin=58
    )

    styles = getSampleStyleSheet()

    # ── Estilos de texto ──────────────────────────────────────────────────────
    s_normal = ParagraphStyle(
        "RIDE_Normal",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=GRAY_TEXT,
    )
    s_bold = ParagraphStyle(
        "RIDE_Bold",
        parent=s_normal,
        fontName="Helvetica-Bold",
    )
    s_title = ParagraphStyle(
        "RIDE_Title",
        parent=s_normal,
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=DARK_TEXT,
        spaceAfter=2,
    )
    s_brand = ParagraphStyle(
        "RIDE_Brand",
        parent=s_normal,
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=11,
        textColor=BRAND_CYAN,
    )
    s_sub = ParagraphStyle(
        "RIDE_Sub",
        parent=s_normal,
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=DARK_TEXT,
    )
    s_header_cell = ParagraphStyle(
        "RIDE_HeaderCell",
        parent=s_normal,
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=10,
        textColor=colors.white,
    )
    s_muted = ParagraphStyle(
        "RIDE_Muted",
        parent=s_normal,
        fontSize=7.5,
        textColor=GRAY_MUTED,
    )

    story = []

    # ══════════════════════════════════════════════════════════════════════════
    # BLOQUE SUPERIOR: LOGO + DATOS EMISOR  |  DATOS SRI
    # ══════════════════════════════════════════════════════════════════════════

    # ── Columna Izquierda: Logo + Datos del Emisor ────────────────────────────
    logo_img = _build_logo_image(max_width=120, max_height=50)

    emisor_flowables = []

    if logo_img:
        emisor_flowables.append(logo_img)
        emisor_flowables.append(Spacer(1, 6))
    else:
        # Fallback: nombre comercial en texto grande
        emisor_flowables.append(Paragraph(f"<b>{nombre_comercial}</b>", s_title))
        emisor_flowables.append(Spacer(1, 4))

    # Línea de acento bajo el logo (color de marca)
    emisor_flowables.append(
        HRFlowable(width="100%", thickness=1.5, color=BRAND_CYAN, spaceAfter=6)
    )

    emisor_flowables.append(Paragraph(f"<b>{nombre_comercial}</b>", s_brand))
    emisor_flowables.append(Spacer(1, 5))
    emisor_flowables.append(Paragraph(f"<b>Razón Social:</b> {razon_social}", s_normal))
    emisor_flowables.append(Spacer(1, 3))
    emisor_flowables.append(Paragraph(f"<b>Dirección Matriz:</b> {dir_matriz}", s_normal))
    emisor_flowables.append(Spacer(1, 3))
    emisor_flowables.append(Paragraph(f"<b>Dirección Sucursal:</b> {dir_establecimiento}", s_normal))
    emisor_flowables.append(Spacer(1, 3))
    emisor_flowables.append(Paragraph(f"<b>Obligado a llevar Contabilidad:</b> {obligado_contabilidad}", s_normal))

    if contrib_especial:
        emisor_flowables.append(Spacer(1, 3))
        emisor_flowables.append(Paragraph(f"<b>Contribuyente Especial Nro:</b> {contrib_especial}", s_normal))

    if agente_retencion:
        emisor_flowables.append(Spacer(1, 3))
        emisor_flowables.append(Paragraph(f"<b>Agente de Retención Resolución Nro:</b> {agente_retencion}", s_normal))

    if regimen_rimpe_text:
        emisor_flowables.append(Spacer(1, 5))
        emisor_flowables.append(Paragraph(f"<b>{regimen_rimpe_text}</b>", s_bold))

    # ── Columna Derecha: Datos SRI ────────────────────────────────────────────
    # Código de barras + QR
    try:
        # Reducir barWidth a 0.52 (ancho aprox 205px) para que no desborde
        barcode_drawing = createBarcodeDrawing("Code128", value=clave_acceso, barHeight=28, barWidth=0.52)
    except Exception as e:
        barcode_drawing = Paragraph(f"[Código de barras no disponible]", s_muted)

    try:
        qr_url = (
            "https://declaraciones.sri.gob.ec/comprobantes-electronicos-internet/"
            f"publico/detalleComprobante.jsf?claveAcceso={clave_acceso}"
        )
        qr_drawing = createBarcodeDrawing("QR", value=qr_url, width=50, height=50)
    except Exception as e:
        print(f"[-] [RIDE] Error al generar QR: {e}")
        qr_drawing = None

    clave_flowables = [
        Paragraph(f"<b>CLAVE DE ACCESO:</b>", s_normal),
        Spacer(1, 3),
        barcode_drawing,
        Spacer(1, 2),
        Paragraph(f"<font size=7>{clave_acceso}</font>", s_normal),
    ]

    if qr_drawing:
        tabla_codigos = Table([[clave_flowables, qr_drawing]], colWidths=[205, 52])
        tabla_codigos.setStyle(TableStyle([
            ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
            ("LEFTPADDING",   (0,0), (-1,-1), 0),
            ("RIGHTPADDING",  (0,0), (-1,-1), 0),
            ("TOPPADDING",    (0,0), (-1,-1), 0),
            ("BOTTOMPADDING", (0,0), (-1,-1), 0),
        ]))
        codigos_flowable = tabla_codigos
    else:
        codigos_flowable = KeepTogether(clave_flowables)

    sri_flowables = [
        Paragraph(f"<font size=11><b>R.U.C.: {ruc}</b></font>", s_normal),
        Spacer(1, 3),
        Paragraph("<font size=13><b>FACTURA</b></font>", s_normal),
        Spacer(1, 2),
        Paragraph(f"<b>No. {num_factura}</b>", s_normal),
        Spacer(1, 6),
        Paragraph(f"<b>NÚMERO DE AUTORIZACIÓN:</b><br/><font size=7>{num_autorizacion}</font>", s_normal),
        Spacer(1, 4),
        Paragraph(f"<b>FECHA Y HORA DE AUTORIZACIÓN:</b><br/>{fecha_autorizacion}", s_normal),
        Spacer(1, 4),
        Paragraph(f"<b>AMBIENTE:</b> {ambiente}", s_normal),
        Spacer(1, 3),
        Paragraph(f"<b>EMISIÓN:</b> {emision}", s_normal),
        Spacer(1, 6),
        codigos_flowable,
    ]

    # ── Tabla cabecera de dos columnas ────────────────────────────────────────
    tabla_cabecera = Table(
        [[emisor_flowables, sri_flowables]],
        colWidths=[260, 260]
    )
    tabla_cabecera.setStyle(TableStyle([
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ("BOX",           (0,0), (0,0),   1,   BRAND_CYAN),
        ("BOX",           (1,0), (1,0),   0.5, GRAY_BORDER),
        ("BACKGROUND",    (0,0), (0,0),   colors.HexColor("#f0fdff")),  # celeste muy suave en columna emisor
        ("TOPPADDING",    (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("LEFTPADDING",   (0,0), (-1,-1), 10),
        ("RIGHTPADDING",  (0,0), (-1,-1), 10),
    ]))

    story.append(tabla_cabecera)
    story.append(Spacer(1, 10))

    # ══════════════════════════════════════════════════════════════════════════
    # BLOQUE CLIENTE / COMPRADOR
    # ══════════════════════════════════════════════════════════════════════════
    cliente_data = [
        [
            Paragraph(f"<b>Razón Social / Nombres y Apellidos:</b>  {razon_social_comprador}", s_normal),
            Paragraph(f"<b>Identificación:</b>  {identificacion_comprador}", s_normal),
        ],
        [
            Paragraph(f"<b>Fecha de Emisión:</b>  {fecha_emision}", s_normal),
            Paragraph(f"<b>Dirección:</b>  {dir_comprador}", s_normal),
        ],
    ]

    tabla_cliente = Table(cliente_data, colWidths=[330, 190])
    tabla_cliente.setStyle(TableStyle([
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("BOX",           (0,0), (-1,-1), 0.5, GRAY_BORDER),
        ("LINEBELOW",     (0,0), (-1,0),  0.5, colors.HexColor("#e2e8f0")),
        ("TOPPADDING",    (0,0), (-1,-1), 7),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("RIGHTPADDING",  (0,0), (-1,-1), 8),
    ]))

    story.append(tabla_cliente)
    story.append(Spacer(1, 10))

    # ══════════════════════════════════════════════════════════════════════════
    # TABLA DE DETALLES
    # ══════════════════════════════════════════════════════════════════════════
    detalles_header = [
        Paragraph("<b>Cód. Principal</b>",  s_header_cell),
        Paragraph("<b>Cant.</b>",           s_header_cell),
        Paragraph("<b>Descripción</b>",     s_header_cell),
        Paragraph("<b>P. Unitario</b>",     s_header_cell),
        Paragraph("<b>Descuento</b>",       s_header_cell),
        Paragraph("<b>P. Total</b>",        s_header_cell),
    ]

    tabla_detalles_data = [detalles_header]

    item_nodes = root.xpath("//detalles/detalle")
    for i, item in enumerate(item_nodes):
        cod   = (item.xpath("./codigoPrincipal/text()") or ["BEAT"])[0]
        cant  = (item.xpath("./cantidad/text()")        or ["1.00"])[0]
        desc  = (item.xpath("./descripcion/text()")     or ["Licencia"])[0]
        p_uni = (item.xpath("./precioUnitario/text()")  or ["0.00"])[0]
        d_val = (item.xpath("./descuento/text()")       or ["0.00"])[0]
        p_tot = (item.xpath("./precioTotalSinImpuesto/text()") or ["0.00"])[0]

        try:
            cant_f  = float(cant)
            p_uni_f = float(p_uni)
            d_val_f = float(d_val)
            p_tot_f = float(p_tot)
        except Exception:
            cant_f = p_uni_f = d_val_f = p_tot_f = 0.0

        row_bg = colors.white if i % 2 == 0 else colors.HexColor("#f8fafc")

        tabla_detalles_data.append([
            Paragraph(cod,                   s_normal),
            Paragraph(f"{cant_f:.2f}",        s_normal),
            Paragraph(desc,                  s_normal),
            Paragraph(f"$ {p_uni_f:.2f}",    s_normal),
            Paragraph(f"$ {d_val_f:.2f}",    s_normal),
            Paragraph(f"$ {p_tot_f:.2f}",    s_normal),
        ])

    tabla_detalles = Table(tabla_detalles_data, colWidths=[75, 38, 220, 62, 58, 67])
    # Construir estilos base
    det_style = [
        ("VALIGN",        (0,0),  (-1,-1), "MIDDLE"),
        # Encabezado con color de marca
        ("BACKGROUND",    (0,0),  (-1,0),  BRAND_DARK),
        ("TEXTCOLOR",     (0,0),  (-1,0),  colors.white),
        ("ROWBACKGROUNDS",(0,1),  (-1,-1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID",          (0,0),  (-1,-1), 0.4, GRAY_BORDER),
        ("TOPPADDING",    (0,0),  (-1,-1), 5),
        ("BOTTOMPADDING", (0,0),  (-1,-1), 5),
        ("LEFTPADDING",   (0,0),  (-1,-1), 6),
        ("RIGHTPADDING",  (0,0),  (-1,-1), 6),
        ("ALIGN",         (1,0),  (1,-1),  "CENTER"),
        ("ALIGN",         (3,0),  (-1,-1), "RIGHT"),
        # Línea inferior del encabezado en cyan
        ("LINEBELOW",     (0,0),  (-1,0),  2, BRAND_CYAN),
    ]
    tabla_detalles.setStyle(TableStyle(det_style))

    story.append(tabla_detalles)
    story.append(Spacer(1, 10))

    # ══════════════════════════════════════════════════════════════════════════
    # BLOQUE INFERIOR: INFO ADICIONAL + TOTALES
    # ══════════════════════════════════════════════════════════════════════════

    # ── Info Adicional (Izquierda) ────────────────────────────────────────────
    adicional_flowables = [
        Paragraph("<b>Información Adicional</b>", s_sub),
        HRFlowable(width="100%", thickness=0.8, color=GRAY_BORDER, spaceAfter=4),
    ]

    info_ad_nodes = root.xpath("//infoAdicional/campoAdicional")
    for ad in info_ad_nodes:
        name = ad.get("nombre", "Campo")
        val  = ad.text if ad.text else ""
        adicional_flowables.append(Paragraph(f"<b>{name}:</b>  {val}", s_normal))
        adicional_flowables.append(Spacer(1, 3))

    # Formas de pago
    adicional_flowables.append(Spacer(1, 8))
    adicional_flowables.append(Paragraph("<b>Forma de Pago</b>", s_sub))
    adicional_flowables.append(HRFlowable(width="100%", thickness=0.8, color=GRAY_BORDER, spaceAfter=4))

    formas_dict = {
        "01": "Sin utilización del sistema financiero (Efectivo)",
        "16": "Tarjeta de Débito",
        "17": "Dinero Electrónico",
        "19": "Tarjeta de Crédito",
        "20": "Otros con utilización del sistema financiero",
    }

    pago_nodes = root.xpath("//infoFactura/pagos/pago")
    for p in pago_nodes:
        fp_code = (p.xpath("./formaPago/text()") or ["20"])[0]
        fp_desc = formas_dict.get(fp_code, "Otros con utilización del sistema financiero")
        tp_val  = (p.xpath("./total/text()") or ["0.00"])[0]
        adicional_flowables.append(Paragraph(f"• {fp_desc}:  <b>$ {float(tp_val):.2f}</b>", s_normal))

    # ── Totales (Derecha) ─────────────────────────────────────────────────────
    iva_0_base = total_sin_impuestos - total_descuento

    totales_data = [
        [Paragraph("<b>SUBTOTAL 15%</b>",          s_normal), Paragraph("$ 0.00",                          s_normal)],
        [Paragraph("<b>SUBTOTAL IVA 0%</b>",        s_normal), Paragraph(f"$ {iva_0_base:.2f}",             s_normal)],
        [Paragraph("<b>SUBTOTAL NO OBJETO IVA</b>", s_normal), Paragraph("$ 0.00",                          s_normal)],
        [Paragraph("<b>SUBTOTAL EXENTO IVA</b>",    s_normal), Paragraph("$ 0.00",                          s_normal)],
        [Paragraph("<b>SUBTOTAL SIN IMPUESTOS</b>", s_normal), Paragraph(f"$ {total_sin_impuestos:.2f}",    s_normal)],
        [Paragraph("<b>TOTAL DESCUENTO</b>",        s_normal), Paragraph(f"$ {total_descuento:.2f}",        s_normal)],
        [Paragraph("<b>ICE</b>",                    s_normal), Paragraph("$ 0.00",                          s_normal)],
        [Paragraph("<b>IVA 15%</b>",                s_normal), Paragraph("$ 0.00",                          s_normal)],
        [Paragraph("<b>VALOR TOTAL</b>",            s_bold),   Paragraph(f"<b>$ {importe_total:.2f}</b>",   s_bold)],
    ]

    tabla_totales = Table(totales_data, colWidths=[148, 90])
    tabla_totales.setStyle(TableStyle([
        ("VALIGN",        (0,0),  (-1,-1), "MIDDLE"),
        ("GRID",          (0,0),  (-1,-1), 0.4, GRAY_BORDER),
        ("TOPPADDING",    (0,0),  (-1,-1), 4),
        ("BOTTOMPADDING", (0,0),  (-1,-1), 4),
        ("LEFTPADDING",   (0,0),  (-1,-1), 7),
        ("RIGHTPADDING",  (0,0),  (-1,-1), 7),
        ("ALIGN",         (1,0),  (1,-1),  "RIGHT"),
        # Fila VALOR TOTAL destacada con cyan suave
        ("BACKGROUND",    (0,8),  (1,8),   TOTAL_BG),
        ("LINEABOVE",     (0,8),  (1,8),   1.5, BRAND_CYAN),
        ("TEXTCOLOR",     (0,8),  (1,8),   DARK_TEXT),
    ]))

    # ── Tabla inferior completa ───────────────────────────────────────────────
    tabla_inferior = Table(
        [[adicional_flowables, tabla_totales]],
        colWidths=[272, 248]
    )
    tabla_inferior.setStyle(TableStyle([
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ("TOPPADDING",    (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 0),
        ("LEFTPADDING",   (0,0), (-1,-1), 0),
        ("RIGHTPADDING",  (0,0), (-1,-1), 0),
    ]))

    story.append(KeepTogether([tabla_inferior]))

    # ── Construir PDF ─────────────────────────────────────────────────────────
    doc.build(story, canvasmaker=NumberedCanvasSRI)
    print(f"✅ RIDE PDF premium generado en: {dest_filepath}")
