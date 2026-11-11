"""Pruebas del reconocimiento de la madera que nombra el cliente.

Ejecutar desde rasa_bot/:  .venv\\Scripts\\python -m unittest discover -s tests -v
"""
import unittest

from actions.maderas import buscar_madera

# Como las devuelve GET /api/internal/maderas.
CEDRO_1 = {"id": 1, "nombre": "Cedro 1″", "especie": "Cedro", "espesor_pulg": "1.00", "precio_m2": "2470.00"}
CEDRO_2 = {"id": 3, "nombre": "Cedro 2″", "especie": "Cedro", "espesor_pulg": "2.00", "precio_m2": "2900.00"}
TAJIBO = {"id": 2, "nombre": "Tajibo 30″", "especie": "tajibo", "espesor_pulg": "30.00", "precio_m2": "2900.00"}
PALO_MARIA = {"id": 4, "nombre": "Palo maría 1,5″", "especie": "Palo maría", "espesor_pulg": "1.50", "precio_m2": "3100.00"}


class BuscarMadera(unittest.TestCase):
    def test_nombre_exacto_de_un_boton(self):
        self.assertIs(buscar_madera("Tajibo 30″", [CEDRO_1, TAJIBO]), TAJIBO)

    def test_especie_dentro_de_una_frase_sin_importar_tildes_ni_mayusculas(self):
        self.assertIs(buscar_madera("de TAJIBO por favor", [CEDRO_1, TAJIBO]), TAJIBO)
        self.assertIs(buscar_madera("quiero palo maria", [CEDRO_1, PALO_MARIA]), PALO_MARIA)

    def test_especie_que_el_modelo_nunca_vio(self):
        sirari = {"id": 9, "nombre": "Sirari 1″", "especie": "Sirari", "espesor_pulg": "1.00", "precio_m2": "2600.00"}
        self.assertIs(buscar_madera("sirari", [CEDRO_1, sirari]), sirari)

    def test_misma_especie_en_varios_espesores(self):
        maderas = [CEDRO_1, CEDRO_2, TAJIBO]
        self.assertIsNone(buscar_madera("cedro", maderas))  # ambiguo: el bot vuelve a preguntar
        self.assertIs(buscar_madera("cedro de 2 pulgadas", maderas), CEDRO_2)
        self.assertIs(buscar_madera("Palo maría 1.5", [PALO_MARIA]), PALO_MARIA)

    def test_sin_coincidencias(self):
        self.assertIsNone(buscar_madera("roble", [CEDRO_1, TAJIBO]))
        self.assertIsNone(buscar_madera("cedrillo", [CEDRO_1]))  # otra especie, no "cedro"
        self.assertIsNone(buscar_madera("", [CEDRO_1]))
        self.assertIsNone(buscar_madera(None, [CEDRO_1]))


if __name__ == "__main__":
    unittest.main()
