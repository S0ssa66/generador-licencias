#!/usr/bin/env python3
"""
Genera las 5 licencias reales del sistema inyectando las nuevas variables
y resolviendo los 6 vacíos detectados para blindar legalmente el catálogo de Sossa Music LLC.
"""
import os
import re
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pdf_generator import generate_pdf_from_contract

CONFIG_PATH = "config.js"
OUTPUT_DIR = os.path.expanduser("~/Desktop/Licencias_SossaMusic_Analisis")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Transacción simulada base
base_payload = {
    "beatName": "[Nombre del Beat]",
    "beatBpm": "95",
    "beatKey": "G Minor",
    "buyerName": "[Nombre del Comprador]",
    "buyerId": "[Cédula/DNI]",
    "buyerEmail": "[Correo del Comprador]",
    "buyerPhone": "+593 99 999 9999",
    "buyerCity": "Quito",
    "buyerCountry": "Ecuador",
    "timestamp": "2026-07-05T02:00:00Z",
    "method": "Transferencia Bancaria",
    "crypto_hash": "e987c823a012b3d4f5e6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8",
    
    # Productor (Sossa Music LLC)
    "aka": "Sossa",
    "producerName": "Joao David Dominguez",
    "producerId": "0803743111001",
    "producerEmail": "masterjuego25@gmail.com",
    "producerPhone": "+593 96 120 1184",
    "producerPro": "BMI",
    "producerIpi": "01170943066",
    "producerPublisher": "Songtrust",
}

# Configuración específica de cada tipo de licencia
licenses_data = {
    "basic": {
        "filename": "1_Licencia_Basica_SossaMusic.pdf",
        "license_type": "Básica",
        "license_exclusivity": "No Exclusiva",
        "license_exclusivity_lower": "no exclusiva",
        "needsBuyerSignature": False,
        "price": 30.00,
        "price_letters": "treinta con 00/100",
        "reference": "LIC-BAS-20260705-1001",
        "formats": "MP3",
        "streams": "40,000",
        "physical": "500",
        "videos": "un (1) video",
        "videoDuration": "5 minutos",
        "years": "5 años",
        "terminationFee": "$60.00 USD (200% del valor)",
        "writerShare": 50,
        "producerShare": 50,
        "credits": '"Producido por sossa" o "Prod. por sossa"'
    },
    "premium": {
        "filename": "2_Licencia_Premium_SossaMusic.pdf",
        "license_type": "Premium",
        "license_exclusivity": "No Exclusiva",
        "license_exclusivity_lower": "no exclusiva",
        "needsBuyerSignature": False,
        "price": 60.00,
        "price_letters": "sesenta con 00/100",
        "reference": "LIC-PREM-20260705-2002",
        "formats": "MP3 y WAV",
        "streams": "100,000",
        "physical": "3,000",
        "videos": "dos (2) videos",
        "videoDuration": "10 minutos",
        "years": "10 años",
        "terminationFee": "$120.00 USD (200% del valor)",
        "writerShare": 50,
        "producerShare": 50,
        "credits": '"Producido por sossa" o "Prod. por sossa"'
    },
    "premium_plus": {
        "filename": "3_Licencia_Premium_Plus_SossaMusic.pdf",
        "license_type": "Premium Plus",
        "license_exclusivity": "No Exclusiva",
        "license_exclusivity_lower": "no exclusiva",
        "needsBuyerSignature": False,
        "price": 100.00,
        "price_letters": "cien con 00/100",
        "reference": "LIC-PPLUS-20260705-3003",
        "formats": "MP3, WAV y Stems (Trackouts)",
        "streams": "100,000,000 (Ilimitados)",
        "physical": "Ilimitadas",
        "videos": "Ilimitados",
        "videoDuration": "Ilimitada",
        "years": "Perpetua / De por vida", # Corregido a perpetuo
        "terminationFee": "$200.00 USD (200% del valor)",
        "writerShare": 50,
        "producerShare": 50,
        "credits": '"Producido por sossa" o "Prod. por sossa"'
    },
    "unlimited_flp": {
        "filename": "4_Licencia_Ilimitada_SossaMusic.pdf",
        "license_type": "Ilimitada",
        "license_exclusivity": "No Exclusiva",
        "license_exclusivity_lower": "no exclusiva",
        "needsBuyerSignature": False,
        "price": 200.00,
        "price_letters": "doscientos con 00/100",
        "reference": "LIC-UNLIM-20260705-4004",
        "formats": "MP3, WAV y Stems de la pista",
        "streams": "100,000,000 (Ilimitados)",
        "physical": "Ilimitadas",
        "videos": "Ilimitados",
        "videoDuration": "Ilimitada",
        "years": "Perpetua / De por vida", # Corregido a perpetuo
        "terminationFee": "$400.00 USD (200% del valor)",
        "writerShare": 50,
        "producerShare": 50,
        "credits": '"Producido por sossa" o "Prod. por sossa"'
    },
    "exclusive": {
        "filename": "5_Licencia_Exclusiva_SossaMusic.pdf",
        "license_type": "Exclusiva",
        "license_exclusivity": "Exclusiva",
        "license_exclusivity_lower": "exclusiva",
        "needsBuyerSignature": True,
        "price": 500.00,
        "price_letters": "quinientos con 00/100",
        "reference": "LIC-EXCL-20260705-5005",
        "formats": "MP3, WAV, Stems (Trackouts) y Proyecto FLP",
        "streams": "Ilimitados",
        "physical": "Ilimitadas",
        "videos": "Ilimitados",
        "videoDuration": "Ilimitada",
        "years": "Perpetua / De por vida",
        "terminationFee": "No aplica (Exclusivo)",
        "writerShare": 50,
        "producerShare": 50,
        "credits": '"Producido por sossa" o "Prod. por sossa"'
    }
}

def extract_template_from_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    
    match = re.search(r"export\s+const\s+DEFAULT_TEMPLATES\s*=\s*\[(.*?)\];", content, re.DOTALL)
    if not match:
        raise ValueError("No se pudo encontrar DEFAULT_TEMPLATES en config.js")
    
    templates_str = match.group(1)
    
    md_match = re.search(r"id:\s*\"licencia_uso\".*?markdown:\s*`([^`]+)`", templates_str, re.DOTALL)
    if not md_match:
        raise ValueError("No se pudo extraer el markdown de la plantilla licencia_uso")
    
    return md_match.group(1)

def main():
    try:
        markdown_template = extract_template_from_config()
        
        for key, config in licenses_data.items():
            payload = base_payload.copy()
            payload["licenseType"] = key
            payload["price"] = config["price"]
            payload["finalPrice"] = config["price"]
            payload["reference"] = config["reference"]
            payload["refCode"] = config["reference"]
            payload["needsBuyerSignature"] = config["needsBuyerSignature"]
            payload["formats"] = config["formats"]
            
            if config["needsBuyerSignature"]:
                payload["producerSignatureBase64"] = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
                payload["buyerSignatureBase64"] = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

            is_exclusive = (key == "exclusive")
            
            # 1. Declaración legal del productor (Sossa Music LLC)
            producer_legal_declaration = (
                "**Sossa Music LLC**, una compañía de responsabilidad limitada constituida bajo las leyes del Estado de Nuevo México, EE. UU., representada legalmente por su Gerente **Joao David Dominguez** (quien opera bajo el seudónimo profesional de **Sossa**)"
            )
            
            # 2. Jurisdicción y ley aplicable (Nuevo México)
            laws_jurisdiction = "el Estado de Nuevo México, Estados Unidos de América"
            jurisdiction_place = "los tribunales del Estado de Nuevo México, EE. UU."
            
            # 3. Reglas de sincronización comercial
            if is_exclusive:
                clause_sync_rules = (
                    "Se concede al Licenciatario el derecho ilimitado y perpetuo de sincronizar la Nueva Canción en producciones audiovisuales (tales como cine, televisión, cortometrajes, videojuegos o comerciales publicitarios de marcas). No obstante, el Productor retiene su participación del 50% de las regalías de composición (Publishing / Writer's Share) administradas a través de su sociedad de gestión colectiva (BMI / Songtrust) sobre cualquier explotación comercial de sincronización."
                )
            else:
                clause_sync_rules = (
                    "Queda expresamente prohibida la sincronización del Beat o de la Nueva Canción en producciones de cine, cortometrajes, programas de televisión, videojuegos o comerciales publicitarios de marcas de consumo masivo, salvo acuerdo y licenciamiento independiente con el Productor."
                )
                
            # 4. Cláusula de rescisión dinámica
            if is_exclusive:
                clause_rescission_title = "Irrevocabilidad del Acuerdo"
                clause_rescission_body = "Al tratarse de una transferencia de derechos exclusivos sobre el instrumental, el presente Contrato es definitivo, irrevocable y perpetuo. El Licenciante renuncia de forma expresa e irrevocable a cualquier facultad de rescisión unilateral o terminación anticipada una vez perfeccionada la compraventa."
            else:
                clause_rescission_title = "Opción de Rescisión del Licenciante (Cláusula de Salvaguarda)"
                clause_rescission_body = (
                    f"El Licenciante se reserva la facultad discrecional y la opción exclusiva, ejecutable dentro de los primeros **tres (3) años** a partir de la firma de este Contrato, de dar por terminado el presente acuerdo de forma anticipada y unilateral mediante notificación escrita. Para que esta rescisión surta efecto, el Licenciante pagará al Licenciatario una indemnización equivalente al **{config['terminationFee']}**. Tras la notificación y el pago de dicha penalidad, el Licenciatario dispondrá de un plazo máximo de siete (7) días para dar de baja y retirar la Nueva Canción de todos los canales de distribución físicos y digitales del mercado. El Licenciatario acepta expresamente que el pago de dicha penalidad constituye una indemnización total, única y final por la terminación del contrato, y renuncia irrevocablemente a reclamar cualquier otro valor, compensación o indemnización por concepto de daños, pérdidas, gastos de promoción, marketing, producción de videoclips o cualquier otra inversión realizada en relación con la Nueva Canción."
                )

            # Lugar de Celebración y Método de Pago
            celebration_place = "Celebrado de forma electrónica bajo la jurisdicción de Nuevo México, EE. UU."
            display_payment_method = "Procesamiento electrónico de pago autorizado (Stripe, PayPal, Deuna!)"
            
            is_perpetual = is_exclusive or key in ["premium_plus", "unlimited_flp"]
            clause_rescission_rules = (
                "Una vez vencido o perpetuo el acuerdo, los derechos se mantendrán según lo estipulado sin necesidad de renovación."
                if is_perpetual else
                "En consecuencia, esta licencia expirará automáticamente al cumplirse el término estipulado contados a partir de la fecha estipulada en el encabezado."
            )
            
            clause_content_id_rules = (
                "Al tratarse de una Licencia Exclusiva, el Licenciatario está facultado para la distribución digital estándar y el uso del sistema Content ID de manera controlada sobre su versión final (la Nueva Canción) siempre y cuando se abstenga estrictamente de reclamar la propiedad exclusiva o la monetización de la pista instrumental en sí misma, quedando obligado a incluir en lista blanca (*whitelist*) cualquier canción derivada legítima no exclusiva preexistente creada por otros licenciatarios antes de este acuerdo."
                if is_exclusive else
                "El Licenciatario tiene **estrictamente prohibido** registrar el Beat o la Nueva Canción en cualquier plataforma de identificación automatizada de contenido (*Content ID*, *Facebook Rights Manager*, *Identifyy*, o herramientas de distribución digital automáticas como TuneCore, CD Baby o DistroKid que indexen huellas de audio). Esta medida es obligatoria para resguardar los derechos de otros licenciatarios legítimos del mismo Beat. El material original ya ha sido indexado y protegido preventivamente por el Productor. El incumplimiento de esta norma provocará la revocación inmediata de la licencia."
            )
            
            vars = {
                "producer_name": payload["producerName"],
                "producer_aka": payload["aka"],
                "producer_id": payload["producerId"],
                "producer_email": payload["producerEmail"],
                "producer_phone": payload["producerPhone"],
                "producer_pro": payload["producerPro"],
                "producer_ipi": payload["producerIpi"],
                "producer_publisher": payload["producerPublisher"],
                
                "buyer_name": payload["buyerName"],
                "buyer_id": payload["buyerId"],
                "buyer_email": payload["buyerEmail"],
                "buyer_phone": payload["buyerPhone"],
                "buyer_city": payload["buyerCity"],
                "buyer_country": payload["buyerCountry"],
                
                "beat_name": payload["beatName"],
                "beat_bpm": f"({payload['beatBpm']} BPM)",
                "beat_key": payload["beatKey"],
                "license_value": f"{config['price']:.2f}",
                "license_value_letters": config["price_letters"],
                "ref_code": config["reference"],
                "effective_date": "Domingo, 05 de julio de 2026",
                "celebration_place": celebration_place,
                "payment_method": display_payment_method,
                "jurisdiction_city": "Quito",
                "current_year": "2026",
                
                "clause_formats": config["formats"],
                "clause_streams": config["streams"],
                "clause_physical": config["physical"],
                "clause_videos": config["videos"],
                "clause_video_duration": config["videoDuration"],
                "clause_years": config["years"],
                "clause_termination_fee": config["terminationFee"],
                "clause_writer_share": str(config["writerShare"]),
                "clause_producer_share": str(config["producerShare"]),
                "clause_credits": config["credits"],
                
                "license_type": config["license_type"],
                "license_exclusivity": config["license_exclusivity"],
                "license_exclusivity_lower": config["license_exclusivity_lower"],
                "clause_rescission_rules": clause_rescission_rules,
                "clause_content_id_rules": clause_content_id_rules,
                
                # Nuevas variables inyectadas
                "producer_legal_declaration": producer_legal_declaration,
                "laws_jurisdiction": laws_jurisdiction,
                "jurisdiction_place": jurisdiction_place,
                "clause_sync_rules": clause_sync_rules,
                "clause_rescission_title": clause_rescission_title,
                "clause_rescission_body": clause_rescission_body
            }
            
            # Compilar reemplazando {{variable}}
            compiled_md = markdown_template
            for k, val in vars.items():
                compiled_md = compiled_md.replace(f"{{{{{k}}}}}", val)
            
            output_filepath = os.path.join(OUTPUT_DIR, config["filename"])
            generate_pdf_from_contract(output_filepath, compiled_md, payload)
            print(f"✅ Generado: {config['filename']}")
            
        print(f"\n🎉 Éxito: Las 5 licencias blindadas se guardaron en {OUTPUT_DIR}")
        
    except Exception as e:
        print(f"❌ Error al procesar licencias: {e}")

if __name__ == "__main__":
    main()
