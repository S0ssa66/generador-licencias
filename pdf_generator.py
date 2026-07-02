import os
import re
import tempfile
import base64
import hashlib
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
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
        crypto_hash = getattr(self, 'crypto_hash', '')
        ref_code = getattr(self, 'ref_code', '')
        
        self.saveState()
        self.setFont("Helvetica-Oblique", 8)
        self.setFillColor(colors.HexColor("#718096"))
        
        hash_stamp = f"Cripto-Sello BEATSS: {crypto_hash[:32]}..." if crypto_hash else "Cripto-Sello BEATSS"
        if ref_code:
            hash_stamp += f" | Ref: {ref_code}"
            
        self.drawString(54, 30, hash_stamp)
        
        page_str = f"Página {self._pageNumber} de {page_count}"
        self.drawRightString(self._pagesize[0] - 54, 30, page_str)
        self.restoreState()

def clean_inline_markdown(text):
    text = re.sub(r'\*\*(.*?)\*\*|__(.*?)__', r'<b>\1\2</b>', text)
    text = re.sub(r'\*(.*?)\*|_(.*?)_', r'<i>\1\2</i>', text)
    text = re.sub(r'\[(.*?)\]\((.*?)\)', r'<a href="\2" color="blue"><u>\1</u></a>', text)
    return text

def markdown_to_flowables(md_text, styles):
    flowables = []
    lines = md_text.split('\n')
    
    in_list = False
    list_items = []
    
    in_table = False
    table_rows = []
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        if line.startswith('|'):
            if in_list:
                for item in list_items:
                    flowables.append(Paragraph(f"&bull; {item}", styles['NormalStyle']))
                    flowables.append(Spacer(1, 4))
                in_list = False
                list_items = []
                
            in_table = True
            cells = [clean_inline_markdown(c.strip()) for c in line.split('|')[1:-1]]
            if not all(re.match(r'^:?-+:?$', c) for c in cells):
                table_rows.append(cells)
            i += 1
            continue
        elif in_table:
            if table_rows:
                col_count = len(table_rows[0])
                col_width = 504 / col_count if col_count > 0 else 100
                t_data = []
                for row_idx, row in enumerate(table_rows):
                    t_row = []
                    for cell in row:
                        cell_style = styles['TableHeaderStyle'] if row_idx == 0 else styles['TableCellStyle']
                        t_row.append(Paragraph(cell, cell_style))
                    t_data.append(t_row)
                
                table = Table(t_data, colWidths=[col_width]*col_count)
                table.setStyle(TableStyle([
                    ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1a1d24")),
                    ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
                    ('ALIGN', (0,0), (-1,-1), 'LEFT'),
                    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 6),
                    ('TOPPADDING', (0,0), (-1,-1), 6),
                    ('LEFTPADDING', (0,0), (-1,-1), 6),
                    ('RIGHTPADDING', (0,0), (-1,-1), 6),
                    ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e0")),
                    ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#f8fafc")]),
                ]))
                flowables.append(table)
                flowables.append(Spacer(1, 12))
            in_table = False
            table_rows = []
            
        if line.startswith('- ') or line.startswith('* '):
            item_text = clean_inline_markdown(line[2:])
            list_items.append(item_text)
            in_list = True
            i += 1
            continue
        elif in_list and not (line.startswith('- ') or line.startswith('* ')):
            for item in list_items:
                flowables.append(Paragraph(f"&bull; {item}", styles['NormalStyle']))
                flowables.append(Spacer(1, 3))
            flowables.append(Spacer(1, 8))
            in_list = False
            list_items = []
            
        if not line:
            flowables.append(Spacer(1, 6))
            i += 1
            continue
            
        if line.startswith('### '):
            flowables.append(Paragraph(clean_inline_markdown(line[4:]), styles['H3Style']))
            flowables.append(Spacer(1, 6))
        elif line.startswith('## '):
            flowables.append(Paragraph(clean_inline_markdown(line[3:]), styles['H2Style']))
            flowables.append(Spacer(1, 8))
        elif line.startswith('# '):
            flowables.append(Paragraph(clean_inline_markdown(line[2:]), styles['H1Style']))
            flowables.append(Spacer(1, 10))
        else:
            flowables.append(Paragraph(clean_inline_markdown(line), styles['NormalStyle']))
            flowables.append(Spacer(1, 8))
            
        i += 1
        
    if in_list:
        for item in list_items:
            flowables.append(Paragraph(f"&bull; {item}", styles['NormalStyle']))
            flowables.append(Spacer(1, 3))
            
    return flowables

def generate_pdf_from_contract(filename, md_content, data_fields):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    
    styles = {
        'H1Style': ParagraphStyle(
            'H1',
            fontName='Helvetica-Bold',
            fontSize=16,
            leading=20,
            textColor=colors.HexColor("#1a202c"),
            spaceAfter=10,
            keepWithNext=True
        ),
        'H2Style': ParagraphStyle(
            'H2',
            fontName='Helvetica-Bold',
            fontSize=12,
            leading=16,
            textColor=colors.HexColor("#2d3748"),
            spaceAfter=8,
            keepWithNext=True
        ),
        'H3Style': ParagraphStyle(
            'H3',
            fontName='Helvetica-Bold',
            fontSize=10,
            leading=13,
            textColor=colors.HexColor("#4a5568"),
            spaceAfter=6,
            keepWithNext=True
        ),
        'NormalStyle': ParagraphStyle(
            'Normal',
            fontName='Helvetica',
            fontSize=9,
            leading=12.5,
            textColor=colors.HexColor("#2d3748"),
            spaceAfter=6
        ),
        'TableHeaderStyle': ParagraphStyle(
            'TableHeader',
            fontName='Helvetica-Bold',
            fontSize=8.5,
            leading=11,
            textColor=colors.whitesmoke
        ),
        'TableCellStyle': ParagraphStyle(
            'TableCell',
            fontName='Helvetica',
            fontSize=8,
            leading=10.5,
            textColor=colors.HexColor("#2d3748")
        ),
        'SignatureLabelStyle': ParagraphStyle(
            'SigLabel',
            fontName='Helvetica-Bold',
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#4a5568"),
            alignment=1
        ),
        'SignatureValueStyle': ParagraphStyle(
            'SigVal',
            fontName='Helvetica',
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#718096"),
            alignment=1
        )
    }
    
    story = []
    
    aka = data_fields.get('aka', 'SOSSA').upper()
    logo_base64 = data_fields.get('logoBase64', '')
    
    logo_temp_path = None
    if logo_base64:
        try:
            if ',' in logo_base64:
                logo_base64 = logo_base64.split(',')[1]
            logo_data = base64.b64decode(logo_base64)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temp_logo:
                temp_logo.write(logo_data)
                logo_temp_path = temp_logo.name
        except Exception as e:
            print(f"Warning: Failed to decode logoBase64: {e}")
            
    if logo_temp_path:
        try:
            story.append(Image(logo_temp_path, height=45, width=120))
            story.append(Spacer(1, 15))
        except Exception as e:
            print(f"Warning: Failed to add logo Image to story: {e}")
            
    story.extend(markdown_to_flowables(md_content, styles))
    story.append(Spacer(1, 25))
    
    sig_data = []
    
    producer_signature = data_fields.get('producerSignatureBase64') or data_fields.get('signature') or ''
    producer_img_path = None
    if producer_signature:
        try:
            if ',' in producer_signature:
                producer_signature = producer_signature.split(',')[1]
            sig_data_bytes = base64.b64decode(producer_signature)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temp_sig:
                temp_sig.write(sig_data_bytes)
                producer_img_path = temp_sig.name
        except Exception as e:
            print(f"Warning: Failed to decode producer signature: {e}")
    else:
        # Fallback to local files if it matches sossa or monarco
        producer_id = data_fields.get('producerId', 'sossa').lower()
        aka = data_fields.get('aka', 'SOSSA').lower()
        local_path = None
        if 'monarco' in aka or producer_id == 'cgmonarco':
            local_path = os.path.join(os.path.dirname(__file__), 'public', 'firma-cgmonarco.png')
        elif 'sossa' in aka or producer_id == 'sossa':
            local_path = os.path.join(os.path.dirname(__file__), 'public', 'firma-sossa.png')
            
        if local_path and os.path.exists(local_path):
            try:
                with open(local_path, 'rb') as f:
                    sig_data_bytes = f.read()
                with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temp_sig:
                    temp_sig.write(sig_data_bytes)
                    producer_img_path = temp_sig.name
            except Exception as e:
                print(f"Warning: Failed to copy local signature: {e}")
            
    buyer_signature = data_fields.get('buyerSignatureBase64') or data_fields.get('buyerSignature') or ''
    buyer_img_path = None
    needs_buyer = data_fields.get('needsBuyerSignature', True)
    if needs_buyer and buyer_signature:
        try:
            if ',' in buyer_signature:
                buyer_signature = buyer_signature.split(',')[1]
            sig_data_bytes = base64.b64decode(buyer_signature)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temp_sig:
                temp_sig.write(sig_data_bytes)
                buyer_img_path = temp_sig.name
        except Exception as e:
            print(f"Warning: Failed to decode buyer signature: {e}")
            
    if needs_buyer:
        # Reestructuración de firmas en tabla de múltiples filas para alineación garantizada
        row_images = []
        # Productor
        if producer_img_path:
            try:
                row_images.append(Image(producer_img_path, width=120, height=45))
            except Exception:
                row_images.append(Paragraph("<font name='Times-Italic' size=14 color='#1c1c1e'><i>" + data_fields.get('producerName', 'Joao David Dominguez') + "</i></font>", styles['SignatureValueStyle']))
        else:
            row_images.append(Paragraph("<font name='Times-Italic' size=14 color='#1c1c1e'><i>" + data_fields.get('producerName', 'Joao David Dominguez') + "</i></font>", styles['SignatureValueStyle']))

        # Comprador
        if buyer_img_path:
            try:
                row_images.append(Image(buyer_img_path, width=120, height=45))
            except Exception:
                row_images.append(Spacer(1, 45))
        else:
            row_images.append(Spacer(1, 45))

        # Fila 1: Línea de firma
        row_lines = [
            Paragraph("_____________________________", styles['SignatureValueStyle']),
            Paragraph("_____________________________", styles['SignatureValueStyle'])
        ]

        # Fila 2: Rol
        row_roles = [
            Paragraph(data_fields.get('producerRole', 'El Licenciante (Productor)'), styles['SignatureLabelStyle']),
            Paragraph(data_fields.get('buyerRole', 'El Licenciatario (Usuario)'), styles['SignatureLabelStyle'])
        ]

        # Fila 3: Nombre
        row_names = [
            Paragraph(data_fields.get('producerName', 'Joao David Dominguez'), styles['SignatureValueStyle']),
            Paragraph(data_fields.get('buyerName', 'Jair Yepez'), styles['SignatureValueStyle'])
        ]

        # Fila 4: Identificación (Auto-detectar RUC)
        producer_id = str(data_fields.get('producerIdNum') or data_fields.get('producerId', '0803743111')).strip()
        producer_id_label = "RUC (Ecuador):" if len(producer_id) == 13 else "Identificación/RUT:"
        
        buyer_id = str(data_fields.get('buyerId', '0803743111')).strip()
        buyer_id_label = "RUC (Ecuador):" if len(buyer_id) == 13 else "Identificación/RUT:"

        row_ids = [
            Paragraph(f"{producer_id_label} {producer_id}", styles['SignatureValueStyle']),
            Paragraph(f"{buyer_id_label} {buyer_id}", styles['SignatureValueStyle'])
        ]

        # Fila 5: Metadata adicional (AKA o DocuSign)
        row_metas = [
            Paragraph(f"AKA: {data_fields.get('aka', 'Sossa')}", styles['SignatureValueStyle']),
            Paragraph("Firma vía DocuSign / Electrónica", styles['SignatureValueStyle'])
        ]

        sig_data = [
            row_images,
            row_lines,
            row_roles,
            row_names,
            row_ids,
            row_metas
        ]

        sig_table = Table(sig_data, colWidths=[252, 252])
        sig_table.setStyle(TableStyle([
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('TOPPADDING', (0,0), (-1,-1), 1),
            ('BOTTOMPADDING', (0,0), (-1,-1), 1),
        ]))
        
        story.append(KeepTogether([sig_table]))
    else:
        # Tarjeta de aceptado vía pago centrada (para licencias no exclusivas)
        accept_style_title = ParagraphStyle(
            'AcceptTitle',
            parent=styles['SignatureValueStyle'],
            textColor=colors.HexColor("#10b981"),
            fontSize=11,
            leading=13,
            alignment=1, # Center
            fontName='Helvetica-Bold'
        )
        accept_style_body = ParagraphStyle(
            'AcceptBody',
            parent=styles['SignatureLabelStyle'],
            textColor=colors.HexColor("#4a5568"),
            fontSize=8,
            leading=11,
            alignment=1 # Center
        )
        
        ref_code = data_fields.get('refCode', 'REF')
        raw_date = data_fields.get('date', '')
        
        # Formatear fecha de YYYY-MM-DD a formato amigable según el idioma
        date_display = raw_date
        lang = data_fields.get('lang', 'es')
        if raw_date and '-' in raw_date:
            try:
                parts = raw_date.split('-')
                if len(parts) == 3:
                    year = parts[0]
                    month_num = int(parts[1])
                    day_num = int(parts[2])
                    
                    if lang == 'en':
                        months_en = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
                        date_display = f"{months_en[month_num - 1]} {day_num}, {year}"
                    else:
                        months_es = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
                        date_display = f"{day_num} de {months_es[month_num - 1]} de {year}"
            except Exception as e:
                print(f"Warning: Failed to format date in PDF: {e}")
                
        if lang == 'en':
            accept_title_text = "<b>✓ Accepted via Payment</b>"
            accept_body_text = f"This agreement does not require a physical signature in accordance with the platform terms and conditions, and the payment registered electronically on <b>{date_display}</b> under reference: <b>{ref_code}</b>."
        else:
            accept_title_text = "<b>✓ Aceptado vía Pago</b>"
            accept_body_text = f"Este acuerdo no requiere firma física de conformidad con los términos y condiciones de la plataforma y el pago registrado de manera electrónica el <b>{date_display}</b> bajo la referencia: <b>{ref_code}</b>."
            
        accept_content = [
            Paragraph(accept_title_text, accept_style_title),
            Spacer(1, 4),
            Paragraph(accept_body_text, accept_style_body)
        ]
        
        accept_table = Table([[accept_content]], colWidths=[360])
        accept_table.setStyle(TableStyle([
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f0fff4")), # Fondo verde claro
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#10b981")),     # Borde verde
            ('TOPPADDING', (0,0), (-1,-1), 10),
            ('BOTTOMPADDING', (0,0), (-1,-1), 10),
            ('LEFTPADDING', (0,0), (-1,-1), 15),
            ('RIGHTPADDING', (0,0), (-1,-1), 15),
        ]))
        
        story.append(KeepTogether([accept_table]))
    
    hash_data = f"{data_fields.get('refCode')}|{data_fields.get('beatName')}|{data_fields.get('buyerName')}|{data_fields.get('buyerEmail')}|{data_fields.get('value')}|{data_fields.get('date')}|{aka}"
    crypto_hash = hashlib.sha256(hash_data.encode('utf-8')).hexdigest()
    
    canvas_maker = NumberedCanvas
    canvas_maker.crypto_hash = crypto_hash
    canvas_maker.ref_code = data_fields.get('refCode', '')
    
    doc.build(story, canvasmaker=canvas_maker)
    
    for path in [logo_temp_path, producer_img_path, buyer_img_path]:
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except Exception:
                pass
                
    return crypto_hash
