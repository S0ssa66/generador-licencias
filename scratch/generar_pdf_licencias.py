#!/usr/bin/env python3
"""
Genera un PDF de muestra con los contratos de licencia (Básica, Premium, Ilimitada y Exclusiva)
para Sossa Music LLC en el Escritorio.
"""
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, PageBreak
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
import os

OUTPUT_PATH = os.path.expanduser("~/Desktop/Muestra_Contratos_Licencias_SossaMusic.pdf")

# Colors
PRIMARY_COLOR = colors.HexColor("#0D1B2A")    # Dark Navy
SECONDARY_COLOR = colors.HexColor("#1F3A60")  # Steel Blue
ACCENT_COLOR = colors.HexColor("#C9A84C")     # Muted Gold
TEXT_COLOR = colors.HexColor("#2D3748")       # Dark Charcoal
BG_LIGHT = colors.HexColor("#F7FAFC")         # Off-white
BORDER_COLOR = colors.HexColor("#E2E8F0")     # Light Gray

# Styles
styles = getSampleStyleSheet()

style_title = ParagraphStyle(
    "DocTitle",
    fontName="Helvetica-Bold", fontSize=18, leading=22,
    textColor=PRIMARY_COLOR, alignment=TA_CENTER, spaceAfter=8
)

style_subtitle = ParagraphStyle(
    "DocSub",
    fontName="Helvetica", fontSize=10, leading=14,
    textColor=colors.HexColor("#718096"), alignment=TA_CENTER, spaceAfter=15
)

style_h1 = ParagraphStyle(
    "SectionH1",
    fontName="Helvetica-Bold", fontSize=12, leading=16,
    textColor=PRIMARY_COLOR, spaceBefore=14, spaceAfter=8,
    keepWithNext=True
)

style_body = ParagraphStyle(
    "BodyTextCustom",
    fontName="Helvetica", fontSize=9.5, leading=13.5,
    textColor=TEXT_COLOR, alignment=TA_JUSTIFY, spaceAfter=6
)

style_quote_en = ParagraphStyle(
    "QuoteEN",
    fontName="Helvetica-Oblique", fontSize=9, leading=13,
    textColor=colors.HexColor("#1A202C"), backColor=BG_LIGHT,
    leftIndent=15, rightIndent=15, spaceBefore=4, spaceAfter=4,
    borderPadding=8, borderWidth=0.5, borderColor=BORDER_COLOR
)

style_quote_es = ParagraphStyle(
    "QuoteES",
    fontName="Helvetica-Oblique", fontSize=9, leading=13,
    textColor=colors.HexColor("#2C5282"), backColor=BG_LIGHT,
    leftIndent=15, rightIndent=15, spaceBefore=4, spaceAfter=4,
    borderPadding=8, borderWidth=0.5, borderColor=BORDER_COLOR
)

style_badge = ParagraphStyle(
    "Badge",
    fontName="Helvetica-Bold", fontSize=10, leading=12,
    textColor=colors.white, alignment=TA_CENTER
)

def create_badge(text, bg_color):
    t = Table([[Paragraph(text, style_badge)]], colWidths=[150])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), bg_color),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("ALIGN", (0,0), (-1,-1), "CENTER"),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("ROUNDEDCORNERS", [4]),
    ]))
    return t

def create_hr():
    return HRFlowable(width="100%", thickness=0.5, color=BORDER_COLOR, spaceBefore=8, spaceAfter=8)

def main():
    doc = SimpleDocTemplate(
        OUTPUT_PATH,
        pagesize=letter,
        leftMargin=0.75*inch, rightMargin=0.75*inch,
        topMargin=0.75*inch, bottomMargin=0.75*inch
    )
    
    story = []
    
    # ── Page 1: Introduction & Table of Limits ───────────────────────────────
    story.append(Paragraph("SOSSA MUSIC LLC • BEAT LICENSES MOCKUP", style_title))
    story.append(Paragraph("Muestra de estructura legal y contratos de licencias en inglés y español", style_subtitle))
    story.append(create_hr())
    
    story.append(Paragraph("<b>Acerca de esta muestra:</b>", style_h1))
    story.append(Paragraph(
        "Este PDF contiene las plantillas estándar para las licencias de uso comercial emitidas por la marca "
        "<b>Sossa Beats</b>, operada legalmente por <b>Sossa Music LLC</b> (Nuevo México, EE. UU.). "
        "Están diseñadas para proteger tanto el Master (los derechos de distribución de la grabación de sonido) "
        "como los derechos de composición musical (Publishing/Regalías de Autor en BMI).",
        style_body
    ))
    
    story.append(Spacer(1, 10))
    story.append(Paragraph("<b>Tabla Comparativa de Límites:</b>", style_h1))
    
    # Limits table
    table_data = [
        ["Licencia", "Archivos", "Reproducciones", "Videoclips", "Propiedad Master", "Publishing (Sossa)"],
        ["Básica", "MP3", "Hasta 50k", "1 No monetizado", "Sossa Music LLC", "Retenido (100%)"],
        ["Premium", "MP3 + WAV", "Hasta 200k", "1 Monetizado", "Sossa Music LLC", "Retenido (100%)"],
        ["Ilimitada", "MP3 + WAV + Stems", "Ilimitadas", "Ilimitados", "Sossa Music LLC", "Retenido (100%)"],
        ["Exclusiva", "MP3 + WAV + Stems", "Ilimitadas", "Ilimitados", "Comprador (Cesión)", "Retenido (50%)"]
    ]
    
    t_limits = Table(table_data, colWidths=[1.1*inch, 1.3*inch, 1.1*inch, 1.1*inch, 1.4*inch, 1.5*inch])
    t_limits.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), PRIMARY_COLOR),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("ALIGN", (0,0), (-1,-1), "CENTER"),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 8.5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [BG_LIGHT, colors.white]),
        ("GRID", (0,0), (-1,-1), 0.5, BORDER_COLOR),
    ]))
    story.append(t_limits)
    
    story.append(Spacer(1, 15))
    story.append(Paragraph(
        "<b>Nota sobre la Licencia Exclusiva (Buyout):</b> El comprador adquiere la propiedad del Master para poder registrar "
        "libremente su canción, pero se reserva el 50% de la composición a nombre de <i>Joao David Dominguez Sosa (BMI)</i> / "
        "<i>Sossa Music LLC</i> como editora. Esto te asegura cobrar regalías de composición de por vida en BMI.",
        style_body
    ))
    
    # ── Page 2: Básica & Premium ─────────────────────────────────────────────
    story.append(PageBreak())
    
    story.append(create_badge("LICENCIA BÁSICA", SECONDARY_COLOR))
    story.append(Spacer(1, 10))
    
    story.append(Paragraph("<b>Basic Lease (English Segment):</b>", style_h1))
    story.append(Paragraph(
        "<i>This license agreement is entered into between the buyer ('Licensee') and Sossa Beats, "
        "a commercial brand operated legally and exclusively by Sossa Music LLC, incorporated under "
        "the laws of the State of New Mexico, USA ('Licensor'). "
        "Sossa Music LLC retains 100% of the Master recording and 100% of the musical composition (Publishing rights). "
        "The audio stream limit is set to 50,000 streams. All sales are final and non-refundable.</i>",
        style_quote_en
    ))
    
    story.append(Paragraph("<b>Licencia Básica (Segmento en Español):</b>", style_h1))
    story.append(Paragraph(
        "<i>Este contrato de licencia se celebra entre el comprador ('el Licenciatario') y Sossa Beats, "
        "una marca comercial operada de forma legal y exclusiva por Sossa Music LLC, constituida bajo "
        "las leyes del Estado de Nuevo México, EE. UU. ('el Licenciante'). "
        "Sossa Music LLC retiene el 100% del Master y el 100% de la composición (Publishing). "
        "El límite de reproducciones es de 50,000. Todas las ventas son finales y no reembolsables.</i>",
        style_quote_es
    ))
    
    story.append(create_hr())
    
    story.append(create_badge("LICENCIA PREMIUM", SECONDARY_COLOR))
    story.append(Spacer(1, 10))
    
    story.append(Paragraph("<b>Premium Lease (English Segment):</b>", style_h1))
    story.append(Paragraph(
        "<i>This license agreement grants Licensee a non-exclusive license to use the Beat for up to 200,000 audio streams "
        "and 1 monetized video on YouTube (up to 200,000 views). Sossa Music LLC retains 100% ownership of the Master recording "
        "and 100% of the musical composition (Publishing rights). Composer credit must be registered as: "
        "Joao David Dominguez Sosa (BMI) / Sossa Music LLC (50% Writer Share / 50% Publisher Share).</i>",
        style_quote_en
    ))
    
    story.append(Paragraph("<b>Licencia Premium (Segmento en Español):</b>", style_h1))
    story.append(Paragraph(
        "<i>Esta licencia otorga al Licenciatario una licencia no exclusiva para usar el Beat con un límite de hasta 200,000 "
        "reproducciones de audio y 1 video monetizado en YouTube (hasta 200,000 vistas). Sossa Music LLC retiene el 100% del Master "
        "y el 100% del Publishing. El crédito de compositor debe registrarse como: "
        "Joao David Dominguez Sosa (BMI) / Sossa Music LLC (50% Escritor / 50% Editor).</i>",
        style_quote_es
    ))
    
    # ── Page 3: Ilimitada & Exclusiva ─────────────────────────────────────────
    story.append(PageBreak())
    
    story.append(create_badge("LICENCIA ILIMITADA", SECONDARY_COLOR))
    story.append(Spacer(1, 10))
    
    story.append(Paragraph("<b>Unlimited Lease (English Segment):</b>", style_h1))
    story.append(Paragraph(
        "<i>Licensor grants Licensee a non-exclusive license for unlimited audio streams, unlimited monetized music videos, "
        "and unlimited profit-generating live performances. Sossa Music LLC retains 100% of the Master recording and 100% "
        "of the composition (Publishing rights). No refunds or chargebacks allowed.</i>",
        style_quote_en
    ))
    
    story.append(Paragraph("<b>Licencia Ilimitada (Segmento en Español):</b>", style_h1))
    story.append(Paragraph(
        "<i>El Licenciante otorga al Licenciatario una licencia no exclusiva para reproducciones de audio ilimitadas, "
        "videos musicales monetizados ilimitados y presentaciones con fines de lucro ilimitadas. Sossa Music LLC retiene "
        "el 100% de la propiedad del Master y el 100% del Publishing. No se admiten reembolsos ni contracargos.</i>",
        style_quote_es
    ))
    
    story.append(create_hr())
    
    story.append(create_badge("LICENCIA EXCLUSIVA", ACCENT_COLOR))
    story.append(Spacer(1, 10))
    
    story.append(Paragraph("<b>Exclusive License (English Segment):</b>", style_h1))
    story.append(Paragraph(
        "<i>Licensor transfers 100% exclusive ownership of the Master Recording to Licensee. Licensor will no longer license "
        "this Beat. This agreement strictly EXCLUDES the transfer of composition rights (Publishing). Licensor retains "
        "50% of the Writer's Share and 50% of the Publisher's Share. Registration split must be: "
        "Composer/Writer (50%): Joao David Dominguez Sosa (BMI) / Publisher (50%): Sossa Music LLC.</i>",
        style_quote_en
    ))
    
    story.append(Paragraph("<b>Licencia Exclusiva (Segmento en Español):</b>", style_h1))
    story.append(Paragraph(
        "<i>El Licenciante transfiere al Licenciatario la propiedad 100% exclusiva del Master (audio) de la canción. "
        "El Licenciante no volverá a licenciar este Beat. Este acuerdo EXCLUYE estrictamente los derechos de composición (Publishing). "
        "El Licenciante retiene el 50% del Writer's Share (Escritor) y el 50% del Publisher's Share (Editor). Registro: "
        "Compositor/Escritor (50%): Joao David Dominguez Sosa (BMI) / Editor (50%): Sossa Music LLC.</i>",
        style_quote_es
    ))
    
    doc.build(story)
    print(f"✅ Muestra generada en: {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
