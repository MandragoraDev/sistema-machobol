"""Respuestas a las consultas generales (ubicación, horario, pagos, fabricación, cobertura) y al estado de los pedidos.

Los datos salen del backend (GET /api/internal/negocio y /pedidos/estado): el Admin los edita en el panel, así que
aquí no hay direcciones, horarios ni porcentajes fijos. Funciones puras, sin Rasa.
"""
import re
from decimal import Decimal
from typing import Any, Dict, List, Text

from .formato import formatear_bs, formatear_fecha_hora
from .medidas import normalizar_texto

# Tema de la consulta según sus palabras (el texto ya viene en minúsculas y sin tildes). Una pregunta puede tocar varios.
TEMAS = {
    "ubicacion": r"\b(donde|ubica\w*|direccion|mapa|maps|tienda|local|como (llego|llegar)|queda[ns]?)\b",
    "horario": r"\b(hora(s|rio|rios)?|abre[ns]?|abiert[oa]s?|cierra[ns]?|atiende[ns]?|atencion|domingos?|sabados?|feriados?)\b",
    "pagos": r"\b(pag(o|os|ar|an|a)|qr|efectivo|transferencias?|cheques?|tarjetas?|anticipo|adelanto|cuotas|credito)\b",
    "fabricacion": r"\b(tarda[ns]?|demora[ns]?|tiempo|semanas|plazo|cuanto (se )?(tarda|demora)|fabrica[nr]?)\b",
    "cobertura": r"\b(instala[ns]?|envia[ns]?|envios?|llega[ns]?|provincias?|nacional|departamentos?|otra ciudad|"
                 r"cochabamba|la paz|el alto|tarija|sucre|beni|pando|oruro|potosi|trinidad|cobija|montero|viaje|traslado)\b",
}


def temas_de(texto: Text) -> List[Text]:
    """Temas que menciona el mensaje, en el orden de TEMAS."""
    normalizado = normalizar_texto(texto or "")
    return [tema for tema, patron in TEMAS.items() if re.search(patron, normalizado)]


def _en_minuscula(frase: Text) -> Text:
    """Primera letra en minúscula para seguir la oración ("De 7:30…" → "de 7:30…"), salvo siglas ("QR, efectivo…")."""
    primera = frase.split(" ", 1)[0].strip(",.;:")
    if not frase or (len(primera) > 1 and primera.isupper()):
        return frase
    return frase[:1].lower() + frase[1:]


def _porcentaje(valor: Any) -> Text:
    return f"{Decimal(str(valor)).normalize():f}".replace(".", ",")


def respuesta_tema(tema: Text, negocio: Dict[Text, Any]) -> Text:
    if tema == "ubicacion":
        texto = f"Estamos en {negocio['direccion']}, {negocio['ciudad']}."
        return texto + (f"\nUbicación en el mapa: {negocio['maps_url']}" if negocio.get("maps_url") else "")
    if tema == "horario":
        return f"Nuestro horario de atención es {_en_minuscula(negocio['horarios'])}."
    if tema == "pagos":
        return (f"Aceptamos {_en_minuscula(negocio['formas_pago'])}. Para iniciar la fabricación se pide un anticipo del "
                f"{_porcentaje(negocio['anticipo_pct'])} % y el saldo se paga al momento de la instalación.")
    if tema == "fabricacion":
        return f"El tiempo de fabricación es {_en_minuscula(negocio['tiempo_fabricacion'])}."
    if tema == "cobertura":
        return negocio["cobertura"]
    raise ValueError(f"Tema desconocido: {tema}")


def responder(texto: Text, negocio: Dict[Text, Any]) -> Text:
    """Responde los temas que menciona el mensaje; si no se reconoce ninguno, un resumen de lo principal."""
    temas = temas_de(texto) or ["ubicacion", "horario", "pagos"]
    return "\n\n".join(respuesta_tema(tema, negocio) for tema in temas)


def _fecha_dia(iso_dia: Text) -> Text:
    """"2026-11-27" → "27/11/2026"."""
    anio, mes, dia = iso_dia.split("-")
    return f"{dia}/{mes}/{anio}"


def describir_pedido(pedido: Dict[Text, Any]) -> Text:
    """Una línea con el estado de un pedido, como la ve el cliente."""
    codigo, estado = pedido["codigo"], pedido["estado"]
    if estado == "COTIZADO":
        linea = "cotizado. Si la cotización le parece bien, podemos agendar una reunión con un asesor."
    elif estado == "REUNION_SOLICITADA":
        linea = "reunión solicitada. Un asesor le escribirá para confirmar el día y la hora."
    elif estado == "REUNION_AGENDADA":
        linea = f"reunión con el asesor agendada para las {formatear_fecha_hora(pedido['fecha_reunion'])}."
    elif estado == "REVISION_STOCK":
        linea = "anticipo recibido. Un asesor le confirmará la fecha de inicio de la fabricación."
    elif estado == "EN_PRODUCCION":
        fase = pedido["fase"]
        linea = f"en fabricación, etapa {fase['orden']} de 11 ({fase['nombre']})."
    elif estado == "EN_RUTA":
        linea = "en camino para la instalación."
    elif estado == "ENTREGADO":
        linea = "entregado e instalado. ¡Gracias por confiar en MACHOBOL!"
    else:
        linea = f"{pedido['estado_nombre'].lower()}."

    if estado in ("EN_PRODUCCION", "EN_RUTA") and pedido.get("fecha_instalacion"):
        linea += f" Instalación programada para el {_fecha_dia(pedido['fecha_instalacion'])}."
    if Decimal(pedido["pagado"]) > 0 and Decimal(pedido["saldo"]) > 0:
        linea += f" Saldo pendiente: {formatear_bs(pedido['saldo'])} Bs."
    return f"*{codigo}*: {linea}"


def describir_pedidos(pedidos: List[Dict[Text, Any]]) -> Text:
    if not pedidos:
        return "No encuentro pedidos a su nombre. Si quiere, le cotizo un portón ahora mismo."
    encabezado = "Este es el estado de su pedido:" if len(pedidos) == 1 else "Este es el estado de sus pedidos más recientes:"
    return "\n".join([encabezado] + [f"• {describir_pedido(p)}" for p in pedidos])
