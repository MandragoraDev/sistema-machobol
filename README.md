# Sistema Web Integral y Asistente Virtual — MACHOBOL

Ventas por WhatsApp, cotización paramétrica de portones, inventario de madera en m² y seguimiento de producción en 11 fases.
El plan completo, las reglas de negocio y el modelo de datos están en [PLAN_MACHOBOL.md](PLAN_MACHOBOL.md).

| Carpeta | Contenido |
|---|---|
| [backend/](backend/) | API REST (Node.js + Express 5 + PostgreSQL) |
| [frontend/](frontend/) | Panel web (React 19 + Vite + TailwindCSS) |
| [rasa_bot/](rasa_bot/) | Asistente virtual de WhatsApp (Rasa 3.6, Python 3.10) |

## Requisitos

- Node.js 20 o superior
- PostgreSQL 16 o superior
- Python 3.10 (solo para el asistente de Rasa)

## Puesta en marcha

### 1. Base de datos y API

```bash
cd backend
npm install
cp .env.example .env      # en PowerShell: Copy-Item .env.example .env
```

Edita `backend/.env`:

- `DATABASE_URL`: elige la contraseña del rol `machobol_app`.
- `TEST_DATABASE_URL`: la base que usan las pruebas (`machobol_test`). Las pruebas la vacían: nunca apuntes aquí a datos reales.
- `PG_ADMIN_URL`: pon la contraseña del usuario `postgres` que definiste al instalar PostgreSQL.
- `JWT_SECRET`: al menos 32 caracteres aleatorios (el `.env.example` indica cómo generarlo).
- `ADMIN_EMAIL` y `ADMIN_PASSWORD`: credenciales del primer usuario Admin del panel.
- `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` y `SERVICE_TOKEN`: secretos del webhook y del asistente
  (ver la sección 3). Mientras no tengas la app de Meta, pon valores aleatorios.

Luego:

```bash
npm run db:setup     # crea el rol machobol_app y las bases machobol y machobol_test (una sola vez)
npm run db:migrate   # crea las tablas
npm run db:seed      # carga catálogo (precios en Bs), fases, estados y el usuario Admin
npm run dev          # API en http://localhost:4000
```

Comprueba que responde: <http://localhost:4000/api/health> → `{"status":"ok","db":"ok"}`.

### 2. Panel web

En otra terminal:

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Vite reenvía `/api` a `localhost:4000`, así que en desarrollo no hace falta configurar CORS.
Abre <http://localhost:5173>: te lleva al login. Entra con `ADMIN_EMAIL` / `ADMIN_PASSWORD` y crea desde **Usuarios**
las cuentas de Ventas y Taller; cada rol ve su propio menú y Dashboard.

### 3. Asistente de WhatsApp (Rasa)

La instalación, el entrenamiento y el arranque están en [rasa_bot/README.md](rasa_bot/README.md). En resumen, con la
API ya levantada, abre dos terminales más en `rasa_bot/`:

```powershell
.venv\Scripts\rasa run actions --port 5055                 # servidor de acciones
.venv\Scripts\rasa run --interface 127.0.0.1 --port 5005   # Rasa
```

Recorrido de un mensaje: Meta → `POST /api/webhooks/whatsapp` (verifica la firma HMAC, descarta repetidos por
`wa_message_id`, registra al cliente y responde 200) → Rasa → servidor de acciones → `/api/internal/*`
(autenticado con `X-Service-Token`) → respuesta por la Graph API.

**Probar sin Meta (modo simulado).** Con `WHATSAPP_ACCESS_TOKEN` vacío, las respuestas del bot no salen hacia
Meta: quedan en la tabla `mensajes_whatsapp`. El simulador envía al webhook mensajes con el mismo formato y
firma que Meta y muestra lo que contesta el bot:

```bash
cd backend
npm run whatsapp:simular                                  # chat interactivo; escribe el número de un botón para pulsarlo
npm run whatsapp:simular -- "quiero un portón corredizo de 4 por 2,20"
npm run whatsapp:simular -- --repetir "hola"              # mismo wa_message_id dos veces: se procesa una sola
npm run whatsapp:simular -- --firma-invalida "hola"       # la API responde 401
```

**Probar con WhatsApp real.** Meta exige una URL HTTPS pública para el webhook:

1. Instala cloudflared una vez: `winget install --id Cloudflare.cloudflared` (no requiere cuenta).
2. En `backend/.env` pon el **App Secret** real, el **token de acceso** y el **Phone Number ID** de tu app de Meta
   (panel de Meta → tu app → WhatsApp → Configuración de la API) y reinicia la API.
3. `npm run tunel` (en `backend/`) imprime una URL `https://….trycloudflare.com`. Cambia en cada arranque.
4. En Meta → WhatsApp → Configuración → Webhook: URL de devolución `https://….trycloudflare.com/api/webhooks/whatsapp`,
   token de verificación = `WHATSAPP_VERIFY_TOKEN`. Luego suscribe el campo **messages**.
5. Agrega tu celular como número de prueba en Meta y escríbele al número de prueba de WhatsApp.

Mientras el túnel está abierto, toda la API es accesible desde internet: ciérralo (Ctrl+C) al terminar de probar.

## Scripts del backend

| Script | Qué hace |
|---|---|
| `npm run dev` | API con recarga automática |
| `npm test` | Pruebas (Jest + Supertest). Las de integración usan PostgreSQL real en `TEST_DATABASE_URL`; sin esa variable se omiten |
| `npm run db:setup` | Crea el rol y las bases de `DATABASE_URL` y `TEST_DATABASE_URL` usando `PG_ADMIN_URL` (idempotente) |
| `npm run db:migrate` | Aplica las migraciones pendientes |
| `npm run db:rollback` | Revierte la última migración |
| `npm run db:reset` | Revierte todas las migraciones, las vuelve a aplicar y ejecuta el seed (**borra los datos**) |
| `npm run db:seed` | Carga los datos base (idempotente: no sobrescribe lo editado) |
| `npm run db:migration:create -- <nombre>` | Crea una nueva migración SQL |
| `npm run whatsapp:simular` | Simula un cliente de WhatsApp contra el webhook local (ver la sección 3) |
| `npm run tunel` | Abre un túnel HTTPS público hacia la API con cloudflared, para el webhook de Meta |
