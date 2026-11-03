"""Cliente del backend de MACHOBOL: endpoints /api/internal/*, autenticados con el header X-Service-Token.

Rasa nunca calcula precios ni toca la base de datos (PLAN §1): todo lo pide aquí.
"""
import asyncio
import os
import time
from typing import Any, Dict, Optional

import aiohttp

API_URL = os.environ.get("MACHOBOL_API_URL", "http://localhost:4000/api").rstrip("/")
SERVICE_TOKEN = os.environ.get("SERVICE_TOKEN", "")
_TIEMPO_MAXIMO = aiohttp.ClientTimeout(total=10)
# Precios y accesorios cambian poco: un minuto de caché evita pedir el catálogo en cada pregunta.
_VIGENCIA_CATALOGO_S = 60

_catalogo: Optional[Dict[str, Any]] = None
_catalogo_leido_en = 0.0


class ErrorBackend(Exception):
    """El backend no respondió o rechazó la solicitud."""


async def _solicitar(metodo: str, ruta: str, cuerpo: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if not SERVICE_TOKEN:
        raise ErrorBackend("Falta SERVICE_TOKEN en rasa_bot/.env")
    try:
        async with aiohttp.ClientSession(timeout=_TIEMPO_MAXIMO) as sesion:
            async with sesion.request(
                metodo, f"{API_URL}{ruta}", json=cuerpo, headers={"X-Service-Token": SERVICE_TOKEN}
            ) as respuesta:
                datos = await respuesta.json(content_type=None)
                if respuesta.status >= 400:
                    raise ErrorBackend(f"{metodo} {ruta} → {respuesta.status}: {datos}")
                return datos
    # En Python 3.10, asyncio.TimeoutError (el que lanza aiohttp al vencer el plazo) no es el TimeoutError estándar.
    except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as error:
        raise ErrorBackend(f"{metodo} {ruta} falló: {error!r}") from error


async def obtener_catalogo() -> Dict[str, Any]:
    global _catalogo, _catalogo_leido_en
    if _catalogo is None or time.monotonic() - _catalogo_leido_en > _VIGENCIA_CATALOGO_S:
        _catalogo = await _solicitar("GET", "/internal/catalogo")
        _catalogo_leido_en = time.monotonic()
    return _catalogo


async def cotizar(datos: Dict[str, Any]) -> Dict[str, Any]:
    return await _solicitar("POST", "/internal/cotizaciones", datos)
