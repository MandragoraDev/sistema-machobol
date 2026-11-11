"""Cifras y fechas en el formato que se usa en Bolivia: 1.740,50 · 19/11/2026 15:30."""
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

# Bolivia está en UTC−4 todo el año (sin horario de verano).
HORA_BOLIVIA = timezone(timedelta(hours=-4))


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


def formatear_m2(valor) -> str:
    """"8.8000" → "8,80"; "7.1595" → "7,1595" (entre 2 y 4 decimales)."""
    decimales = Decimal(str(valor)).normalize().as_tuple().exponent
    return formatear_decimal(valor, min(4, max(2, -decimales)))


def _hora_bolivia(iso: str) -> datetime:
    # Python 3.10 no acepta la "Z" final de las fechas ISO que envía el backend.
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(HORA_BOLIVIA)


def formatear_fecha(iso: str) -> str:
    """"2026-11-19T19:30:00.000Z" → "19/11/2026" (hora de Bolivia)."""
    return _hora_bolivia(iso).strftime("%d/%m/%Y")


def formatear_fecha_hora(iso: str) -> str:
    """"2026-11-04T19:30:00.000Z" → "15:30 del 04/11/2026" (hora de Bolivia)."""
    return _hora_bolivia(iso).strftime("%H:%M del %d/%m/%Y")
