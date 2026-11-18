"""Pruebas de la validación de medidas del formulario de cotización (sin servidor de Rasa).

Ejecutar desde rasa_bot/:  .venv\\Scripts\\python -m unittest discover -s tests -v
"""
import unittest

from rasa_sdk import Tracker
from rasa_sdk.executor import CollectingDispatcher

from actions.actions import _validar_medida


def conversacion(pregunta, previas, texto):
    """Tracker con los slots ya dados (`previas`), el bot preguntando `pregunta` y el cliente escribiendo `texto`."""
    eventos = [{"event": "slot", "name": nombre, "value": valor} for nombre, valor in previas.items()]
    eventos.append({"event": "user", "text": texto})
    return Tracker(
        "prueba", {**previas, "requested_slot": pregunta}, {"text": texto, "entities": [], "intent": {}},
        eventos, False, None, {"name": "formulario_cotizacion"}, None,
    )


class ValidarMedida(unittest.TestCase):
    def setUp(self):
        self.dispatcher = CollectingDispatcher()

    def test_una_entidad_que_no_es_medida_no_borra_la_medida_ya_dada(self):
        # DIET leyó "nomas" como alto mientras el bot preguntaba la madera.
        tracker = conversacion("tipo_madera", {"ancho": 3.0, "alto": 2.0}, "la puerta de ingreso nomas")
        self.assertEqual(_validar_medida("alto", "nomas", self.dispatcher, tracker), {"alto": 2.0})
        self.assertEqual(self.dispatcher.messages, [])

    def test_si_el_bot_pregunta_esa_medida_avisa_y_la_vuelve_a_pedir(self):
        tracker = conversacion("alto", {"ancho": 3.0}, "no se")
        self.assertEqual(_validar_medida("alto", "no se", self.dispatcher, tracker), {"alto": None})
        self.assertEqual(len(self.dispatcher.messages), 1)

    def test_una_medida_fuera_de_rango_siempre_se_avisa(self):
        tracker = conversacion("tipo_madera", {"ancho": 3.0, "alto": 2.0}, "el alto es 25")
        self.assertEqual(_validar_medida("alto", 25, self.dispatcher, tracker), {"alto": None})
        self.assertEqual(len(self.dispatcher.messages), 1)

    def test_una_medida_nueva_se_vuelve_a_confirmar(self):
        tracker = conversacion("tipo_madera", {"ancho": 3.0, "alto": 2.0}, "mejor 2,20 de alto")
        self.assertEqual(
            _validar_medida("alto", "2,20", self.dispatcher, tracker), {"alto": 2.2, "medidas_confirmadas": None}
        )


if __name__ == "__main__":
    unittest.main()
