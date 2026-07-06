#!/usr/bin/env python3
"""
Genera el PDF real de la licencia básica mostrado en la captura de pantalla,
utilizando la plantilla oficial de config.js y los datos exactos del formulario.
"""
import os
import re
import sys
import json

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pdf_generator import generate_pdf_from_contract

CONFIG_PATH = "config.js"
OUTPUT_PDF = os.path.expanduser("~/Desktop/Contrato_Real_Licencia_Basica_SossaMusic.pdf")

# Datos exactos mostrados en la captura de pantalla de la web
payload = {
    "beatName": "[Nombre del Beat]",
    "beatBpm": "",
    "beatKey": "",
    "buyerName": "[Nombre del Comprador]",
    "buyerId": "[Cédula/DNI]",
    "buyerEmail": "[Correo del Comprador]",
    "buyerPhone": "",
    "buyerCity": "[Ciudad]",
    "buyerCountry": "[País]",
    "finalPrice": 30.00,
    "price": 30.00,
    "reference": "LIC-BAS-20260705-3086",
    "refCode": "LIC-BAS-20260705-3086",
    "timestamp": "2026-07-05T01:53:00Z",
    "method": "Transferencia Bancaria",
    "licenseType": "basic",
    "needsBuyerSignature": False,
    "crypto_hash": "e987c823a012b3d4f5e6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8",
    
    # Configuración de Sossa
    "aka": "Sossa",
    "producerName": "Joao David Dominguez",
    "producerId": "0803743111001", # RUC de 13 dígitos
    "producerEmail": "masterjuego25@gmail.com",
    "producerPhone": "",
    "producerPro": "BMI",
    "producerIpi": "01170943066",
    "producerPublisher": "Songtrust",
    
    # Límites reales de la Licencia Básica en config.js
    "formats": "MP3",
    "streams": "40,000",
    "physical": "500",
    "videos": "un (1) video",
    "videoDuration": "5 minutos",
    "years": "5 años",
    "terminationFee": "200% ($60.00 USD)",
    "writerShare": 50,
    "producerShare": 50,
    "credits": '"Producido por sossa" o "Prod. por sossa"'
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
        
        is_exclusive = payload["licenseType"] == "exclusive"
        
        clause_rescission_rules = (
            "Una vez vencido o perpetuo el acuerdo, los derechos se mantendrán según lo estipulado sin necesidad de renovación."
            if is_exclusive else
            "En consecuencia, esta licencia expirará automáticamente al cumplirse el término estipulado contados a partir de la fecha estipulada en el encabezado."
        )
        
        clause_content_id_rules = (
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
            "beat_bpm": "",
            "beat_key": "",
            "license_value": f"{payload['finalPrice']:.2f}",
            "license_value_letters": "treinta con 00/100",
            "ref_code": payload["reference"],
            "effective_date": "Domingo, 05 de julio de 2026",
            "celebration_place": "Quito, Ecuador",
            "payment_method": "Transferencia Bancaria",
            "jurisdiction_city": "Quito",
            "current_year": "2026",
            
            "clause_formats": payload["formats"],
            "clause_streams": payload["streams"],
            "clause_physical": payload["physical"],
            "clause_videos": payload["videos"],
            "clause_video_duration": payload["videoDuration"],
            "clause_years": payload["years"],
            "clause_termination_fee": payload["terminationFee"],
            "clause_writer_share": str(payload["writerShare"]),
            "clause_producer_share": str(payload["producerShare"]),
            "clause_credits": payload["credits"],
            
            "license_type": "Básica",
            "license_exclusivity": "No Exclusiva",
            "license_exclusivity_lower": "no exclusiva",
            "clause_rescission_rules": clause_rescission_rules,
            "clause_content_id_rules": clause_content_id_rules
        }
        
        compiled_md = markdown_template
        for key, val in vars.items():
            compiled_md = compiled_md.replace(f"{{{{{key}}}}}", val)
            
        generate_pdf_from_contract(OUTPUT_PDF, compiled_md, payload)
        print(f"✅ Contrato Básico Real generado en: {OUTPUT_PDF}")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    main()
