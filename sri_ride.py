import os
import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas
from reportlab.graphics.barcode import createBarcodeDrawing
from reportlab.graphics.shapes import Drawing

class NumberedCanvasSRI(canvas.Canvas):
    """Canvas personalizado para RIDE que añade números de página y clave de acceso al pie."""
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
            self.draw_page_number(num_pages)
            super().showPage()
        super().save()

    def draw_page_number(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#718096"))
        
        # Pie de página RIDE estándar
        pie_texto = "Este documento es una representación impresa de un comprobante electrónico."
        self.drawString(54, 30, pie_texto)
        
        page_str = f"Página {self._pageNumber} de {page_count}"
        self.drawRightString(self._pagesize[0] - 54, 30, page_str)
        self.restoreState()


def generar_ride_pdf(dest_filepath, factura_xml_str, autorizacion_data=None):
    """
    Genera el archivo PDF RIDE a partir del XML de la factura autorizada.
    factura_xml_str: XML string de la factura.
    autorizacion_data: dict opcional con número y fecha de autorización
    """
    from lxml import etree
    
    # Parsear XML
    try:
        root = etree.fromstring(factura_xml_str.encode('utf-8'))
    except Exception as e:
        # Si el string XML tiene caracteres inválidos al inicio
        factura_xml_str_clean = factura_xml_str.strip()
        root = etree.fromstring(factura_xml_str_clean.encode('utf-8'))
        
    # Helpers para extraer datos del XML
    def get_val(xpath_query, default=""):
        res = root.xpath(xpath_query)
        return res[0].text if res and res[0].text else default

    # 1. Datos de infoTributaria
    ambiente_cod = get_val("//infoTributaria/ambiente")
    ambiente = "PRUEBAS" if ambiente_cod == "1" else "PRODUCCIÓN"
    emision = "NORMAL" # Según ficha técnica
    
    razon_social = get_val("//infoTributaria/razonSocial")
    nombre_comercial = get_val("//infoTributaria/nombreComercial", razon_social)
    ruc = get_val("//infoTributaria/ruc")
    clave_acceso = get_val("//infoTributaria/claveAcceso")
    estab = get_val("//infoTributaria/estab")
    pto_emi = get_val("//infoTributaria/ptoEmi")
    secuencial = get_val("//infoTributaria/secuencial")
    dir_matriz = get_val("//infoTributaria/dirMatriz")
    
    num_factura = f"{estab}-{pto_emi}-{secuencial}"
    
    # Datos de autorización
    num_autorizacion = clave_acceso # En modalidad offline la clave de acceso es el mismo número de autorización
    fecha_autorizacion = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    if autorizacion_data:
        num_autorizacion = autorizacion_data.get("numeroAutorizacion", num_autorizacion)
        fecha_autorizacion = autorizacion_data.get("fechaAutorizacion", fecha_autorizacion)

    # 2. Datos de infoFactura
    fecha_emision = get_val("//infoFactura/fechaEmision")
    dir_establecimiento = get_val("//infoFactura/dirEstablecimiento", dir_matriz)
    obligado_contabilidad = get_val("//infoFactura/obligadoContabilidad", "NO")
    
    tipo_id_comprador = get_val("//infoFactura/tipoIdentificacionComprador")
    razon_social_comprador = get_val("//infoFactura/razonSocialComprador")
    identificacion_comprador = get_val("//infoFactura/identificacionComprador")
    dir_comprador = get_val("//infoFactura/direccionComprador", "Quito")
    
    total_sin_impuestos = float(get_val("//infoFactura/totalSinImpuestos", "0.00"))
    total_descuento = float(get_val("//infoFactura/totalDescuento", "0.00"))
    importe_total = float(get_val("//infoFactura/importeTotal", "0.00"))
    
    # Leyendas tributarias especiales
    regimen_rimpe_text = ""
    contrib_rimpe = root.xpath("//infoTributaria/contribuyenteRimpe")
    if contrib_rimpe:
        regimen_rimpe_text = contrib_rimpe[0].text
        
    contrib_especial = get_val("//infoTributaria/contribuyenteEspecial")
    agente_retencion = get_val("//infoTributaria/agenteRetencion")

    # Documento de ReportLab
    doc = SimpleDocTemplate(
        dest_filepath,
        pagesize=letter,
        leftMargin=40,
        rightMargin=40,
        topMargin=40,
        bottomMargin=50
    )
    
    styles = getSampleStyleSheet()
    
    # Estilos customizados premium
    style_normal = ParagraphStyle(
        'RIDE_Normal',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#2d3748")
    )
    
    style_bold = ParagraphStyle(
        'RIDE_Bold',
        parent=style_normal,
        fontName='Helvetica-Bold'
    )
    
    style_title = ParagraphStyle(
        'RIDE_Title',
        parent=style_normal,
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=14,
        textColor=colors.HexColor("#1a202c")
    )

    style_sub = ParagraphStyle(
        'RIDE_Sub',
        parent=style_normal,
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#2d3748")
    )

    story = []
    
    # ----------------------------------------------------
    # BLOQUE SUPERIOR: COLUMNA IZQUIERDA Y DERECHA
    # ----------------------------------------------------
    
    # Columna Izquierda: Datos del Emisor
    logo_p = Paragraph(f"<b>{nombre_comercial}</b>", style_title)
    razon_p = Paragraph(f"<b>Razón Social:</b> {razon_social}", style_normal)
    matriz_p = Paragraph(f"<b>Dirección Matriz:</b> {dir_matriz}", style_normal)
    sucursal_p = Paragraph(f"<b>Dirección Sucursal:</b> {dir_establecimiento}", style_normal)
    obligado_p = Paragraph(f"<b>Obligado a llevar Contabilidad:</b> {obligado_contabilidad}", style_normal)
    
    emisor_flowables = [
        logo_p,
        Spacer(1, 8),
        razon_p,
        Spacer(1, 4),
        matriz_p,
        Spacer(1, 4),
        sucursal_p,
        Spacer(1, 4),
        obligado_p
    ]
    
    if contrib_especial:
        emisor_flowables.append(Spacer(1, 4))
        emisor_flowables.append(Paragraph(f"<b>Contribuyente Especial Nro:</b> {contrib_especial}", style_normal))
        
    if agente_retencion:
        emisor_flowables.append(Spacer(1, 4))
        emisor_flowables.append(Paragraph(f"<b>Agente de Retención Resolución Nro:</b> {agente_retencion}", style_normal))
        
    if regimen_rimpe_text:
        emisor_flowables.append(Spacer(1, 6))
        emisor_flowables.append(Paragraph(f"<b>{regimen_rimpe_text}</b>", style_bold))
        
    # Columna Derecha: Datos de Factura / SRI
    sri_ruc_p = Paragraph(f"<font size=12><b>R.U.C.: {ruc}</b></font>", style_normal)
    sri_tipo_p = Paragraph("<font size=12><b>FACTURA</b></font>", style_normal)
    sri_num_p = Paragraph(f"<b>No. {num_factura}</b>", style_normal)
    sri_aut_p = Paragraph(f"<b>NÚMERO DE AUTORIZACIÓN:</b><br/>{num_autorizacion}", style_normal)
    sri_fec_p = Paragraph(f"<b>FECHA Y HORA DE AUTORIZACIÓN:</b><br/>{fecha_autorizacion}", style_normal)
    sri_amb_p = Paragraph(f"<b>AMBIENTE:</b> {ambiente}", style_normal)
    sri_emi_p = Paragraph(f"<b>EMISIÓN:</b> {emision}", style_normal)
    sri_clave_p = Paragraph(f"<b>CLAVE DE ACCESO:</b><br/>{clave_acceso}", style_normal)
    
    # Código de barras y QR
    try:
        barcode_drawing = createBarcodeDrawing('Code128', value=clave_acceso, barHeight=30, barWidth=0.8)
    except Exception as e:
        barcode_drawing = Paragraph(f"[Error generando código de barras: {str(e)}]", style_normal)
        
    try:
        qr_url = f"https://declaraciones.sri.gob.ec/comprobantes-electronicos-internet/publico/detalleComprobante.jsf?claveAcceso={clave_acceso}"
        qr_drawing = createBarcodeDrawing('QR', value=qr_url, width=55, height=55)
    except Exception as e:
        print(f"[-] [RIDE] Error al generar código QR: {e}")
        qr_drawing = None
        
    if qr_drawing:
        # Colocar el código de barras y el código QR lado a lado
        tabla_codigos = Table([[barcode_drawing, qr_drawing]], colWidths=[185, 60])
        tabla_codigos.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
            ('TOPPADDING', (0,0), (-1,-1), 0),
            ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ]))
        codigos_flowable = tabla_codigos
    else:
        codigos_flowable = barcode_drawing
        
    sri_flowables = [
        sri_ruc_p,
        Spacer(1, 4),
        sri_tipo_p,
        Spacer(1, 2),
        sri_num_p,
        Spacer(1, 6),
        sri_aut_p,
        Spacer(1, 4),
        sri_fec_p,
        Spacer(1, 4),
        sri_amb_p,
        Spacer(1, 4),
        sri_emi_p,
        Spacer(1, 6),
        codigos_flowable,
        sri_clave_p
    ]
    
    # Crear Tabla para las dos columnas superiores
    datos_cabecera = [
        [emisor_flowables, sri_flowables]
    ]
    
    tabla_cabecera = Table(datos_cabecera, colWidths=[260, 260])
    tabla_cabecera.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOX', (0,0), (0,0), 0.5, colors.HexColor("#cbd5e0")),
        ('BOX', (1,0), (1,0), 0.5, colors.HexColor("#cbd5e0")),
        ('TOPPADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    
    story.append(tabla_cabecera)
    story.append(Spacer(1, 10))
    
    # ----------------------------------------------------
    # BLOQUE CLIENTE / COMPRADOR
    # ----------------------------------------------------
    cliente_data = [
        [
            Paragraph(f"<b>Razón Social / Nombres y Apellidos:</b> {razon_social_comprador}", style_normal),
            Paragraph(f"<b>Identificación:</b> {identificacion_comprador}", style_normal)
        ],
        [
            Paragraph(f"<b>Fecha de Emisión:</b> {fecha_emision}", style_normal),
            Paragraph(f"<b>Dirección del Comprador:</b> {dir_comprador}", style_normal)
        ]
    ]
    
    tabla_cliente = Table(cliente_data, colWidths=[330, 190])
    tabla_cliente.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e0")),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('LINEBELOW', (0,0), (-1,0), 0.5, colors.HexColor("#e2e8f0")),
    ]))
    
    story.append(tabla_cliente)
    story.append(Spacer(1, 10))
    
    # ----------------------------------------------------
    # TABLA DE DETALLES
    # ----------------------------------------------------
    # Encabezados
    detalles_header = [
        Paragraph("<b>Cod. Principal</b>", style_sub),
        Paragraph("<b>Cant.</b>", style_sub),
        Paragraph("<b>Descripción</b>", style_sub),
        Paragraph("<b>Precio Unitario</b>", style_sub),
        Paragraph("<b>Descuento</b>", style_sub),
        Paragraph("<b>Precio Total</b>", style_sub),
    ]
    
    tabla_detalles_data = [detalles_header]
    
    # Cargar los ítems desde el XML
    item_nodes = root.xpath("//detalles/detalle")
    for item in item_nodes:
        cod = item.xpath("./codigoPrincipal/text()")[0] if item.xpath("./codigoPrincipal/text()") else "BEAT"
        cant = item.xpath("./cantidad/text()")[0] if item.xpath("./cantidad/text()") else "1.00"
        desc = item.xpath("./descripcion/text()")[0] if item.xpath("./descripcion/text()") else "Licencia"
        p_uni = item.xpath("./precioUnitario/text()")[0] if item.xpath("./precioUnitario/text()") else "0.00"
        d_val = item.xpath("./descuento/text()")[0] if item.xpath("./descuento/text()") else "0.00"
        p_tot = item.xpath("./precioTotalSinImpuesto/text()")[0] if item.xpath("./precioTotalSinImpuesto/text()") else "0.00"
        
        # Convertir a float para formatear
        try:
            cant_f = float(cant)
            p_uni_f = float(p_uni)
            d_val_f = float(d_val)
            p_tot_f = float(p_tot)
        except Exception:
            cant_f, p_uni_f, d_val_f, p_tot_f = 1.0, 0.0, 0.0, 0.0
            
        tabla_detalles_data.append([
            Paragraph(cod, style_normal),
            Paragraph(f"{cant_f:.2f}", style_normal),
            Paragraph(desc, style_normal),
            Paragraph(f"$ {p_uni_f:.2f}", style_normal),
            Paragraph(f"$ {d_val_f:.2f}", style_normal),
            Paragraph(f"$ {p_tot_f:.2f}", style_normal),
        ])
        
    tabla_detalles = Table(tabla_detalles_data, colWidths=[75, 40, 215, 65, 60, 65])
    tabla_detalles.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#f7fafc")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e0")),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('ALIGN', (1,0), (1,-1), 'CENTER'),
        ('ALIGN', (3,0), (-1,-1), 'RIGHT'),
    ]))
    
    story.append(tabla_detalles)
    story.append(Spacer(1, 10))
    
    # ----------------------------------------------------
    # BLOQUE INFERIOR: INFORMACIÓN ADICIONAL Y TOTALES
    # ----------------------------------------------------
    
    # Info Adicional (Izquierda)
    adicional_flowables = [
        Paragraph("<b>Información Adicional</b>", style_sub),
        Spacer(1, 4)
    ]
    
    info_ad_nodes = root.xpath("//infoAdicional/campoAdicional")
    for ad in info_ad_nodes:
        name = ad.get("nombre", "Campo")
        val = ad.text if ad.text else ""
        adicional_flowables.append(Paragraph(f"<b>{name}:</b> {val}", style_normal))
        adicional_flowables.append(Spacer(1, 3))
        
    # Formas de Pago
    adicional_flowables.append(Spacer(1, 6))
    adicional_flowables.append(Paragraph("<b>Detalle de Formas de Pago</b>", style_sub))
    adicional_flowables.append(Spacer(1, 4))
    
    pago_nodes = root.xpath("//infoFactura/pagos/pago")
    for p in pago_nodes:
        f_pago = p.xpath("./formaPago/text()")
        f_pago_val = f_pago[0] if f_pago else "20"
        
        # Mapeo formas de pago legibles
        formas_dict = {
            "01": "SIN UTILIZACION DEL SISTEMA FINANCIERO (EFECTIVO)",
            "16": "TARJETA DE DEBITO",
            "17": "DINERO ELECTRONICO",
            "19": "TARJETA DE CREDITO",
            "20": "OTROS CON UTILIZACION DEL SISTEMA FINANCIERO"
        }
        f_pago_desc = formas_dict.get(f_pago_val, "OTROS CON UTILIZACION DEL SISTEMA FINANCIERO")
        
        t_pago = p.xpath("./total/text()")
        t_pago_val = t_pago[0] if t_pago else "0.00"
        
        adicional_flowables.append(Paragraph(f"• {f_pago_desc}: $ {float(t_pago_val):.2f}", style_normal))
        
    # Columna Derecha: Tabla de Totales
    iva_0_base = total_sin_impuestos - total_descuento # Ya que asumimos IVA 0% para derechos de autor
    
    totales_data = [
        [Paragraph("<b>SUBTOTAL 15%</b>", style_normal), Paragraph(f"$ 0.00", style_normal)],
        [Paragraph("<b>SUBTOTAL IVA 0%</b>", style_normal), Paragraph(f"$ {iva_0_base:.2f}", style_normal)],
        [Paragraph("<b>SUBTOTAL NO OBJETO IVA</b>", style_normal), Paragraph(f"$ 0.00", style_normal)],
        [Paragraph("<b>SUBTOTAL EXENTO IVA</b>", style_normal), Paragraph(f"$ 0.00", style_normal)],
        [Paragraph("<b>SUBTOTAL SIN IMPUESTOS</b>", style_normal), Paragraph(f"$ {total_sin_impuestos:.2f}", style_normal)],
        [Paragraph("<b>TOTAL DESCUENTO</b>", style_normal), Paragraph(f"$ {total_descuento:.2f}", style_normal)],
        [Paragraph("<b>ICE</b>", style_normal), Paragraph(f"$ 0.00", style_normal)],
        [Paragraph("<b>IVA 15%</b>", style_normal), Paragraph(f"$ 0.00", style_normal)],
        [Paragraph("<b>VALOR TOTAL</b>", style_normal), Paragraph(f"<b>$ {importe_total:.2f}</b>", style_normal)],
    ]
    
    tabla_totales = Table(totales_data, colWidths=[150, 90])
    tabla_totales.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e0")),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('ALIGN', (1,0), (1,-1), 'RIGHT'),
        ('BACKGROUND', (0,8), (1,8), colors.HexColor("#edf2f7")),
    ]))
    
    # Tabla Inferior Completa
    datos_inferiores = [
        [adicional_flowables, tabla_totales]
    ]
    
    tabla_inferior = Table(datos_inferiores, colWidths=[270, 250])
    tabla_inferior.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    
    story.append(KeepTogether([tabla_inferior]))
    
    # Construir PDF
    doc.build(story, canvasmaker=NumberedCanvasSRI)
    print(f"✅ RIDE PDF generado exitosamente en: {dest_filepath}")
