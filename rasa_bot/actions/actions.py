"""Acciones del asistente: catálogo, formulario de cotización y envío de la solicitud al backend."""
import json
import logging
import re
from typing import Any, Dict, List, Optional, Text, Tuple

from rasa_sdk import Action, FormValidationAction, Tracker
from rasa_sdk.events import EventType, SlotSet
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.types import DomainDict

from . import backend
from .formato import formatear_bs, formatear_metros
from .medidas import (
    MEDIDA_MAXIMA,
    MEDIDA_MINIMA,
    extraer_medidas,
    leer_medida,
    medida_valida,
    normalizar_texto,
)

logger = logging.getLogger(__name__)

SLOTS_COTIZACION = ["tipo_porton", "ancho", "alto", "medidas_confirmadas", "accesorios", "fuera_ciudad"]

# Valor canónico de la entidad `accesorio` (sinónimos en data/nlu.yml) → prefijo de su código en el
# catálogo y título de su botón. Qué accesorio corresponde a cada tipo de portón lo decide el catálogo.
FAMILIAS_ACCESORIO = {
    "motor": {"prefijo": "MOTOR", "boton": "Motor"},
    "puerta_ingreso": {"prefijo": "PUERTA_INGRESO", "boton": "Puerta de ingreso"},
}
CODIGO_TRANSPORTE = "TRANSPORTE_VIATICOS"
BOTON_NINGUNO = {"title": "Ninguno", "payload": "/negar"}


# --- Utilidades ------------------------------------------------------------------------------

def _intent(tracker: Tracker) -> Optional[Text]:
    return (tracker.latest_message.get("intent") or {}).get("name")


def _texto(tracker: Tracker) -> Text:
    return normalizar_texto(tracker.latest_message.get("text") or "")


def _valor_previo(tracker: Tracker, slot: Text) -> Any:
    """Valor que tenía el slot antes del último mensaje del cliente."""
    eventos = tracker.events
    ultimo = max((i for i, e in enumerate(eventos) if e.get("event") == "user"), default=len(eventos))
    valor = None
    for evento in eventos[:ultimo]:
        if evento.get("event") == "slot" and evento.get("name") == slot:
            valor = evento.get("value")
        elif evento.get("event") in ("restart", "reset_slots", "session_started"):
            valor = None
    return valor


def _normalizar_tipo(valor: Any) -> Optional[Text]:
    if isinstance(valor, list):
        valor = valor[0] if valor else None
    if not isinstance(valor, str):
        return None
    texto = normalizar_texto(valor)
    if re.search(r"corred|desliz|riel", texto):
        return "corredizo"
    if re.search(r"bati|abat|hoja|abrir|bisagra", texto):
        return "batiente"
    return None


def _normalizar_accesorios(valor: Any) -> List[Text]:
    """Lista de familias conocidas, sin repetir, a partir de lo que extrajo DIET."""
    if valor is None:
        return []
    familias: List[Text] = []
    for elemento in valor if isinstance(valor, list) else [valor]:
        texto = normalizar_texto(str(elemento))
        if texto in FAMILIAS_ACCESORIO:
            familia = texto
        elif re.search(r"motor|automat", texto):
            familia = "motor"
        elif re.search(r"puert|peatonal|ingreso", texto):
            familia = "puerta_ingreso"
        else:
            continue
        if familia not in familias:
            familias.append(familia)
    return familias


def _accesorios_compatibles(catalogo: Dict[Text, Any], tipo: Optional[Text]) -> Dict[Text, Dict[Text, Any]]:
    """Familia → accesorio del catálogo compatible con el tipo de portón."""
    tipo_catalogo = tipo.upper() if tipo else None
    compatibles = {}
    for familia, datos in FAMILIAS_ACCESORIO.items():
        for accesorio in catalogo["accesorios"]:
            codigo = accesorio["codigo"]
            es_de_la_familia = codigo == datos["prefijo"] or codigo.startswith(datos["prefijo"] + "_")
            if (
                accesorio["tipo_adicional"] == "ACCESORIO"
                and es_de_la_familia
                and accesorio["tipo_porton_compatible"] in (None, tipo_catalogo)
            ):
                compatibles[familia] = accesorio
                break
    return compatibles


def _medidas(tracker: Tracker) -> Tuple[Any, Any]:
    return leer_medida(tracker.get_slot("ancho")), leer_medida(tracker.get_slot("alto"))


def _medidas_cambiaron(tracker: Tracker) -> bool:
    return any(leer_medida(tracker.get_slot(s)) != leer_medida(_valor_previo(tracker, s)) for s in ("ancho", "alto"))


def _extraer_medida(tracker: Tracker, slot: Text) -> Dict[Text, Any]:
    medidas = extraer_medidas(tracker.latest_message.get("text") or "")
    if slot in medidas:
        return {slot: float(medidas[slot])}
    # Un número suelto ("2,20") es la medida que el bot acaba de preguntar.
    if "sin_etiqueta" in medidas and tracker.get_slot("requested_slot") == slot:
        return {slot: float(medidas["sin_etiqueta"])}
    return {}


def _validar_medida(slot: Text, valor: Any, dispatcher: CollectingDispatcher, tracker: Tracker) -> Dict[Text, Any]:
    if valor is None:
        return {slot: None}
    medida = leer_medida(valor)
    if medida is None or not medida_valida(medida):
        dispatcher.utter_message(
            text=f"La medida debe estar entre {formatear_metros(MEDIDA_MINIMA)} m y {formatear_metros(MEDIDA_MAXIMA)} m. "
            "Escríbala en metros, por ejemplo: 2,20."
        )
        return {slot: None}
    resultado: Dict[Text, Any] = {slot: float(medida)}
    if medida != leer_medida(_valor_previo(tracker, slot)):
        resultado["medidas_confirmadas"] = None  # medidas nuevas: hay que volver a confirmarlas
    return resultado


def _precio_producto(producto: Dict[Text, Any]) -> Text:
    if producto["modo_precio"] == "POR_M2":
        return f"{formatear_bs(producto['precio_m2'])} Bs/m²"
    return f"{formatear_bs(producto['precio_fijo'])} Bs"


def _payload_accesorio(familia: Text) -> Text:
    return "/agregar_accesorio" + json.dumps({"accesorio": familia})


# --- Acciones ----------------------------------------------------------------------------------

class ActionMostrarCatalogo(Action):
    def name(self) -> Text:
        return "action_mostrar_catalogo"

    async def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict) -> List[EventType]:
        try:
            catalogo = await backend.obtener_catalogo()
        except backend.ErrorBackend:
            logger.exception("No se pudo leer el catálogo")
            dispatcher.utter_message(response="utter_error_backend")
            return []

        # Sin líneas en blanco: el canal REST de Rasa parte el texto en varios mensajes en cada "\n\n".
        lineas = ["Fabricamos a medida, en madera:"]
        for categoria in catalogo["categorias"]:
            lineas.append(f"*{categoria['nombre']}*")
            lineas += [f"• {p['nombre']}: {_precio_producto(p)}" for p in categoria["productos"]]
            if not categoria["productos"]:
                lineas.append("• Modelos y precios a consultar con un asesor.")
        accesorios = [a for a in catalogo["accesorios"] if a["tipo_adicional"] == "ACCESORIO"]
        if accesorios:
            lineas.append("*Accesorios*")
            lineas += [f"• {a['nombre']}: +{formatear_bs(a['precio'])} Bs" for a in accesorios]

        # Durante una cotización, el formulario retoma la pregunta pendiente justo después.
        if tracker.active_loop.get("name"):
            dispatcher.utter_message(text="\n".join(lineas))
            return []
        lineas.append("El precio de un portón depende de sus medidas. ¿Le preparo una cotización?")
        dispatcher.utter_message(
            text="\n".join(lineas),
            buttons=[
                {"title": "Cotizar portón", "payload": "/cotizar_porton"},
                {"title": "Hablar con asesor", "payload": "/hablar_con_asesor"},
            ],
        )
        return []


class ActionPreguntarConfirmacionMedidas(Action):
    def name(self) -> Text:
        return "action_ask_medidas_confirmadas"

    async def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict) -> List[EventType]:
        ancho, alto = _medidas(tracker)
        tipo = _normalizar_tipo(tracker.get_slot("tipo_porton"))
        dispatcher.utter_message(
            text=f"Para confirmar: portón {tipo} de *{formatear_metros(ancho)} m de ancho × {formatear_metros(alto)} m "
            f"de alto* ({formatear_metros(ancho * alto)} m²). ¿Las medidas son correctas?",
            buttons=[
                {"title": "Sí, son correctas", "payload": "/confirmar"},
                {"title": "No, corregir", "payload": "/negar"},
            ],
        )
        return []


class ActionPreguntarAccesorios(Action):
    def name(self) -> Text:
        return "action_ask_accesorios"

    async def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict) -> List[EventType]:
        tipo = _normalizar_tipo(tracker.get_slot("tipo_porton"))
        try:
            compatibles = _accesorios_compatibles(await backend.obtener_catalogo(), tipo)
        except backend.ErrorBackend:
            logger.exception("No se pudo leer el catálogo")
            compatibles = {}

        if not compatibles:  # sin catálogo, la pregunta va sin precios
            dispatcher.utter_message(
                text="¿Desea agregar un motor o una puerta de ingreso peatonal? "
                "Responda, por ejemplo, «con motor» o «ninguno».",
                buttons=[
                    *({"title": f["boton"], "payload": _payload_accesorio(c)} for c, f in FAMILIAS_ACCESORIO.items()),
                    BOTON_NINGUNO,
                ],
            )
            return []

        lineas = [f"¿Desea agregar algún accesorio a su portón {tipo}?"]
        lineas += [f"• {a['nombre']}: +{formatear_bs(a['precio'])} Bs" for a in compatibles.values()]
        lineas.append("Puede elegir uno o escribir, por ejemplo, «motor y puerta».")
        dispatcher.utter_message(
            text="\n".join(lineas),
            buttons=[
                *({"title": FAMILIAS_ACCESORIO[c]["boton"], "payload": _payload_accesorio(c)} for c in compatibles),
                BOTON_NINGUNO,
            ],
        )
        return []


class ActionPreguntarFueraCiudad(Action):
    def name(self) -> Text:
        return "action_ask_fuera_ciudad"

    async def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict) -> List[EventType]:
        texto = "¿La entrega e instalación será *fuera de la ciudad* (a más de 45 minutos)?"
        try:
            catalogo = await backend.obtener_catalogo()
            recargo = next((a for a in catalogo["accesorios"] if a["codigo"] == CODIGO_TRANSPORTE), None)
        except backend.ErrorBackend:
            logger.exception("No se pudo leer el catálogo")
            recargo = None
        if recargo:
            texto += f" En ese caso se suman {formatear_bs(recargo['precio'])} Bs por transporte y viáticos."
        dispatcher.utter_message(
            text=texto,
            buttons=[
                {"title": "Sí, fuera de ciudad", "payload": "/confirmar"},
                {"title": "No, en la ciudad", "payload": "/negar"},
            ],
        )
        return []


class ValidarFormularioCotizacion(FormValidationAction):
    """Normaliza y valida cada dato del formulario. Los `extract_` completan lo que DIET no separa."""

    def name(self) -> Text:
        return "validate_formulario_cotizacion"

    async def extract_ancho(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict) -> Dict[Text, Any]:
        return _extraer_medida(tracker, "ancho")

    async def extract_alto(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict) -> Dict[Text, Any]:
        return _extraer_medida(tracker, "alto")

    async def extract_accesorios(
        self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict
    ) -> Dict[Text, Any]:
        if tracker.get_slot("requested_slot") != "accesorios":
            return {}
        nombro_accesorio = any(e.get("entity") == "accesorio" for e in tracker.latest_message.get("entities", []))
        dijo_ninguno = _intent(tracker) == "negar" or re.search(r"\b(ningun[oa]?|nada|sin accesorios?)\b", _texto(tracker))
        return {"accesorios": []} if dijo_ninguno and not nombro_accesorio else {}

    async def extract_fuera_ciudad(
        self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict
    ) -> Dict[Text, Any]:
        # "Sí" y "no" ya los resuelve el mapeo from_intent; aquí se leen respuestas libres.
        if tracker.get_slot("requested_slot") != "fuera_ciudad" or _intent(tracker) in ("confirmar", "negar"):
            return {}
        texto = _texto(tracker)
        if re.search(r"\b(dentro|en la ciudad|aqui|aca|cerca)\b", texto):
            return {"fuera_ciudad": False}
        if re.search(r"\b(fuera|afueras?|provincia|lejos|otro departamento|otra ciudad)\b", texto):
            return {"fuera_ciudad": True}
        return {}

    def validate_tipo_porton(
        self, value: Any, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict
    ) -> Dict[Text, Any]:
        tipo = _normalizar_tipo(value)
        if tipo is None:
            dispatcher.utter_message(response="utter_tipo_porton_invalido")
        return {"tipo_porton": tipo}

    def validate_ancho(
        self, value: Any, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict
    ) -> Dict[Text, Any]:
        return _validar_medida("ancho", value, dispatcher, tracker)

    def validate_alto(
        self, value: Any, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict
    ) -> Dict[Text, Any]:
        return _validar_medida("alto", value, dispatcher, tracker)

    def validate_medidas_confirmadas(
        self, value: Any, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict
    ) -> Dict[Text, Any]:
        if _medidas_cambiaron(tracker):
            # "No, es 3 por 2": se toman las nuevas medidas y se vuelven a confirmar.
            return {"medidas_confirmadas": None}
        if value is True:
            return {"medidas_confirmadas": True}
        if value is False:
            dispatcher.utter_message(response="utter_corregir_medidas")
            return {"ancho": None, "alto": None, "medidas_confirmadas": None}
        return {"medidas_confirmadas": None}

    def validate_accesorios(
        self, value: Any, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict
    ) -> Dict[Text, Any]:
        if value is None:
            return {"accesorios": None}
        familias = _normalizar_accesorios(value)
        if value and not familias:
            dispatcher.utter_message(response="utter_accesorio_desconocido")
            return {"accesorios": None}
        if _intent(tracker) == "agregar_accesorio":
            # "También con puerta": se suma a lo que ya había elegido.
            previas = _normalizar_accesorios(_valor_previo(tracker, "accesorios"))
            familias = list(dict.fromkeys(previas + familias))
        return {"accesorios": familias}

    def validate_fuera_ciudad(
        self, value: Any, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict
    ) -> Dict[Text, Any]:
        return {"fuera_ciudad": value if isinstance(value, bool) else None}


class ActionCotizar(Action):
    """Envía la solicitud al backend. En el Sprint 3 el endpoint es simulado y no devuelve precio."""

    def name(self) -> Text:
        return "action_cotizar"

    async def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict) -> List[EventType]:
        tipo = _normalizar_tipo(tracker.get_slot("tipo_porton"))
        ancho, alto = _medidas(tracker)
        familias = _normalizar_accesorios(tracker.get_slot("accesorios"))
        try:
            compatibles = _accesorios_compatibles(await backend.obtener_catalogo(), tipo)
            sin_catalogo = [f for f in familias if f not in compatibles]
            if sin_catalogo:
                logger.warning("Accesorios sin equivalente para portón %s: %s", tipo, sin_catalogo)
            cotizacion = await backend.cotizar({
                "wa_id": tracker.sender_id,
                "tipo_porton": tipo.upper(),
                "ancho_m": float(ancho),
                "alto_m": float(alto),
                "accesorios": [compatibles[f]["codigo"] for f in familias if f in compatibles],
                "fuera_ciudad": bool(tracker.get_slot("fuera_ciudad")),
            })
        except backend.ErrorBackend:
            # Los datos se conservan: si el cliente vuelve a pedir la cotización, se reintenta sin preguntar.
            logger.exception("No se pudo registrar la cotización de %s", tracker.sender_id)
            dispatcher.utter_message(response="utter_error_backend")
            return []

        accesorios = ", ".join(a["nombre"] for a in cotizacion["accesorios"]) or "ninguno"
        entrega = "fuera de la ciudad" if cotizacion["fuera_ciudad"] else "en la ciudad"
        dispatcher.utter_message(
            text="¡Gracias! Registré su solicitud de cotización:\n"
            f"• Portón {cotizacion['tipo_porton'].lower()} de {formatear_metros(cotizacion['ancho_m'])} m × "
            f"{formatear_metros(cotizacion['alto_m'])} m ({formatear_metros(cotizacion['area_m2'])} m²)\n"
            f"• Accesorios: {accesorios}\n"
            f"• Entrega: {entrega}\n"
            "Un asesor revisará los datos y le enviará el precio final por este chat."
        )
        return [SlotSet(slot, None) for slot in SLOTS_COTIZACION]


class ActionReiniciarCotizacion(Action):
    def name(self) -> Text:
        return "action_reiniciar_cotizacion"

    async def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict) -> List[EventType]:
        return [SlotSet(slot, None) for slot in SLOTS_COTIZACION]
