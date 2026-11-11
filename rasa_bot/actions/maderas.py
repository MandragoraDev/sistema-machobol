"""Reconoce la madera que nombra el cliente entre las que ofrece el backend.

Las maderas no están fijas en el bot: salen de la base de datos (GET /api/internal/maderas), así que el
reconocimiento compara contra esa lista y funciona también con especies que el modelo NLU nunca vio.
"""
import re
from decimal import Decimal
from typing import Any, Dict, List, Optional

from .medidas import normalizar_texto

Madera = Dict[str, Any]


def _espesor(madera: Madera) -> str:
    """"30.00" → "30"; "1.50" → "1.5"."""
    return f"{Decimal(str(madera['espesor_pulg'])):f}".rstrip("0").rstrip(".")


def buscar_madera(texto: Optional[str], maderas: List[Madera]) -> Optional[Madera]:
    """La madera que nombra el texto ("de tajibo", "Tajibo 30″", "cedro 1"). None si no nombra ninguna o es ambiguo."""
    if not texto:
        return None
    normal = normalizar_texto(texto).strip()

    # Botones: el texto es exactamente el nombre que ofreció el bot.
    for madera in maderas:
        if normalizar_texto(madera["nombre"]) == normal:
            return madera

    candidatas = [m for m in maderas if re.search(rf"\b{re.escape(normalizar_texto(m['especie']))}\b", normal)]
    if len(candidatas) == 1:
        return candidatas[0]
    if len(candidatas) > 1:
        # La misma especie en varios espesores: decide el número que haya escrito el cliente.
        numeros = {n.replace(",", ".") for n in re.findall(r"\d+(?:[.,]\d+)?", normal)}
        por_espesor = [m for m in candidatas if _espesor(m) in numeros]
        if len(por_espesor) == 1:
            return por_espesor[0]
    return None
