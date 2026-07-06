#!/usr/bin/env python3
"""
Genera un PDF con la documentación del Flujo de Entrega al Comprador
y lo guarda en el Escritorio.
"""
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
import os

OUTPUT_PATH = os.path.expanduser("~/Desktop/Muestra_Flujo_Entrega_Cliente.pdf")

# Colors
PRIMARY_COLOR = colors.HexColor("#0B0C10")    # Deep Dark
SECONDARY_COLOR = colors.HexColor("#7C3AED")  # Electric Purple
ACCENT_COLOR = colors.HexColor("#06B6D4")     # Neon Cyan
TEXT_COLOR = colors.HexColor("#2D3748")       # Dark Charcoal
BG_LIGHT = colors.HexColor("#F8FAFC")         # Light Slate
BORDER_COLOR = colors.HexColor("#E2E8F0")     # Gray border

# Styles
styles = getSampleStyleSheet()

style_title = ParagraphStyle(
    "DocTitle",
    fontName="Helvetica-Bold", fontSize=18, leading=22,
    textColor=SECONDARY_COLOR, alignment=TA_CENTER, spaceAfter=8
)

style_subtitle = ParagraphStyle(
    "DocSub",
    fontName="Helvetica", fontSize=10, leading=14,
    textColor=colors.HexColor("#718096"), alignment=TA_CENTER, spaceAfter=15
)

style_h1 = ParagraphStyle(
    "SectionH1",
    fontName="Helvetica-Bold", fontSize=12, leading=16,
    textColor=PRIMARY_COLOR, spaceBefore=14, spaceAfter=6,
    keepWithNext=True
)

style_body = ParagraphStyle(
    "BodyTextCustom",
    fontName="Helvetica", fontSize=9.5, leading=13.5,
    textColor=TEXT_COLOR, alignment=TA_JUSTIFY, spaceAfter=6
)

style_bullet = ParagraphStyle(
    "BulletCustom",
    fontName="Helvetica", fontSize=9.5, leading=13.5,
    textColor=TEXT_COLOR, leftIndent=15, spaceAfter=4
)

style_box = ParagraphStyle(
    "BoxContent",
    fontName="Helvetica", fontSize=9, leading=13,
    textColor=colors.HexColor("#1A202C"), backColor=BG_LIGHT,
    leftIndent=10, rightIndent=10, spaceBefore=4, spaceAfter=4,
    borderPadding=6, borderWidth=0.5, borderColor=BORDER_COLOR
)

def create_hr():
    return HRFlowable(width="100%", thickness=0.5, color=BORDER_COLOR, spaceBefore=6, spaceAfter=6)

def main():
    doc = SimpleDocTemplate(
        OUTPUT_PATH,
        pagesize=letter,
        leftMargin=0.75*inch, rightMargin=0.75*inch,
        topMargin=0.75*inch, bottomMargin=0.75*inch
    )
    
    story = []
    
    story.append(Paragraph("MUESTRA: FLUJO DE ENTREGA AL COMPRADOR", style_title))
    story.append(Paragraph("Documentación del ecosistema de descargas y clearance para beatss.app", style_subtitle))
    story.append(create_hr())
    
    story.append(Paragraph("<b>Resumen del Flujo de Entrega:</b>", style_h1))
    story.append(Paragraph(
        "Cuando un artista compra un beat en tu tienda, el sistema no solo procesa el cobro, sino que "
        "despliega una infraestructura automatizada de 3 niveles para entregar los archivos de audio, la licencia firmada "
        "y dar la autorización de derechos de autor para evitar reclamos en YouTube (Content ID).",
        style_body
    ))
    
    story.append(create_hr())
    
    # ── 1. Correo de Entrega ─────────────────────────────────────────────────
    story.append(Paragraph("1. 📧 Correo de Entrega Automático (vía EmailJS)", style_h1))
    story.append(Paragraph(
        "Se envía inmediatamente al confirmar el pago de forma automatizada directamente a la bandeja del comprador. "
        "Contiene enlaces de descarga directa firmados y un formato predeterminado:",
        style_body
    ))
    
    email_sample = (
        "<b>Asunto:</b> Entrega de Licencia - [Nombre del Beat]<br/>"
        "<b>Contenido:</b><br/>"
        "&bull; <i>MP3 (320kbps):</i> Enlace de descarga directa del audio.<br/>"
        "&bull; <i>WAV (Master):</i> Enlace directo (Excluido para Licencia Básica).<br/>"
        "&bull; <i>Stems (Pistas Separadas):</i> Enlace directo (Solo para Licencias Ilimitada y Exclusiva).<br/>"
        "&bull; Mensaje: <i>'Tu contrato y licencia oficial PDF serán procesados y firmados por el productor muy pronto.'</i>"
    )
    story.append(Paragraph(email_sample, style_box))
    
    # ── 2. Portal de Descargas ───────────────────────────────────────────────
    story.append(Paragraph("2. 💻 El Portal de Descargas en la Web (buyer-download-view)", style_h1))
    story.append(Paragraph(
        "Si el usuario compra en la web, se le redirige al portal de descargas integrado de la tienda. El portal cuenta con:",
        style_body
    ))
    story.append(Paragraph("&bull; <b>Cabecera de Marca:</b> Muestra el logo corporativo o personal del productor activo.", style_bullet))
    story.append(Paragraph("&bull; <b>Ficha del Beat:</b> Nombre del beat, portada oficial, costo final y tipo de licencia adquirida.", style_bullet))
    story.append(Paragraph("&bull; <b>Descarga de Licencia PDF:</b> Botón que compila en tiempo real el contrato de licencia y lo descarga usando la librería html2pdf.", style_bullet))
    story.append(Paragraph("&bull; <b>Descarga de Audio:</b> Botones directos para bajar el MP3, WAV y Stems de forma segura.", style_bullet))
    story.append(Paragraph("&bull; <b>Historial de Auditoría:</b> Registro visible de las descargas ejecutadas por el cliente.", style_bullet))
    
    # ── 3. Portal de Clearance ───────────────────────────────────────────────
    story.append(Paragraph("3. 🛡️ El Portal de Clearance / Lista Blanca (clearance.html)", style_h1))
    story.append(Paragraph(
        "El cliente accede de forma independiente al portal de clearance para registrar su canal y evitar reclamos de copyright:",
        style_body
    ))
    
    clearance_steps = (
        "<b>Paso 1: Verificación de Compra</b><br/>"
        "El cliente digita su Código de Referencia de la orden y su ID del Productor. El sistema comprueba su estado en la base de datos.<br/>"
        "<b>Paso 2: Registro del Canal</b><br/>"
        "El artista ingresa el enlace de su canal de YouTube, su nombre artístico y el título de su canción.<br/>"
        "<b>Paso 3: Exclusión de Reclamos</b><br/>"
        "Al hacer clic en 'Agregar a Lista Blanca', el canal se registra en el Content ID de Sossa Music LLC, liberando cualquier reclamo en menos de 24 horas."
    )
    story.append(Paragraph(clearance_steps, style_box))
    
    story.append(Spacer(1, 10))
    story.append(create_hr())
    story.append(Paragraph(
        "<font color='#7C3AED'><b>Sossa Music LLC</b></font> • Plataforma de Ventas Beatss • Muestra del Flujo de Distribución",
        ParagraphStyle("Footer", fontName="Helvetica-Oblique", fontSize=8, leading=10, textColor=colors.HexColor("#A0AEC0"), alignment=TA_CENTER)
    ))
    
    doc.build(story)
    print(f"✅ PDF de flujo generado en: {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
