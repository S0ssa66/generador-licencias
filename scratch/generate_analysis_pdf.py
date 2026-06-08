# /// script
# dependencies = [
#   "fpdf2",
# ]
# ///

import os
import sys
from fpdf import FPDF

class BEATSSReport(FPDF):
    def header(self):
        # Top banner decoration
        self.set_fill_color(15, 23, 42) # Dark navy Blue
        self.rect(0, 0, 210, 15, 'F')
        
        # Title in header
        self.set_font('Helvetica', 'B', 8)
        self.set_text_color(255, 255, 255)
        self.set_xy(10, 5)
        self.cell(0, 5, 'BEATSS PLATFORM - CODEBASE & SYSTEM ARCHITECTURE REPORT', align='L')
        self.set_xy(190, 5)
        self.cell(0, 5, 'CONFIDENTIAL', align='R')
        
        # Reset colors and positions
        self.set_text_color(30, 41, 59)
        self.set_y(20)

    def footer(self):
        # Position at 1.5 cm from bottom
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(148, 163, 184)
        self.cell(0, 10, f'Página {self.page_no()}', align='R')
        self.set_x(10)
        self.cell(0, 10, 'BEATSS SaaS © 2026 - Analítica y Auditoría Técnica', align='L')

def get_file_stats(filepath):
    try:
        if not os.path.exists(filepath):
            return "N/A", "N/A"
        size_kb = os.path.getsize(filepath) / 1024.0
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            lines = sum(1 for _ in f)
        return f"{size_kb:.1f} KB", f"{lines} líneas"
    except Exception as e:
        return "Error", str(e)

def generate_pdf():
    pdf = BEATSSReport()
    pdf.set_margins(left=15, top=20, right=15)
    pdf.add_page()
    
    # Title
    pdf.ln(5)
    pdf.set_font('Helvetica', 'B', 20)
    pdf.set_text_color(30, 41, 59)
    pdf.cell(0, 10, 'ANÁLISIS DE ARQUITECTURA Y CÓDIGO', align='L')
    pdf.ln(6)
    pdf.set_font('Helvetica', 'B', 14)
    pdf.set_text_color(230, 0, 0) # CG Monarco Red
    pdf.cell(0, 8, 'Plataforma SaaS BEATSS', align='L')
    pdf.ln(10)
    
    # Metadata Box
    pdf.set_fill_color(248, 250, 252) # Slate 50
    pdf.set_draw_color(226, 232, 240) # Slate 200
    pdf.rect(15, pdf.get_y(), 180, 28, 'DF')
    
    pdf.set_font('Helvetica', 'B', 9)
    pdf.set_text_color(71, 85, 105)
    pdf.set_xy(18, pdf.get_y() + 3)
    pdf.cell(40, 5, 'Documento:')
    pdf.set_font('Helvetica', '', 9)
    pdf.cell(100, 5, 'Auditoría de Código y Resumen de Sistema')
    
    pdf.set_font('Helvetica', 'B', 9)
    pdf.set_xy(18, pdf.get_y() + 5)
    pdf.cell(40, 5, 'Plataforma:')
    pdf.set_font('Helvetica', '', 9)
    pdf.cell(100, 5, 'BEATSS (Generador de Licencias y Contratos SaaS)')
    
    pdf.set_font('Helvetica', 'B', 9)
    pdf.set_xy(18, pdf.get_y() + 5)
    pdf.cell(40, 5, 'Propietario / Admin:')
    pdf.set_font('Helvetica', '', 9)
    pdf.cell(100, 5, 'Sossa (sossabeatz1@gmail.com)')
    
    pdf.set_font('Helvetica', 'B', 9)
    pdf.set_xy(18, pdf.get_y() + 5)
    pdf.cell(40, 5, 'Fecha de Generación:')
    pdf.set_font('Helvetica', '', 9)
    pdf.cell(100, 5, '7 de junio de 2026')
    
    pdf.set_xy(15, 65)
    
    # Section 1: Resumen General
    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 8, '1. Resumen Ejecutivo de la Aplicación', align='L')
    pdf.ln(8)
    
    pdf.set_font('Helvetica', '', 9.5)
    pdf.set_text_color(51, 65, 85)
    intro_text = (
        "BEATSS es una plataforma de software como servicio (SaaS) diseñada especialmente para productores musicales "
        "e ingenieros de sonido. Su propósito primordial es facilitar la creación, firma electrónica, envío y almacenamiento "
        "de contratos de licencias de uso musical. La plataforma permite a los productores generar licencias personalizadas "
        "con validez legal al instante, configurar firmas digitales mediante la integración con DocuSign, y almacenar "
        "un catálogo de instrumentales (Beats) sincrónico con la nube.\n\n"
        "La interfaz está construida con una estética premium de tema oscuro orientada a artistas independientes, contando "
        "con pestañas de previsualización activa del contrato en papel, un historial completo con filtros inteligentes, "
        "un dashboard de analíticas de ventas con gráficas vectoriales SVG, y un completo panel de contabilidad general "
        "consolidado para el rol de Sossa Admin."
    )
    pdf.multi_cell(0, 5, intro_text)
    pdf.ln(6)
    
    # Section 2: Estadísticas de Archivos
    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 8, '2. Inventario de Código y Métricas de Archivos', align='L')
    pdf.ln(8)
    
    files_to_check = [
        ("Interfaz Principal", "index.html"),
        ("Lógica del Cliente", "main.js"),
        ("Estilos e Identidad", "styles.css"),
        ("Parámetros y Textos Base", "config.js"),
        ("Traducciones e Idiomas", "i18n.js"),
        ("Configuración Firebase", "firebase.js"),
        ("Reglas de Seguridad DB", "firestore.rules"),
        ("Reglas del Servidor API", "vercel.json")
    ]
    
    # Table Header
    pdf.set_fill_color(226, 232, 240)
    pdf.set_font('Helvetica', 'B', 9)
    pdf.cell(50, 7, ' Componente', border=1, fill=True)
    pdf.cell(50, 7, ' Archivo', border=1, fill=True)
    pdf.cell(40, 7, ' Peso en Disco', border=1, fill=True)
    pdf.cell(40, 7, ' Total Líneas', border=1, fill=True)
    pdf.ln(7)
    
    pdf.set_font('Helvetica', '', 9)
    for label, filename in files_to_check:
        filepath = os.path.join("/Users/sossa/IA/generador-licencias", filename)
        size, lines = get_file_stats(filepath)
        pdf.cell(50, 7, f" {label}", border=1)
        pdf.cell(50, 7, f" {filename}", border=1)
        pdf.cell(40, 7, f" {size}", border=1)
        pdf.cell(40, 7, f" {lines}", border=1)
        pdf.ln(7)
    
    pdf.ln(10)
    
    # Page 2: Architecture & SaaS Tiers
    pdf.add_page()
    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 8, '3. Arquitectura del Sistema y Capas Tecnológicas', align='L')
    pdf.ln(8)
    
    pdf.set_font('Helvetica', '', 9.5)
    pdf.set_text_color(51, 65, 85)
    
    tech_text = (
        "La plataforma adopta una arquitectura desacoplada y moderna (Jamstack) optimizada para tiempos de respuesta rápidos, "
        "alta seguridad y compatibilidad en modo desconectado:\n\n"
        "- Frontend (HTML5 / Vanilla CSS3 / Client JS): Todo el procesamiento se realiza en el navegador del cliente. La interfaz es "
        "responsiva mediante grids y flexboxes detallados, y se compila para producción utilizando Vite. Cuenta con soporte PWA "
        "(Service Worker en sw.js) que almacena en caché archivos estáticos y librerías críticas de generación de PDF (html2pdf) "
        "y ZIP (jszip), permitiendo usar la aplicación al instante sin internet.\n"
        "- Base de Datos (Cloud Firestore): Almacena de forma no relacional y en tiempo real el perfil del productor, "
        "el catálogo de beats, las plantillas personalizadas de contratos, las licencias emitidas y los registros del sistema.\n"
        "- Backend Serverless (Vercel API): Endpoints seguros escritos en NodeJS ejecutados en la nube para procesos que involucran "
        "seguridad o APIs de terceros:\n"
        "  1. redemption-vip (api/redeem-vip.js): Canje seguro de códigos promocionales VIP en la base de datos de Firestore.\n"
        "  2. PayPal Payment Capturing (api/activate-pro.js): Captura transacciones y activa planes Pro o Elite en el lado del servidor.\n"
        "- Autenticación (Firebase Auth): Maneja de manera robusta el registro e inicio de sesión de usuarios con correo/contraseña "
        "y mediante proveedores OAuth de Google."
    )
    pdf.multi_cell(0, 5, tech_text)
    pdf.ln(6)
    
    # Section 4: SaaS Levels
    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 8, '4. Niveles de Membresía y Programa de Afiliados', align='L')
    pdf.ln(8)
    
    saas_text = (
        "BEATSS implementa un esquema comercial de tres niveles de membresía (SaaS Tiers) con límites y funciones específicas:\n\n"
        "1. Plan Inicial (Gratuito): Límite estricto de generación de 3 licencias mensuales. Los contratos generados incluyen una marca de "
        "agua con el texto 'BEATSS - PLAN GRATUITO'. Los correos se envían usando la cuenta fallback predeterminada de BEATSS.\n"
        "2. Plan Pro ($9.99/mes): Remueve los límites mensuales y elimina la marca de agua del PDF. Permite personalizar plantillas, "
        "subir un logotipo de marca dinámico (comprimido en canvas), conectar Google Drive en carpetas personalizadas e integrar credenciales "
        "propias de EmailJS y DocuSign.\n"
        "3. Plan Elite ($29.99/mes): Hereda todas las capacidades del Plan Pro y añade un esquema de personalización avanzado "
        "y prioridad de soporte en el dashboard.\n"
        "4. Programa de Referidos: Cada usuario tiene un enlace de afiliado único (?ref=UID) en su panel lateral. Al registrarse un referido, "
        "la base de datos crea una relación en la colección /referrals. El sistema lee estas relaciones en tiempo real y muestra un "
        "contador de invitados exitosos en la barra del usuario."
    )
    pdf.multi_cell(0, 5, saas_text)
    pdf.ln(6)
    
    # Page 3: DB Schema & Security
    pdf.add_page()
    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 8, '5. Estructura de la Base de Datos (Esquema Firestore)', align='L')
    pdf.ln(8)
    
    db_text = (
        "El modelo de datos está estructurado en colecciones principales y subcolecciones anidadas para resguardar la privacidad:\n\n"
        "A. Colección '/users/{uid}': Documento raíz con metadatos del usuario. Contiene el plan del usuario ('inicial', 'pro', 'elite') "
        "y la fecha de activación.\n"
        "  - Subcolección 'config/producer': Guarda la información de firma, IPI, PRO, dirección, teléfono, parámetros de EmailJS, "
        "credenciales de DocuSign, y la imagen del logotipo del productor codificada en base64 comprimido.\n"
        "  - Subcolección 'beats/{beatId}': Catálogo de instrumentales del productor. Contiene nombre, BPM, escala musical, precio, "
        "y límites de reproducción de cada licencia.\n"
        "  - Subcolección 'templates/{templateId}': Plantillas de contratos personalizadas en formato Markdown.\n"
        "  - Subcolección 'licencias/{licenciaId}': Historial detallado de contratos generados por el productor.\n\n"
        "B. Colección '/vip_codes/{codeId}': Documentos de códigos VIP que guardan el plan a otorgar, duración en meses, estado "
        "(active: true/false), correo del usuario que lo canjeó (redeemedByEmail), UID (redeemedByUid) y fecha de canje.\n\n"
        "C. Colección '/payments/{paymentId}': Registros de solicitudes de activación manual por transferencia bancaria (Ecuador: Pichincha, "
        "Guayaquil, Deuna!). Contiene el correo del solicitante, UID, método de pago, referencia de transferencia, fecha, y url de la captura.\n\n"
        "D. Colección '/referrals/{referredUserId}': Registra las invitaciones efectivas. Vincula al usuario referido con el patrocinador (referredBy)."
    )
    pdf.multi_cell(0, 5, db_text)
    pdf.ln(6)
    
    # Section 6: Security and Rules
    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 8, '6. Reglas de Seguridad y Autorización (Security Rules)', align='L')
    pdf.ln(8)
    
    rules_text = (
        "La seguridad e integridad de la base de datos se mantiene mediante reglas estrictas en firestore.rules:\n\n"
        "- Seguridad de Transacciones SaaS: Los usuarios comunes no pueden modificar directamente los campos de facturación "
        "(plan, expirationPro, redeemedCodes) en sus perfiles de Firestore. Los cambios de plan se realizan únicamente mediante "
        "los endpoints de servidor de Vercel. Las reglas solo permiten degradaciones del plan directas desde el cliente por caducidad.\n"
        "- Privacidad por Usuario: Cada usuario (UID) tiene acceso exclusivo de lectura y escritura a sus subcolecciones personales "
        "(beats, templates, licencias).\n"
        "- Acceso Sossa Admin: La cuenta sossabeatz1@gmail.com está configurada en las reglas con permisos globales de superusuario. "
        "Puede leer y escribir en toda la base de datos, incluyendo la ejecución de consultas consolidadas globales (collectionGroup) "
        "sobre 'config/producer' (para listar productores registrados), 'payments' (para aprobar pagos de transferencias manuales) "
        "y 'licencias' (para la contabilidad consolidada global)."
    )
    pdf.multi_cell(0, 5, rules_text)
    
    # Save PDF
    target_path = "/Users/sossa/IA/generador-licencias/public/Analisis_Codigo_BEATSS.pdf"
    pdf.output(target_path)
    
    # Also save to workspace root for convenience
    pdf.output("/Users/sossa/IA/Analisis_Codigo_BEATSS.pdf")
    
    print(f"PDF Analysis generated successfully at: {target_path}")

if __name__ == "__main__":
    generate_pdf()
