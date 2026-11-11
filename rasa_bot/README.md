# rasa_bot

Asistente virtual de WhatsApp de MACHOBOL (Rasa Open Source 3.6). Entiende al cliente, recoge los datos de la
cotización y pide al backend todo lo que tenga que ver con el negocio. Nunca calcula precios ni toca la base de datos.

```
WhatsApp → backend /api/webhooks/whatsapp → Rasa :5005 (canal REST) → servidor de acciones :5055 → backend /api/internal/*
```

| Archivo | Contenido |
|---|---|
| `data/nlu.yml` | Intents, entidades (`tipo_porton`, `tipo_madera`, `ancho`, `alto`, `accesorio`, `codigo_pedido`), sinónimos, tabla de búsqueda de maderas y expresiones regulares |
| `data/rules.yml` | Respuestas fijas, inicio y cierre de la cotización, e interrupciones dentro del formulario |
| `domain.yml` | Slots, formulario `formulario_cotizacion` y textos del bot (trato de "usted") |
| `actions/` | Acciones personalizadas: catálogo, validación de los formularios, cotización y QR de pago (todo lo calcula el backend) |
| `actions/medidas.py` | Lector de medidas ("4x2,20", "2,20 de alto", "dos por dos y medio"), con pruebas en `tests/` |
| `actions/maderas.py` | Reconoce la madera que nombra el cliente entre las que ofrece el backend (también especies que el modelo nunca vio) |

**Maderas:** el bot no conoce ninguna de antemano. Tras confirmar las medidas pide al backend las maderas con precio para
ese portón y las ofrece con botones (solo las que tienen stock suficiente para esas medidas, si alguna lo tiene).

**Archivos:** la proforma y el QR no pasan por Rasa. El bot responde con un mensaje `custom`
(`{"adjunto": "proforma" | "qr_pago", "pedido": "MCH-…"}`) y el backend genera el archivo, comprueba que el pedido
sea de quien conversa y lo envía por WhatsApp.

**Convención de medidas:** si el cliente da dos medidas sin decir cuál es cuál ("4 por 2,20"), la primera es el
ancho y la segunda el alto. El bot siempre pide confirmarlas antes de seguir.

## Requisitos

Python **3.10** (Rasa 3.6 no funciona con 3.11 o superior). En Windows, con el lanzador `py`:

```powershell
cd rasa_bot
py -3.10 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
Copy-Item .env.example .env      # y pega en SERVICE_TOKEN el mismo valor que en backend/.env
.venv\Scripts\rasa telemetry disable   # opcional: Rasa envía estadísticas de uso anónimas por defecto
```

## Entrenar y levantar

```powershell
.venv\Scripts\rasa train                                   # genera models/<fecha>.tar.gz (≈ 2 min)
.venv\Scripts\rasa run actions --port 5055                 # terminal 1: servidor de acciones
.venv\Scripts\rasa run --interface 127.0.0.1 --port 5005   # terminal 2: Rasa (usa el último modelo)
```

- Rasa se levanta **sin `--enable-api`** y solo en `127.0.0.1`: únicamente el backend de este equipo le habla.
- El servidor de acciones también escucha solo en `127.0.0.1` (lo fija `actions/__init__.py`).
- Las conversaciones viven en memoria: al reiniciar Rasa, cada cliente empieza de cero. El historial completo
  queda en la tabla `mensajes_whatsapp` del backend.
- Si cambias algo en `actions/`, reinicia el servidor de acciones. Si cambias `data/` o `domain.yml`, vuelve a
  entrenar y reinicia Rasa.

Para probar una conversación completa usa el simulador del backend: `npm run whatsapp:simular` (ver el README principal).

## Pruebas

```powershell
.venv\Scripts\rasa data validate                                       # dominio, datos e historias
.venv\Scripts\rasa test nlu --cross-validation --folds 5 --out results  # F1 de intents y entidades
.venv\Scripts\python -m unittest discover -s tests -v                  # lector de medidas y formato
```

`rasa data validate` avisa que algunas respuestas (`utter_ask_*`, `utter_tipo_porton_invalido`…) no aparecen
en historias. Es esperado: las usa el formulario o las acciones.
