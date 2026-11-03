"""Lectura de las medidas que escribe el cliente: "4 x 2,20", "2.20 m de alto", "ancho 4", "dos por dos y medio".

Complementa a DIET, que no puede separar "4x2,20" porque el tokenizador lo deja como una sola palabra.
Convención: si el cliente da dos medidas sin decir cuál es cuál, la primera es el ancho y la segunda
el alto. El bot siempre confirma las medidas antes de cotizar.
"""
import re
import unicodedata
from decimal import ROUND_HALF_UP, Decimal
from typing import Dict, Optional

# Rango de cordura para detectar errores de tipeo; los límites comerciales los valida el backend.
MEDIDA_MINIMA = Decimal("0.30")
MEDIDA_MAXIMA = Decimal("20.00")
# Sin unidad, un número mayor que este se interpreta en centímetros ("220" → 2,20 m).
_LIMITE_SIN_UNIDAD = Decimal("20")
_CENTIMETRO = Decimal("0.01")

_PALABRAS = {"uno": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10}

# Una medida: número en cifras o en palabras, "y medio" opcional y unidad opcional.
_MEDIDA = re.compile(
    r"(?<![\d.,])(?P<numero>\d+(?:[.,]\d+)?|\b(?:" + "|".join(_PALABRAS) + r")\b)"
    r"(?P<medio>\s+y\s+medio\b)?"
    r"(?:\s*(?P<unidad>metros?|mts?|m|centimetros?|cms?)\b)?"
)
# "2,20 de alto" (la etiqueta va después de la medida)…
_SUFIJO = re.compile(r"\s*de\s+(?P<eje>ancho|largo|frente|alto|altura)\b")
# …o "el ancho es de 4" (va antes).
_PREFIJO = re.compile(r"\b(?P<eje>ancho|largo|frente|alto|altura)\b\s*(?:es\s+)?(?:de\s+)?(?:son\s+)?[:=]?\s*$")
_SEPARADOR = re.compile(r"\s*(?:x|por|\*|×)\s*")
_CODIGO_PEDIDO = re.compile(r"\bmch-\d{4}-\d{4}\b")

_EJE = {"ancho": "ancho", "largo": "ancho", "frente": "ancho", "alto": "alto", "altura": "alto"}
_OTRO_EJE = {"ancho": "alto", "alto": "ancho"}


def normalizar_texto(texto: str) -> str:
    """Minúsculas y sin tildes, para comparar con lo que escriben los clientes."""
    descompuesto = unicodedata.normalize("NFKD", texto.lower())
    return "".join(c for c in descompuesto if not unicodedata.combining(c))


def _a_metros(medida: re.Match) -> Decimal:
    numero = medida["numero"]
    valor = Decimal(_PALABRAS[numero]) if numero in _PALABRAS else Decimal(numero.replace(",", "."))
    if medida["medio"]:
        valor += Decimal("0.5")
    unidad = medida["unidad"] or ""
    if unidad.startswith("c") or (not unidad and valor > _LIMITE_SIN_UNIDAD):
        valor /= 100
    return valor.quantize(_CENTIMETRO, rounding=ROUND_HALF_UP)


def extraer_medidas(texto: str) -> Dict[str, Decimal]:
    """Devuelve las medidas en metros con las claves "ancho" y/o "alto".

    Si el mensaje trae un único número sin etiqueta ("2,20"), lo devuelve como "sin_etiqueta":
    quien llama decide a qué medida corresponde según la pregunta que hizo el bot.
    """
    texto = _CODIGO_PEDIDO.sub(" ", normalizar_texto(texto))
    medidas = list(_MEDIDA.finditer(texto))
    ejes = []
    for medida in medidas:
        etiqueta = _SUFIJO.match(texto, medida.end()) or _PREFIJO.search(texto, 0, medida.start())
        ejes.append(_EJE[etiqueta["eje"]] if etiqueta else None)

    resultado: Dict[str, Decimal] = {}
    for medida, eje in zip(medidas, ejes):
        if eje:
            resultado.setdefault(eje, _a_metros(medida))

    # "A x B": si una de las dos está etiquetada, la otra es el eje restante; si ninguna, ancho × alto.
    for i in range(len(medidas) - 1):
        a, b = medidas[i], medidas[i + 1]
        if not _SEPARADOR.fullmatch(texto, a.end(), b.start()):
            continue
        eje_a, eje_b = ejes[i], ejes[i + 1]
        if eje_a is None and eje_b is None:
            resultado.setdefault("ancho", _a_metros(a))
            resultado.setdefault("alto", _a_metros(b))
        elif eje_a is None:
            resultado.setdefault(_OTRO_EJE[eje_b], _a_metros(a))
        elif eje_b is None:
            resultado.setdefault(_OTRO_EJE[eje_a], _a_metros(b))
        break

    sueltas = [medida for medida, eje in zip(medidas, ejes) if eje is None]
    if len(resultado) == 1 and len(sueltas) == 1:
        # "4 metros y 2,20 de alto": la única medida sin etiqueta es la otra.
        faltante = _OTRO_EJE[next(iter(resultado))]
        resultado[faltante] = _a_metros(sueltas[0])
    elif not resultado and len(medidas) == 1:
        resultado["sin_etiqueta"] = _a_metros(medidas[0])
    return resultado


def leer_medida(valor) -> Optional[Decimal]:
    """Medida en metros a partir del valor de un slot: número, texto ("2,20 m") o lista (toma el primero)."""
    if isinstance(valor, list):
        valor = valor[0] if valor else None
    if valor is None or isinstance(valor, bool):
        return None
    if isinstance(valor, (int, float)):
        return Decimal(str(valor)).quantize(_CENTIMETRO, rounding=ROUND_HALF_UP)
    medida = _MEDIDA.search(normalizar_texto(str(valor)))
    return _a_metros(medida) if medida else None


def medida_valida(medida: Decimal) -> bool:
    return MEDIDA_MINIMA <= medida <= MEDIDA_MAXIMA
