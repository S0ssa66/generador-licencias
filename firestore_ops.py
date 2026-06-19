"""Operaciones REST sobre Firestore — módulo extraído de server.py"""
import json
import os
import urllib.request
from urllib.parse import urlparse, parse_qs


def update_firestore_task(task_id, id_token, estado, progreso=None, resultado=None):
    """Actualiza una tarea en Firestore usando la API REST con el token de autenticación del usuario."""
    url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/tasks/{task_id}"
    
    # Construir máscara de campos a actualizar
    params = ["updateMask.fieldPaths=estado"]
    fields = {
        "estado": {"stringValue": estado}
    }
    
    if progreso is not None:
        params.append("updateMask.fieldPaths=progreso")
        fields["progreso"] = {"stringValue": progreso}
        
    if resultado is not None:
        params.append("updateMask.fieldPaths=resultado")
        fields["resultado"] = {"stringValue": resultado}
        
    url_params = "&".join(params)
    full_url = f"{url}?{url_params}"
    
    payload = {
        "fields": fields
    }
    
    headers = {
        "Authorization": f"Bearer {id_token}",
        "Content-Type": "application/json"
    }
    
    req = urllib.request.Request(full_url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="PATCH")
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as e:
        print(f"[-] Error al actualizar Firestore REST: {e}")
        return None

def get_firestore_task(task_id, id_token):
    """Obtiene una tarea de Firestore usando la API REST."""
    url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/tasks/{task_id}"
    headers = {
        "Authorization": f"Bearer {id_token}"
    }
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            fields = res_data.get("fields", {})
            return {
                "tipo": fields.get("tipo", {}).get("stringValue", ""),
                "consulta": fields.get("consulta", {}).get("stringValue", ""),
                "userId": fields.get("userId", {}).get("stringValue", "")
            }
    except Exception as e:
        print(f"[-] Error al obtener tarea de Firestore REST: {e}")
        return None

def fetch_firestore_collection(collection_path, token):

    """Obtiene todos los documentos de una colección específica en Firestore usando REST API."""
    url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/{collection_path}"
    headers = {"Authorization": f"Bearer {token}"}
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            return res_data.get("documents", [])
    except Exception as e:
        return []

def fetch_firestore_document(doc_path, token):
    """Obtiene un documento específico en Firestore usando REST API."""
    url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/{doc_path}"
    headers = {"Authorization": f"Bearer {token}"}
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            fields = res_data.get("fields", {})
            parsed_doc = {}
            for key, val in fields.items():
                if "stringValue" in val:
                    parsed_doc[key] = val["stringValue"]
                elif "integerValue" in val:
                    parsed_doc[key] = int(val["integerValue"])
                elif "doubleValue" in val:
                    parsed_doc[key] = float(val["doubleValue"])
                elif "booleanValue" in val:
                    parsed_doc[key] = val["booleanValue"]
            return parsed_doc
    except Exception as e:
        print(f"[-] Error al obtener documento Firestore {doc_path}: {e}")
        return None
