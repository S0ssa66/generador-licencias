"""Configuración compartida y segura para la facturación electrónica SRI.

Los valores privados de la firma nunca deben formar parte del documento público
del productor ni de localStorage. Este módulo también permite migrar una copia
local antigua sin imprimir ni exponer los secretos.
"""

from __future__ import annotations

import json
import os
import re
import stat
from pathlib import Path
from typing import Dict, Mapping, Tuple


SRI_PRIVATE_KEYS = frozenset({
    "id",
    "address",
    "birthdate",
    "sriRuc",
    "sriRazonSocial",
    "sriNombreComercial",
    "sriDirMatriz",
    "sriEstab",
    "sriPtoEmi",
    "sriAmbiente",
    "sriRimpe",
    "sriContabilidad",
    "sriIvaTarifa",
    "sriIvaIncluido",
    "sriRucProveedor",
    "sriP12Base64",
    "sriP12Password",
    "sriSecuencial",
})


def split_producer_config(config: Mapping) -> Tuple[Dict, Dict]:
    """Divide una configuración en datos públicos y privados."""
    public = dict(config or {})
    private = {}
    for key in SRI_PRIVATE_KEYS:
        if key in public:
            private[key] = public.pop(key)
    return public, private


def private_config_path(producer_id: str = '') -> Path:
    """Devuelve una ruta privada e independiente para cada productor."""
    configured = os.environ.get("SRI_PRIVATE_CONFIG_PATH", "").strip()
    safe_id = re.sub(r'[^A-Za-z0-9_-]', '_', str(producer_id or '').strip())
    if configured:
        configured_path = Path(configured).expanduser()
        if safe_id:
            return configured_path.parent / f"{configured_path.stem}-{safe_id}{configured_path.suffix or '.json'}"
        return configured_path
    root = Path(os.environ.get("BEATSS_DATA_DIR", Path(__file__).resolve().parent))
    if safe_id:
        return root / ".local" / "sri_private_config" / f"{safe_id}.json"
    return root / ".local" / "sri_private_config.json"


def load_local_private_config(producer_id: str = '') -> Dict:
    path = private_config_path(producer_id)
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        return {key: data[key] for key in SRI_PRIVATE_KEYS if data.get(key)}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


def save_local_private_config(values: Mapping, producer_id: str = '') -> Path:
    """Guarda secretos de desarrollo con permisos de propietario solamente."""
    path = private_config_path(producer_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {key: values[key] for key in SRI_PRIVATE_KEYS if values.get(key)}
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    os.chmod(temporary, stat.S_IRUSR | stat.S_IWUSR)
    os.replace(temporary, path)
    os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
    return path


def migrate_legacy_backup_config(config: Mapping, producer_id: str = '') -> Tuple[Dict, Dict, bool]:
    """Separa secretos de una configuración antigua guardada en un backup.

    La migración es deliberadamente local: crea el archivo privado ignorado por
    Git para ese productor y devuelve el backup ya saneado para que el llamador
    lo persista.
    """
    public, private = split_producer_config(config)
    if not private:
        return public, {}, False
    existing = load_local_private_config(producer_id)
    merged = {**existing, **private}
    save_local_private_config(merged, producer_id)
    return public, merged, True
