"""Acciones personalizadas del asistente de MACHOBOL.

Al importarse, el paquete carga `rasa_bot/.env` (sin pisar variables ya definidas) y fija
SANIC_HOST=127.0.0.1: rasa_sdk lee esa variable después de importar las acciones, así que el
servidor de acciones solo acepta conexiones de este mismo equipo.
"""
import os
from pathlib import Path


def _cargar_env(ruta: Path) -> None:
    if not ruta.is_file():
        return
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, valor = linea.split("=", 1)
        os.environ.setdefault(clave.strip(), valor.strip())


_cargar_env(Path(__file__).resolve().parent.parent / ".env")
os.environ.setdefault("SANIC_HOST", "127.0.0.1")
