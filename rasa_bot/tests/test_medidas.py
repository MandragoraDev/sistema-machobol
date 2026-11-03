"""Pruebas del lector de medidas y del formato de cifras.

Ejecutar desde rasa_bot/:  .venv\\Scripts\\python -m unittest discover -s tests -v
"""
import unittest
from decimal import Decimal

from actions.formato import formatear_bs, formatear_metros
from actions.medidas import extraer_medidas, leer_medida, medida_valida

D = Decimal


class ExtraerMedidas(unittest.TestCase):
    def comprobar(self, texto, esperado):
        self.assertEqual(extraer_medidas(texto), {k: D(v) for k, v in esperado.items()}, texto)

    def test_dos_medidas_sin_etiqueta_son_ancho_por_alto(self):
        self.comprobar("quiero un portón corredizo de 4 por 2,20", {"ancho": "4.00", "alto": "2.20"})
        self.comprobar("4x2.20", {"ancho": "4.00", "alto": "2.20"})
        self.comprobar("4.5 × 2.4 m", {"ancho": "4.50", "alto": "2.40"})
        self.comprobar("mide 4 por 2.20 metros", {"ancho": "4.00", "alto": "2.20"})

    def test_las_etiquetas_mandan_sobre_el_orden(self):
        self.comprobar("2,20 de alto por 4 de ancho", {"ancho": "4.00", "alto": "2.20"})
        self.comprobar("alto 2.40 y ancho 5", {"ancho": "5.00", "alto": "2.40"})
        self.comprobar("el ancho es de 3,80 metros y la altura 2", {"ancho": "3.80", "alto": "2.00"})
        self.comprobar("2 de alto 3 de ancho", {"ancho": "3.00", "alto": "2.00"})

    def test_una_etiquetada_y_otra_suelta(self):
        self.comprobar("4 metros y 2,20 de alto", {"ancho": "4.00", "alto": "2.20"})
        self.comprobar("2,20 de alto por 4", {"ancho": "4.00", "alto": "2.20"})

    def test_una_sola_medida(self):
        self.comprobar("mide 3,5 m de ancho", {"ancho": "3.50"})
        self.comprobar("2.20m", {"sin_etiqueta": "2.20"})
        self.comprobar("unos 3 metros", {"sin_etiqueta": "3.00"})

    def test_palabras_y_centimetros(self):
        self.comprobar("dos por dos y medio", {"ancho": "2.00", "alto": "2.50"})
        self.comprobar("400 por 220 centímetros", {"ancho": "4.00", "alto": "2.20"})
        self.comprobar("220 cm de alto", {"alto": "2.20"})

    def test_textos_sin_medidas(self):
        self.comprobar("quiero un portón", {})
        self.comprobar("ninguno, gracias", {})
        self.comprobar("cómo va mi pedido MCH-2026-0001", {})
        self.comprobar("/confirmar", {})

    def test_otros_numeros_no_confunden_el_par(self):
        self.comprobar("tengo 2 portones de 4 por 2", {"ancho": "4.00", "alto": "2.00"})


class LeerMedida(unittest.TestCase):
    def test_valores_de_slot(self):
        self.assertEqual(leer_medida("2,20 m"), D("2.20"))
        self.assertEqual(leer_medida(2.2), D("2.20"))
        self.assertEqual(leer_medida(["4", "2"]), D("4.00"))
        self.assertEqual(leer_medida("220"), D("2.20"))
        self.assertIsNone(leer_medida("abc"))
        self.assertIsNone(leer_medida(None))
        self.assertIsNone(leer_medida(True))

    def test_rango(self):
        self.assertTrue(medida_valida(D("0.30")))
        self.assertTrue(medida_valida(D("20.00")))
        self.assertFalse(medida_valida(D("0.29")))
        self.assertFalse(medida_valida(D("20.01")))


class Formato(unittest.TestCase):
    def test_bolivianos(self):
        self.assertEqual(formatear_bs("1740.00"), "1.740")
        self.assertEqual(formatear_bs(9262.5), "9.262,50")
        self.assertEqual(formatear_bs(150), "150")
        self.assertEqual(formatear_bs("23476.00"), "23.476")

    def test_metros(self):
        self.assertEqual(formatear_metros(4), "4,00")
        self.assertEqual(formatear_metros("8.8000"), "8,80")
        self.assertEqual(formatear_metros(2.205), "2,21")


if __name__ == "__main__":
    unittest.main()
