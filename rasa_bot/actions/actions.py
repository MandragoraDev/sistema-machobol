"""Acciones del asistente: catálogo, consultas generales, cotización, solicitud de reunión y estado de los pedidos."""
import json
import logging
import re
from decimal import Decimal
from typing import Any, Dict, List, Optional, Text, Tuple

from rasa_sdk import Action, FormValidationAction, Tracker
from rasa_sdk.events import EventType, SlotSet
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.types import DomainDict

from . import backend
from .formato import formatear_bs, formatear_fecha, formatear_m2, formatear_metros
from .maderas import buscar_madera
from .negocio import describir_pedidos, responder
from .medidas import (
    MEDIDA_MAXIMA,
    MEDIDA_MINIMA,
    extraer_medidas,
    leer_medida,
    medida_valida,
    normalizar_texto,
)

logger = logging.getLogger(__name__)

SLOTS_COTIZACION = ["tipo_porton", "ancho", "alto", "medidas_confirmadas", "tipo_madera", "madera_id", "accesorios", "fuera_ciudad"]
SLOTS_PEDIDO = ["pedido_codigo", "pedido_confirmado", "preferencia_reunion"]

# Valor canónico de la entidad `accesorio` (sinónimos en data/nlu.yml) → prefijo de su código en el
# catálogo y título de su botón. Qué accesorio corresponde a cada tipo de portón lo decide el catálogo.
FAMILIAS_ACCESORIO = {
    "motor": {"prefijo": "MOTOR", "boton": "Motor"},
    "puerta_ingreso": {"prefijo": "PUERTA_INGRESO", "boton": "Puerta de ingreso"},
}
BOTON_NINGUNO = {"title": "Ninguno", "payload": "/negar"}
# Localidades a 45 minutos o más de Santa Cruz de la Sierra y otras ciudades del país (texto sin tildes).
LOCALIDADES_FUERA = (
    r"\b(montero|warnes|cotoca|la guardia|el torno|porongo|okinawa|portachuelo|minero|yapacani|san julian|samaipata|"
    r"camiri|puerto suarez|puerto quijarro|san ignacio|concepcion|cochabamba|la paz|el alto|sucre|tarija|oruro|potosi|"
    r"trinidad|cobija|riberalta)\b"
)


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
    if medida is None and tracker.get_slot("requested_slot") != slot:
        # Una entidad que no es una medida (DIET leyó "nomas" como alto en "la puerta de ingreso nomas") no borra
        # la medida ya dada ni genera avisos si el bot no estaba preguntando por ella.
        previa = leer_medida(_valor_previo(tracker, slot))
        return {slot: float(previa) if previa is not None else None}
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
    if producto["modo_precio"] == "FIJO":
        return f"{formatear_bs(producto['precio_fijo'])} Bs"
    precios = [f"{p['madera']} {formatear_bs(p['precio_m2'])} Bs/m²" for p in producto["precios"]]
    return " · ".join(precios) if precios else "precio a consultar"


def _payload_accesorio(familia: Text) -> Text:
    return "/agregar_accesorio" + json.dumps({"accesorio": familia})


def _payload_madera(madera: Dict[Text, Any]) -> Text:
    return "/elegir_madera" + json.dumps({"tipo_madera": madera["nombre"]})


async def _maderas_para(tipo: Optional[Text]) -> List[Dict[Text, Any]]:
    """Maderas con precio para el tipo de portón; si aún no se sabe el tipo, las de cualquier tipo."""
    tipos = [tipo] if tipo else ["corredizo", "batiente"]
    maderas: Dict[Any, Dict[Text, Any]] = {}
    for t in tipos:
        for madera in await backend.maderas_disponibles(t):
            maderas.setdefault(madera["id"], madera)
    return list(maderas.values())


def _mensaje_cotizacion(pedido: Dict[Text, Any]) -> Text:
    """Desglose del pedido que devuelve el cotizador del backend: un precio referencial (el final lo acuerda el asesor)."""
    tipo = pedido["producto"]["tipo_porton"].lower()
    lineas = [
        f"Su cotización *{pedido['codigo']}*:",
        f"• Portón {tipo} de {pedido['madera']['nombre']}, {formatear_metros(pedido['ancho_m'])} m × "
        f"{formatear_metros(pedido['alto_m'])} m = {formatear_m2(pedido['area_m2'])} m² × "
        f"{formatear_bs(pedido['precio_m2'])} Bs/m²: {formatear_bs(pedido['subtotal_base'])} Bs",
    ]
    lineas += [f"• {a['nombre']}: {formatear_bs(a['precio'])} Bs" for a in pedido["adicionales"]]
    if pedido.get("fuera_ciudad"):
        lineas.append("• Traslado fuera de la ciudad: se acuerda con el asesor")
    lineas.append(f"*Total referencial: {formatear_bs(pedido['total_final'])} Bs*")
    lineas.append(
        f"Es un precio referencial, válido hasta el {formatear_fecha(pedido['valido_hasta'])}: el precio final se acuerda "
        "con un asesor. Le envío la proforma en PDF."
    )
    return "\n".join(lineas)


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


class ActionPreguntarMadera(Action):
    """Ofrece las maderas que hay en la base de datos para ese portón, con su precio por m²."""

    def name(self) -> Text:
        return "action_ask_tipo_madera"

    async def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict) -> List[EventType]:
        tipo = _normalizar_tipo(tracker.get_slot("tipo_porton"))
        ancho, alto = _medidas(tracker)
        try:
            maderas = await backend.maderas_disponibles(tipo, ancho, alto)
        except backend.ErrorBackend:
            logger.exception("No se pudieron leer las maderas")
            dispatcher.utter_message(response="utter_error_backend")
            return []
        if not maderas:
            dispatcher.utter_message(text=f"Por ahora no tengo precios de madera para portones {tipo}s. Un asesor le escribirá en breve.")
            return []

        # Se ofrecen las que alcanzan para estas medidas; si ninguna alcanza, todas (la fabricación esperaría stock).
        con_stock = [m for m in maderas if m.get("stock_suficiente")]
        lineas = [f"¿En qué madera lo quiere? Precio por m² del portón {tipo}:"]
        lineas += [
            f"• {m['nombre']}: {formatear_bs(m['precio_m2'])} Bs/m²" + ("" if m.get("stock_suficiente") else " (sin stock suficiente por ahora)")
            for m in maderas
        ]
        dispatcher.utter_message(
            text="\n".join(lineas),
            buttons=[{"title": m["nombre"], "payload": _payload_madera(m)} for m in (con_stock or maderas)],
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
        # El traslado no tiene un precio fijo: se acuerda con el asesor (decisión del 2026-11-25).
        dispatcher.utter_message(
            text="¿La instalación será *fuera de la ciudad* (a 45 minutos o más)? En ese caso, el traslado tiene un "
            "costo adicional que se acuerda con el asesor.",
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
        if re.search(r"\b(fuera|afueras?|provincia|lejos|otro departamento|otra ciudad)\b", texto) or re.search(LOCALIDADES_FUERA, texto):
            return {"fuera_ciudad": True}
        # "Sí, es en Montero" o "no, aquí nomás": el modelo puede leerlo como otra intención, pero responde a la pregunta.
        if re.match(r"(si|claro|asi es|exacto|correcto)\b", texto):
            return {"fuera_ciudad": True}
        if re.match(r"no\b", texto):
            return {"fuera_ciudad": False}
        return {}

    async def extract_tipo_madera(
        self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict
    ) -> Dict[Text, Any]:
        # Cuando el bot pregunta la madera, reconoce cualquier especie de la base de datos aunque DIET no la extraiga.
        if tracker.get_slot("requested_slot") != "tipo_madera":
            return {}
        if any(e.get("entity") == "tipo_madera" for e in tracker.latest_message.get("entities", [])):
            return {}
        try:
            madera = buscar_madera(tracker.latest_message.get("text"), await _maderas_para(_normalizar_tipo(tracker.get_slot("tipo_porton"))))
        except backend.ErrorBackend:
            logger.exception("No se pudieron leer las maderas")
            return {}
        return {"tipo_madera": madera["nombre"]} if madera else {}

    async def validate_tipo_porton(
        self, value: Any, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict
    ) -> Dict[Text, Any]:
        tipo = _normalizar_tipo(value)
        if tipo is None:
            # Una entidad dudosa (DIET leyó "dos" como tipo en "tres por dos veinte") no borra el tipo ya elegido.
            previo = _normalizar_tipo(_valor_previo(tracker, "tipo_porton"))
            if previo:
                return {"tipo_porton": previo}
            if tracker.get_slot("requested_slot") == "tipo_porton":
                dispatcher.utter_message(response="utter_tipo_porton_invalido")
            return {"tipo_porton": None}
        # Si eligió la madera en un mensaje anterior (p. ej. antes que el tipo), debe tener precio para este tipo.
        # Si la nombró en este mismo mensaje, la revisa validate_tipo_madera.
        if tracker.get_slot("tipo_madera") and "tipo_madera" not in tracker.slots_to_validate():
            return {"tipo_porton": tipo, **await self._madera_para(tracker.get_slot("tipo_madera"), tipo, dispatcher)}
        return {"tipo_porton": tipo}

    async def validate_tipo_madera(
        self, value: Any, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict
    ) -> Dict[Text, Any]:
        tipo = _normalizar_tipo(tracker.get_slot("tipo_porton"))
        # Si el bot no está preguntando la madera y ya había una elegida, una entidad dudosa no la borra ni genera avisos.
        previa = {"tipo_madera": _valor_previo(tracker, "tipo_madera"), "madera_id": _valor_previo(tracker, "madera_id")}
        if previa["madera_id"] and tracker.get_slot("requested_slot") != "tipo_madera":
            resultado = await self._madera_para(value, tipo, dispatcher, avisar=False)
            return resultado if resultado["madera_id"] else previa
        return await self._madera_para(value, tipo, dispatcher)

    @staticmethod
    async def _madera_para(nombre: Any, tipo: Optional[Text], dispatcher: CollectingDispatcher, avisar: bool = True) -> Dict[Text, Any]:
        """{tipo_madera, madera_id} si la madera existe y tiene precio para ese tipo de portón; si no, ambos en None."""
        vacio = {"tipo_madera": None, "madera_id": None}
        try:
            maderas = await _maderas_para(tipo)
        except backend.ErrorBackend:
            logger.exception("No se pudieron leer las maderas")
            dispatcher.utter_message(response="utter_error_backend")
            return vacio
        madera = buscar_madera(nombre if isinstance(nombre, str) else None, maderas)
        if madera:
            return {"tipo_madera": madera["nombre"], "madera_id": madera["id"]}
        if not avisar:
            return vacio
        opciones = ", ".join(m["nombre"] for m in maderas)
        porton = f" para portones {tipo}s" if tipo else ""
        dispatcher.utter_message(text=f"No tenemos «{nombre}»{porton}. Trabajamos con: {opciones}." if opciones else "Por ahora no tengo maderas disponibles.")
        return vacio

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
    """Pide el precio al cotizador del backend, que además crea el pedido; envía el desglose y la proforma."""

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
            pedido = await backend.cotizar({
                "wa_id": tracker.sender_id,
                "tipo_porton": tipo.upper(),
                "madera_id": tracker.get_slot("madera_id"),
                "ancho_m": float(ancho),
                "alto_m": float(alto),
                "accesorios": [compatibles[f]["codigo"] for f in familias if f in compatibles],
                "fuera_ciudad": bool(tracker.get_slot("fuera_ciudad")),
            })
        except backend.ErrorBackend:
            # Los datos se conservan: si el cliente vuelve a pedir la cotización, se reintenta sin preguntar.
            logger.exception("No se pudo cotizar para %s", tracker.sender_id)
            dispatcher.utter_message(response="utter_error_backend")
            return [SlotSet("pedido_codigo", None)]

        dispatcher.utter_message(text=_mensaje_cotizacion(pedido))
        # El backend arma el PDF y lo adjunta; Rasa solo indica qué documento enviar.
        dispatcher.utter_message(json_message={"adjunto": "proforma", "pedido": pedido["codigo"]})
        return [SlotSet(slot, None) for slot in SLOTS_COTIZACION] + [SlotSet("pedido_codigo", pedido["codigo"])]


class ValidarFormularioConfirmarPedido(FormValidationAction):
    def name(self) -> Text:
        return "validate_formulario_confirmar_pedido"

    async def required_slots(
        self, domain_slots: List[Text], dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict
    ) -> List[Text]:
        # Si la cotización falló no hay pedido: el formulario termina sin preguntar. El horario de la reunión
        # solo se pregunta si el cliente quiere agendarla.
        if not tracker.get_slot("pedido_codigo"):
            return []
        return ["pedido_confirmado"] + (["preferencia_reunion"] if tracker.get_slot("pedido_confirmado") else [])

    def validate_pedido_confirmado(
        self, value: Any, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict
    ) -> Dict[Text, Any]:
        return {"pedido_confirmado": value if isinstance(value, bool) else None}

    def validate_preferencia_reunion(
        self, value: Any, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict
    ) -> Dict[Text, Any]:
        texto = value.strip()[:300] if isinstance(value, str) else ""
        return {"preferencia_reunion": texto or None}


class ActionProcesarConfirmacionPedido(Action):
    """Cotización aceptada → solicitud de reunión con un asesor (sin cobro). No aceptada → la cotización queda guardada."""

    def name(self) -> Text:
        return "action_procesar_confirmacion_pedido"

    async def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict) -> List[EventType]:
        codigo = tracker.get_slot("pedido_codigo")
        reinicio = [SlotSet(slot, None) for slot in SLOTS_PEDIDO]
        if not codigo:
            return reinicio

        if not tracker.get_slot("pedido_confirmado"):
            dispatcher.utter_message(
                text=f"Entendido. Su cotización *{codigo}* queda guardada. "
                "Cuando quiera agendar la reunión con un asesor, escríbanos por aquí."
            )
            return reinicio

        preferencia = tracker.get_slot("preferencia_reunion")
        try:
            await backend.solicitar_reunion(codigo, tracker.sender_id, preferencia)
            negocio = await backend.obtener_negocio()
        except backend.ErrorBackend:
            logger.exception("No se pudo registrar la reunión del pedido %s", codigo)
            dispatcher.utter_message(text="No pude registrar su solicitud en este momento. Un asesor le escribirá en breve por este chat.")
            return reinicio

        anticipo = f"{Decimal(str(negocio['anticipo_pct'])).normalize():f}".replace(".", ",")
        dispatcher.utter_message(
            text=f"¡Listo! Registramos su solicitud de reunión para el pedido *{codigo}*"
            + (f" ({preferencia})" if preferencia else "")
            + ". Un asesor le escribirá para confirmar el día y la hora. "
            f"Para iniciar la fabricación se pide un anticipo del {anticipo} % y el saldo se paga al momento de la instalación."
        )
        return reinicio


class ActionInformarNegocio(Action):
    """Consultas generales (ubicación, horario, formas de pago, tiempo de fabricación, cobertura). Nunca hay cobro."""

    def name(self) -> Text:
        return "action_informar_negocio"

    async def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict) -> List[EventType]:
        try:
            negocio = await backend.obtener_negocio()
        except backend.ErrorBackend:
            logger.exception("No se pudieron leer los datos del negocio")
            dispatcher.utter_message(response="utter_error_backend")
            return []
        dispatcher.utter_message(text=responder(tracker.latest_message.get("text") or "", negocio))
        return []


class ActionConsultarEstadoPedido(Action):
    """"¿Cómo va mi pedido?": estado, etapa y saldo de los pedidos del cliente que escribe (o de uno, por su código)."""

    def name(self) -> Text:
        return "action_consultar_estado_pedido"

    async def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict) -> List[EventType]:
        codigo = next(tracker.get_latest_entity_values("codigo_pedido"), None)
        if not codigo:
            encontrado = re.search(r"\bmch-\d{4}-\d{4,}\b", _texto(tracker))
            codigo = encontrado.group(0) if encontrado else None
        try:
            pedidos = await backend.estado_pedidos(tracker.sender_id, codigo.upper() if codigo else None)
        except backend.ErrorBackend:
            logger.exception("No se pudo consultar el estado de los pedidos de %s", tracker.sender_id)
            dispatcher.utter_message(response="utter_error_backend")
            return []
        if codigo and not pedidos:
            dispatcher.utter_message(text=f"No encuentro el pedido {codigo.upper()} a su nombre. Revise el código, por favor.")
            return []
        dispatcher.utter_message(text=describir_pedidos(pedidos))
        return []


class ActionReiniciarCotizacion(Action):
    def name(self) -> Text:
        return "action_reiniciar_cotizacion"

    async def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: DomainDict) -> List[EventType]:
        return [SlotSet(slot, None) for slot in SLOTS_COTIZACION + SLOTS_PEDIDO]
