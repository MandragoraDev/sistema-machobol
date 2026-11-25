"""Pruebas de las consultas generales y del estado de los pedidos.

Ejecutar desde rasa_bot/:  .venv\\Scripts\\python -m unittest discover -s tests -v
"""
import unittest

from actions.negocio import describir_pedido, describir_pedidos, responder, temas_de

# Como lo devuelve GET /api/internal/negocio.
NEGOCIO = {
    "ciudad": "Santa Cruz de la Sierra",
    "direccion": "4to anillo y calle Las Anguilas, a una cuadra de la radial 19",
    "maps_url": "https://maps.app.goo.gl/ygjFbw5tswdSbFnv9",
    "horarios": "De 7:30 a 21:00",
    "formas_pago": "QR, efectivo, transferencia y cheque",
    "tiempo_fabricacion": "De 3 semanas a 1 mes por portón",
    "cobertura": "Instalamos a nivel nacional.",
    "anticipo_pct": "50.00",
}


class Temas(unittest.TestCase):
    def test_reconoce_el_tema_de_la_pregunta(self):
        self.assertEqual(temas_de("¿Dónde están ubicados?"), ["ubicacion"])
        self.assertEqual(temas_de("a qué hora abren"), ["horario"])
        self.assertEqual(temas_de("aceptan pago con QR?"), ["pagos"])
        self.assertEqual(temas_de("cuánto tardan en hacer un portón"), ["fabricacion"])
        self.assertEqual(temas_de("hacen instalaciones en Cochabamba?"), ["cobertura"])

    def test_varios_temas_en_un_mensaje(self):
        self.assertEqual(temas_de("dónde queda la tienda y hasta qué hora atienden"), ["ubicacion", "horario"])

    def test_sin_tema_reconocible(self):
        self.assertEqual(temas_de("información por favor"), [])


class Responder(unittest.TestCase):
    def test_ubicacion_con_mapa(self):
        self.assertEqual(
            responder("dónde están?", NEGOCIO),
            "Estamos en 4to anillo y calle Las Anguilas, a una cuadra de la radial 19, Santa Cruz de la Sierra.\n"
            "Ubicación en el mapa: https://maps.app.goo.gl/ygjFbw5tswdSbFnv9",
        )

    def test_pagos_con_el_anticipo_configurado(self):
        self.assertEqual(
            responder("cómo se paga?", {**NEGOCIO, "anticipo_pct": "40.00"}),
            "Aceptamos QR, efectivo, transferencia y cheque. Para iniciar la fabricación se pide un anticipo del 40 % "
            "y el saldo se paga al momento de la instalación.",
        )

    def test_sin_tema_da_un_resumen(self):
        texto = responder("quiero información", NEGOCIO)
        self.assertIn("Estamos en 4to anillo", texto)
        self.assertIn("Nuestro horario de atención es de 7:30 a 21:00.", texto)
        self.assertIn("anticipo del 50 %", texto)


class EstadoPedido(unittest.TestCase):
    BASE = {"codigo": "MCH-2026-0004", "estado_nombre": "", "fase": None, "fecha_reunion": None,
            "fecha_instalacion": None, "precio": "21736.00", "pagado": "0.00", "saldo": "21736.00"}

    def test_en_fabricacion_con_instalacion_y_saldo(self):
        pedido = {**self.BASE, "estado": "EN_PRODUCCION", "fase": {"orden": 4, "nombre": "Corte y dimensionado"},
                  "fecha_instalacion": "2026-12-05", "pagado": "10868.00", "saldo": "10868.00"}
        self.assertEqual(
            describir_pedido(pedido),
            "*MCH-2026-0004*: en fabricación, etapa 4 de 11 (Corte y dimensionado). "
            "Instalación programada para el 05/12/2026. Saldo pendiente: 10.868 Bs.",
        )

    def test_reunion_agendada_en_hora_de_bolivia(self):
        pedido = {**self.BASE, "estado": "REUNION_AGENDADA", "fecha_reunion": "2026-11-27T14:00:00.000Z"}
        self.assertEqual(describir_pedido(pedido), "*MCH-2026-0004*: reunión con el asesor agendada para las 10:00 del 27/11/2026.")

    def test_cotizado_no_muestra_saldo(self):
        self.assertNotIn("Saldo", describir_pedido({**self.BASE, "estado": "COTIZADO"}))

    def test_sin_pedidos(self):
        self.assertEqual(describir_pedidos([]), "No encuentro pedidos a su nombre. Si quiere, le cotizo un portón ahora mismo.")


if __name__ == "__main__":
    unittest.main()
