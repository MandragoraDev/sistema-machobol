"""Lectura de las medidas que escribe el cliente: "4 x 2,20", "2.20 m de alto", "ancho 4", "dos por dos y medio",
"tres por dos veinte", "2 metros 20".

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

# Centímetros dichos después de los metros, como se habla: "dos veinte" = 2,20; "dos treinta y cinco" = 2,35.
_UNIDADES = {"un": 1, "uno": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "nueve": 9}
_DECENAS = {"veinte": 20, "treinta": 30, "cuarenta": 40, "cincuenta": 50, "sesenta": 60, "setenta": 70, "ochenta": 80, "noventa": 90}
_CENTIMETROS = {
    "diez": 10, "once": 11, "doce": 12, "trece": 13, "catorce": 14, "quince": 15, "dieciseis": 16, "diecisiete": 17,
    "dieciocho": 18, "diecinueve": 19, "veintiuno": 21, "veintidos": 22, "veintitres": 23, "veinticuatro": 24,
    "veinticinco": 25, "veintiseis": 26, "veintisiete": 27, "veintiocho": 28, "veintinueve": 29, **_DECENAS,
}
_CENTIMOS_PALABRA = (
    r"(?:" + "|".join(_DECENAS) + r")\s+y\s+(?:" + "|".join(_UNIDADES) + r")"
    r"|" + "|".join(sorted(_CENTIMETROS, key=len, reverse=True))
)

# Una medida: número en cifras o en palabras, y luego, opcionalmente:
#   "y medio" · centímetros en palabras ("dos veinte", "dos metros veinte", "dos con veinte")
#   · centímetros en dos cifras tras la unidad ("2 metros 20", "2m20") · y la unidad.
_MEDIDA = re.compile(
    r"(?<![\d.,])(?P<numero>\d+(?:[.,]\d+)?|\b(?:" + "|".join(_PALABRAS) + r")\b)"
    r"(?:"
    r"(?P<medio>\s+y\s+medio\b)"
    r"|\s+(?:(?:metros?|mts?|m|con|punto|coma)\s+)?(?P<centimos>\b(?:" + _CENTIMOS_PALABRA + r")\b)"
    r"|\s*(?:metros?|mts?|m|con)\s*(?P<centimos_cifra>\d{2})(?![\d.,])"
    r")?"
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


def _centimos(texto: str) -> int:
    if texto.isdigit():
        return int(texto)
    decena, _, unidad = re.sub(r"\s+", " ", texto).partition(" y ")
    return _DECENAS[decena] + _UNIDADES[unidad] if unidad else _CENTIMETROS[decena]


def _a_metros(medida: re.Match) -> Decimal:
    numero = medida["numero"]
    valor = Decimal(_PALABRAS[numero]) if numero in _PALABRAS else Decimal(numero.replace(",", "."))
    centimos = medida["centimos"] or medida["centimos_cifra"]
    if centimos:
        # Metros y centímetros: "dos veinte" → 2,20 (la unidad, si la hay, ya no cambia la escala).
        return (valor + Decimal(_centimos(centimos)) / 100).quantize(_CENTIMETRO, rounding=ROUND_HALF_UP)
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
