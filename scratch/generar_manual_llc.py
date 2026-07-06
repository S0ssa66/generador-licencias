#!/usr/bin/env python3
"""
Genera el Manual de Ingeniería Financiera: LLC + SRI como PDF profesional.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, PageBreak
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
import os

OUTPUT_PATH = os.path.expanduser("~/Desktop/Manual_LLC_SossaMusic.pdf")

# ── Paleta de colores ──────────────────────────────────────────────────────────
AZUL_OSCURO   = colors.HexColor("#0D1B2A")
AZUL_MEDIO    = colors.HexColor("#1B3A5C")
AZUL_ACENTO   = colors.HexColor("#1E6FD9")
ORO           = colors.HexColor("#C9A84C")
BLANCO        = colors.white
GRIS_CLARO    = colors.HexColor("#F4F6FA")
GRIS_TEXTO    = colors.HexColor("#374151")
VERDE         = colors.HexColor("#16A34A")

# ── Estilos ────────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

titulo_principal = ParagraphStyle(
    "TituloPrincipal",
    fontName="Helvetica-Bold", fontSize=22, leading=28,
    textColor=BLANCO, alignment=TA_CENTER, spaceAfter=6
)
subtitulo = ParagraphStyle(
    "Subtitulo",
    fontName="Helvetica-Oblique", fontSize=12, leading=16,
    textColor=ORO, alignment=TA_CENTER, spaceAfter=4
)
seccion = ParagraphStyle(
    "Seccion",
    fontName="Helvetica-Bold", fontSize=14, leading=18,
    textColor=BLANCO, spaceAfter=4, spaceBefore=16,
    backColor=AZUL_MEDIO, leftIndent=0, rightIndent=0,
    borderPad=6
)
hack_titulo = ParagraphStyle(
    "HackTitulo",
    fontName="Helvetica-Bold", fontSize=11, leading=14,
    textColor=AZUL_ACENTO, spaceBefore=10, spaceAfter=2
)
hack_body = ParagraphStyle(
    "HackBody",
    fontName="Helvetica", fontSize=9.5, leading=14,
    textColor=GRIS_TEXTO, alignment=TA_JUSTIFY, spaceAfter=4,
    leftIndent=12
)
glosa_style = ParagraphStyle(
    "Glosa",
    fontName="Helvetica-Oblique", fontSize=9, leading=13,
    textColor=VERDE, leftIndent=20, spaceAfter=2
)
footer_style = ParagraphStyle(
    "Footer",
    fontName="Helvetica-Oblique", fontSize=8, leading=10,
    textColor=colors.HexColor("#9CA3AF"), alignment=TA_CENTER
)
aviso_style = ParagraphStyle(
    "Aviso",
    fontName="Helvetica-Bold", fontSize=9, leading=12,
    textColor=colors.HexColor("#DC2626"), alignment=TA_CENTER,
    spaceAfter=4, spaceBefore=4
)

# ── Helpers ────────────────────────────────────────────────────────────────────
def banner(text, bg=AZUL_MEDIO):
    """Celda única tipo banner de sección."""
    data = [[Paragraph(text, seccion)]]
    t = Table(data, colWidths=[17*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), bg),
        ("LEFTPADDING",  (0,0), (-1,-1), 10),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
        ("TOPPADDING",   (0,0), (-1,-1), 6),
        ("BOTTOMPADDING",(0,0), (-1,-1), 6),
        ("ROUNDEDCORNERS", [4]),
    ]))
    return t

def hack(titulo, cuerpo, glosas=None):
    """Bloque de un hack individual."""
    elems = []
    elems.append(Paragraph(f"💡 {titulo}", hack_titulo))
    elems.append(Paragraph(f"<b>El Hack:</b> {cuerpo}", hack_body))
    if glosas:
        for g in glosas:
            elems.append(Paragraph(f"→ {g}", glosa_style))
    return elems

def hr():
    return HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#D1D5DB"), spaceAfter=4, spaceBefore=4)

# ── Portada ────────────────────────────────────────────────────────────────────
def build_portada():
    elems = []
    data = [[
        Paragraph("📑 MANUAL DE INGENIERÍA FINANCIERA", titulo_principal),
    ]]
    t = Table(data, colWidths=[17*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), AZUL_OSCURO),
        ("LEFTPADDING",  (0,0), (-1,-1), 18),
        ("RIGHTPADDING", (0,0), (-1,-1), 18),
        ("TOPPADDING",   (0,0), (-1,-1), 20),
        ("BOTTOMPADDING",(0,0), (-1,-1), 20),
    ]))
    elems.append(t)
    elems.append(Spacer(1, 0.3*cm))
    elems.append(Paragraph("LLC + SRI • Estrategias de Optimización Fiscal, Blindaje Patrimonial y Crecimiento Global", subtitulo))
    elems.append(Spacer(1, 0.2*cm))
    elems.append(Paragraph("Desarrollado para: <b>Sossa Music LLC</b> | © 2026 — Documento Confidencial", footer_style))
    elems.append(Spacer(1, 0.4*cm))
    elems.append(Paragraph(
        "⚠️  AVISO LEGAL: Este documento tiene carácter exclusivamente informativo y educativo. "
        "Las estrategias aquí descritas deben ser revisadas y validadas por un asesor fiscal y legal "
        "autorizado antes de su aplicación. El autor no asume responsabilidad por decisiones "
        "tomadas con base exclusiva en este documento.",
        aviso_style
    ))
    elems.append(hr())
    return elems

# ── Tabla de transferencias ────────────────────────────────────────────────────
def build_tabla_transferencias():
    header = ["Monto", "Canal Recomendado", "Comisión", "Tiempo"]
    rows = [
        ["< $500", "Takenos (ACH gratis desde Mercury)", "1% fijo", "~2 horas"],
        ["> $1,000", "Banco Guayaquil (SWIFT directo)", "$10.27 tarifa plana", "24-48 h hábiles"],
        ["Gastos diarios", "Uglycash (ACH gratis desde Mercury)", "$0 comisiones (Ugly Visa)", "Inmediato"],
    ]
    col_widths = [3*cm, 6.5*cm, 4.5*cm, 3*cm]
    data = [header] + rows
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,0), AZUL_OSCURO),
        ("TEXTCOLOR",    (0,0), (-1,0), BLANCO),
        ("FONTNAME",     (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",     (0,0), (-1,-1), 8.5),
        ("ALIGN",        (0,0), (-1,-1), "CENTER"),
        ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), [GRIS_CLARO, BLANCO]),
        ("GRID",         (0,0), (-1,-1), 0.4, colors.HexColor("#D1D5DB")),
        ("TOPPADDING",   (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0), (-1,-1), 5),
    ]))
    return t

# ── Contenido ──────────────────────────────────────────────────────────────────
def build_content():
    e = []

    # ─── SECCIÓN 1: SRI / RIMPE ──────────────────────────────────────────────
    e.append(banner("1  🇪🇨  ECOSISTEMA SRI & RÉGIMEN RIMPE (ECUADOR)"))
    e.append(Spacer(1, 0.2*cm))

    e += hack(
        "Elusión Legítima del 5% del ISD (Impuesto a la Salida de Divisas)",
        "Centraliza todos tus gastos operativos (hosting, plugins, librerías) directamente a través de la "
        "tarjeta de débito corporativa de tu banco en EE. UU. (Mercury/Wise) o usando la tarjeta de Uglycash. "
        "El flujo monetario se ejecuta completamente en el exterior. "
        "<b>Te ahorras ese 5% en absolutamente todos los costos de tu negocio.</b>"
    )
    e += hack(
        "Triangulación Comercial para Proteger tus Límites del RIMPE",
        "Tu LLC en EE. UU. centraliza el 100% de la facturación global. Luego, mediante autofacturación "
        "regulada (de tu RUC personal a tu LLC), decides el monto exacto y el momento óptimo para "
        "transferir el dinero a Ecuador, manteniéndote siempre dentro de los rangos más económicos del RIMPE."
    )
    e += hack(
        "Exportación de Servicios con Tarifa 0% de IVA",
        "Toda actividad técnica, soporte informático o creación artística que realices desde Ecuador, "
        "pero cuyo aprovechamiento se ejecute de forma exclusiva en el exterior por tu LLC, califica "
        "legalmente como <b>exportación de servicios</b>. Al emitir facturas electrónicas desde el SRI "
        "dirigidas a tu empresa en EE. UU., estás exento por ley de cobrar el 15% de IVA local."
    )
    e += hack(
        "El Temporizador de los 3 Años del RIMPE",
        "El RIMPE Emprendedor tiene una vigencia máxima de <b>3 años consecutivos</b>. Al acumular y "
        "reinvertir tus ganancias dentro de la LLC, controlas el volumen de ingresos visibles que "
        "declaras localmente, retrasando estratégicamente la caída al Régimen General."
    )
    e += hack(
        "Glosas de Facturación y Exclusión de Servicios Profesionales",
        "Para evitar expulsión del RIMPE, enfoca los conceptos de tus facturas en el componente técnico, "
        "comercial o artístico permitido. Usa glosas precisas como:",
        glosas=[
            '"Servicios de soporte, maquetación técnica y mantenimiento informático de plataformas web".',
            '"Servicios técnicos de producción, mezcla, edición y masterización fonográfica transfronteriza".',
        ]
    )
    e += hack(
        "Reconversión del Ingreso Inmobiliario (La Trampa de Airbnb)",
        "Los ingresos por arrendamiento en Ecuador están excluidos del RIMPE. Configura la pasarela "
        "de Airbnb para que deposite en tu LLC en EE. UU. Para ingresar esas ganancias bajo el RIMPE, "
        "emítele una factura a tu LLC bajo la glosa de:",
        glosas=[
            '"Servicios de marketing digital, administración de plataformas de hospedaje y gestión logística de propiedades".',
        ]
    )

    e.append(Spacer(1, 0.3*cm))

    # ─── SECCIÓN 2: BANCARIO / FINTECH ───────────────────────────────────────
    e.append(banner("2  💸  ESTRATEGIAS BANCARIAS, FINTECH Y FLUJO DE EFECTIVO"))
    e.append(Spacer(1, 0.2*cm))

    e += hack(
        "El Préstamo Corporativo Intercompañía (0% Impuestos Locales)",
        "Si necesitas ingresar capital considerable a Ecuador, redacta un contrato de préstamo simple "
        "donde <b>Sossa Music LLC</b> actúa como prestamista y tú como deudor. Ante el SRI, un préstamo "
        "es un <b>pasivo (deuda)</b>, no un ingreso gravable, permitiendo la libre recepción del capital "
        "con 0% de impacto tributario inmediato."
    )
    e += hack(
        "Arbitraje de Comisiones Bancarias vía SWIFT Selectivo",
        "Banco Pichincha cobra ~$35.00 por recepción internacional. <b>Banco Guayaquil cobra solo $10.27 "
        "de tarifa plana</b>, sin importar el volumen. Configura la cuenta de menor costo como tu "
        "destino principal de liquidación corporativa."
    )

    e.append(Paragraph("<b>Ecosistema de Transferencias según el Volumen de Capital:</b>", hack_titulo))
    e.append(Spacer(1, 0.15*cm))
    e.append(build_tabla_transferencias())
    e.append(Spacer(1, 0.2*cm))

    e += hack(
        "Consumos Locales a Costo Cero con Ugly Visa",
        "Transfiere fondos vía ACH gratuito desde Mercury a Uglycash. Al usar la tarjeta Ugly Visa en "
        "datáfonos locales, los consumos se procesan contra tus dólares en el exterior con "
        "<b>0% de recargos de ISD</b> y manteniendo la liquidez fuera del radar bancario local."
    )
    e += hack(
        "Estructura de Cuentas 'Espejo' Antibloqueos",
        "Abre en paralelo a Mercury una cuenta secundaria de respaldo en Relay Financial o Airwallex. "
        "Ante cualquier contingencia con el banco principal, cambias las rutas de cobro en minutos y "
        "tu flujo de caja internacional nunca se detiene."
    )
    e += hack(
        "Blindaje Patrimonial Total contra Coactivas Locales",
        "Al operar comercialmente a través de tu LLC, tus activos y capital principal quedan bajo leyes "
        "federales en EE. UU., siendo <b>completamente intocables</b> frente a procesos coactivos o "
        "medidas cautelares originadas en Ecuador."
    )
    e += hack(
        "Centralización de Pagos a Colaboradores y Protección contra la UAFE",
        "Exige a tus colaboradores que emitan un Invoice a nombre de <b>Sossa Music LLC</b>. Realiza los "
        "desembolsos directamente desde tu banco en EE. UU. La transacción queda como gasto operativo "
        "legítimo en el exterior y tus cuentas personales ecuatorianas permanecen impecables."
    )

    e.append(PageBreak())

    # ─── SECCIÓN 3: IRS ────────────────────────────────────────────────────────
    e.append(banner("3  🇺🇸  OBLIGACIONES Y HACKS ANTE EL IRS (ESTADOS UNIDOS)"))
    e.append(Spacer(1, 0.2*cm))

    e += hack(
        "La Mina Terrestre de los $25,000 – Obligación Informativa del IRS",
        "Las LLC de un solo dueño extranjero DEBEN presentar anualmente el <b>Formulario 5472 junto a la "
        "declaración Proforma 1120</b> antes del 15 de abril. Omitir esta presentación, incluso con $0 "
        "en transacciones, genera una <b>multa automática e inmediata de $25,000</b>. "
        "El cumplimiento estricto de esta fecha es la prioridad número uno del negocio."
    )
    e += hack(
        "El Escudo de Retención del 30% mediante el Formulario W-8BEN-E",
        "EE. UU. exige a plataformas como Spotify, BeatStars y YouTube retener el 30% a creadores "
        "internacionales. Al completar el <b>W-8BEN-E</b> declarando tu LLC como Disregarded Entity y "
        "certificando que operas desde Ecuador (No ETBUS), las plataformas te transfieren "
        "<b>el 100% de tus ingresos brutos</b> sin retenciones."
    )
    e += hack(
        "El Mecanismo del DBA (Doing Business As) para Multi-Marcas",
        "Registra múltiples marcas comerciales bajo tu LLC principal mediante un DBA, sin costos de "
        "múltiples LLC. Opera como <i>Sossa Beats</i> (música), una línea de software y otra de "
        "gestión de propiedades, consolidando toda la carga fiscal y bancaria en una sola empresa."
    )

    e.append(Spacer(1, 0.3*cm))

    # ─── SECCIÓN 4: INVERSIONES ───────────────────────────────────────────────
    e.append(banner("4  📈  CRECIMIENTO PATRIMONIAL E INVERSIONES AVANZADAS"))
    e.append(Spacer(1, 0.2*cm))

    e += hack(
        "Compras Corporativas Exentas de Sales Tax en EE. UU.",
        "Con tu EIN, registra tu empresa en Amazon Business y Apple Business Manager. Vincula las "
        "compras a un agente courier en Miami con certificación Tax Exempt para remover legalmente "
        "el Sales Tax (7–9%), importando tecnología al costo neto de fábrica."
    )
    e += hack(
        "Inversión en Bolsa Global y Activos Financieros con Comisión Cero",
        "Abre la cuenta de corretaje corporativa a nombre de tu LLC en Charles Schwab o Interactive "
        "Brokers. Transfiere excedentes de capital vía ACH doméstico <b>100% gratuito</b>. Adquiere "
        "acciones, fondos indexados (S&P 500) o renta fija, con total exención de impuestos locales "
        "mientras el dinero permanezca invertido en el exterior."
    )
    e += hack(
        "Construcción de Historial Crediticio Transfronterizo",
        "Mercury te permite activar tarjetas de crédito corporativas Mercury IO con <b>1.5% Cashback</b> "
        "en cada gasto. Mediante <i>Amex Global Transfer</i>, apalanca tu historial crediticio ecuatoriano "
        "(Pichincha, Guayaquil, Produbanco) para abrir líneas de crédito Amex en EE. UU. con solo tu pasaporte."
    )
    e += hack(
        "Rampas de Salida Off-Ramp Limpias para DePIN y Cripto",
        "Convierte tokens de redes DePIN (Grass, Salad) a USDC/USDT, envíalos a Coinbase Prime o Juno, "
        "y liquídalos vía ACH hacia Mercury. Para el radar ecuatoriano, el dinero ingresa como "
        "transferencia comercial de una corporación tecnológica extranjera por 'servicios de software'."
    )
    e += hack(
        "Maximización de Rendimientos Líquidos vía Mercury Treasury",
        "Desde el panel de Mercury, activa fondos monetarios en <b>Letras del Tesoro de EE. UU.</b> "
        "Esto genera un interés pasivo de <b>4% a 5% anual en dólares</b>, con disponibilidad de "
        "retiro en cualquier día hábil y exención de tributación local en Ecuador."
    )
    e += hack(
        "Eludir Retenciones Locales con Clientes Grandes en Ecuador",
        "Haz que el contrato lo firmen directamente con <b>Sossa Music LLC</b>. Las empresas ecuatorianas "
        "<b>no tienen la facultad legal de aplicar retenciones en la fuente a empresas extranjeras</b> sin "
        "establecimiento físico en el país. Te transferirán el 100% de la factura neta al exterior."
    )

    e.append(Spacer(1, 0.4*cm))
    e.append(hr())
    e.append(Spacer(1, 0.2*cm))
    e.append(Paragraph(
        "Manual de Estrategia Corporativa y Finanzas Internacionales · Sossa Music LLC · © 2026 · Documento Confidencial",
        footer_style
    ))

    return e

# ── Build PDF ──────────────────────────────────────────────────────────────────
def main():
    doc = SimpleDocTemplate(
        OUTPUT_PATH,
        pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
        title="Manual LLC + SRI – Sossa Music",
        author="Sossa Music LLC",
        subject="Ingeniería Financiera y Optimización Fiscal",
    )

    story = []
    story += build_portada()
    story.append(Spacer(1, 0.3*cm))
    story += build_content()

    doc.build(story)
    print(f"✅ PDF generado exitosamente en:\n   {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
