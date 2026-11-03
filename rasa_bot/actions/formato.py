"""Cifras en el formato que se usa en Bolivia: miles con punto y decimales con coma (1.740,50)."""
from decimal import ROUND_HALF_UP, Decimal


def formatear_decimal(valor, decimales: int) -> str:
    cantidad = Decimal(str(valor)).quantize(Decimal(1).scaleb(-decimales), rounding=ROUND_HALF_UP)
    entero, _, fraccion = f"{abs(cantidad):f}".partition(".")
    signo = "-" if cantidad < 0 else ""
    entero = f"{int(entero):,}".replace(",", ".")
    return f"{signo}{entero},{fraccion}" if fraccion else f"{signo}{entero}"


def formatear_metros(valor) -> str:
    """4 → "4,00"."""
    return formatear_decimal(valor, 2)


def formatear_bs(valor) -> str:
    """1740 → "1.740"; 9262.5 → "9.262,50" (los centavos solo se muestran si los hay)."""
    cantidad = Decimal(str(valor))
    return formatear_decimal(cantidad, 0 if cantidad == cantidad.to_integral_value() else 2)
