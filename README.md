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
- Base de datos: proyecto de **Supabase** (PostgreSQL 17), donde vive la base del sistema
- PostgreSQL 16 o superior en el equipo, solo para las pruebas automáticas (`machobol_test`)
- Python 3.10 (solo para el asistente de Rasa)

## Levantar el proyecto (día a día)

Con todo ya instalado, doble clic en **`iniciar.cmd`** (raíz del proyecto). Revisa la configuración de la base (Supabase,
o PostgreSQL local si `DATABASE_URL` apunta a `localhost`), abre la
API, Rasa, el servidor de acciones y el panel, cada uno en su ventana, y avisa cuando todo responde. Para detener todo,
cierra esas ventanas. `iniciar.cmd -Recarga` levanta la API con recarga automática (útil al programar el backend; cada
reinicio corta las respuestas del bot en curso).

A mano, en cuatro terminales:

| Servicio | Carpeta | Comando |
|---|---|---|
| API (4000) | `backend` | `npm start` (o `npm run dev` para recarga automática) |
| Acciones Rasa (5055) | `rasa_bot` | `.venv\Scripts\rasa run actions --port 5055` |
| Rasa (5005) | `rasa_bot` | `.venv\Scripts\rasa run --interface 127.0.0.1 --port 5005` |
| Panel (5173) | `frontend` | `npm run dev` |

Panel: <http://localhost:5173>. Chat de prueba: `npm run whatsapp:simular` en `backend`.
Después de un `git pull`, ejecuta `npm run db:migrate` en `backend` (y `rasa train` en `rasa_bot` si cambió `data/` o `domain.yml`).

## Puesta en marcha

### 1. Base de datos y API

```bash
cd backend
npm install
cp .env.example .env      # en PowerShell: Copy-Item .env.example .env
```

La base del sistema está en **Supabase**. Para crearla en un proyecto nuevo:

1. En Supabase, **SQL Editor → New query**: pega y ejecuta [docs/supabase/machobol_supabase.sql](docs/supabase/machobol_supabase.sql)
   (tablas, reglas, triggers, datos base y el bloqueo de la API pública). Luego ejecuta
   [docs/supabase/verificar.sql](docs/supabase/verificar.sql): todas las filas deben decir ✅.
   Alternativa sin SQL Editor: con `DATABASE_URL` ya configurada, `npm run db:migrate` crea lo mismo.
2. Descarga el certificado (**Project Settings → Database → SSL Configuration → Download certificate**) y guárdalo
   como `backend/certs/supabase-ca.crt`.
3. Copia la cadena del **Session pooler** (**Connect → Connection String**) en `DATABASE_URL`, con la contraseña de la
   base y `?sslmode=verify-full&sslrootcert=certs/supabase-ca.crt` al final (ver `.env.example`). No uses
   "Direct connection": en el plan gratuito solo funciona por IPv6.

La migración `1793620807000_proteger-api-de-supabase` activa RLS en todas las tablas y quita los permisos de `anon` y
`authenticated`: la publishable key de Supabase no puede leer ni modificar nada. Solo el backend accede a los datos.

La base tiene **contenido de prueba** para probar el sistema desplegado: usuarios `ventas.prueba@` y `taller.prueba@machobol.local`,
la madera Tajibo con precios inventados, trocas de ingreso, clientes "Cliente demo · …" con pedidos pagados en distintas
etapas y una cotización por WhatsApp sin pagar. Antes de operar con clientes reales, ejecuta una sola vez
[docs/supabase/limpiar-datos-de-prueba.sql](docs/supabase/limpiar-datos-de-prueba.sql) en el SQL Editor: borra todo eso y
conserva el catálogo y el Administrador.

Edita `backend/.env`:

- `DATABASE_URL`: la cadena de Supabase descrita arriba (o, para trabajar sin conexión, un PostgreSQL local; ver `.env.example`).
- `TEST_DATABASE_URL`: la base que usan las pruebas (`machobol_test`, en el PostgreSQL local). Las pruebas la vacían:
  nunca apuntes aquí a Supabase ni a datos reales.
- `PG_ADMIN_URL`: pon la contraseña del usuario `postgres` que definiste al instalar PostgreSQL (solo para `db:setup`).
- `JWT_SECRET`: al menos 32 caracteres aleatorios (el `.env.example` indica cómo generarlo).
- `ADMIN_EMAIL` y `ADMIN_PASSWORD`: credenciales del primer usuario Admin del panel.
- `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` y `SERVICE_TOKEN`: secretos del webhook y del asistente
  (ver la sección 3). Mientras no tengas la app de Meta, pon valores aleatorios.
- `PAGOS_WEBHOOK_SECRET`: secreto con que la pasarela firma sus callbacks (con la pasarela simulada, cualquier valor
  aleatorio de 32 caracteres o más). `COTIZACION_VALIDEZ_DIAS` y `PAGOS_QR_VIGENCIA_MINUTOS` tienen valores por defecto.

Luego:

```bash
npm run db:setup     # crea el rol machobol_app y la base local machobol_test de las pruebas (una sola vez)
npm run db:migrate   # aplica las migraciones pendientes (en Supabase, si ya corriste el script, no hay ninguna)
npm run db:seed      # carga catálogo (precios en Bs), fases, estados y el usuario Admin (idempotente)
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

### 4. Cotizaciones, pedidos y pagos QR

El cotizador aplica la fórmula del [plan](PLAN_MACHOBOL.md#21-cotizador-paramétrico-regla-fija) con aritmética entera
(centímetros y centavos) y cobra el **monto exacto**, sin redondeos. El precio por m² depende del tipo de portón y de la
madera que elige el cliente: el Admin lo fija en **Inventario → Editar madera** (una madera sin precio no se ofrece).
Cada cotización crea un pedido `MCH-AAAA-NNNN` con los precios congelados y su proforma en PDF. La madera se descuenta
**solo** cuando la pasarela confirma el pago, dentro de una transacción ACID (`SELECT … FOR UPDATE`).

| Endpoint | Quién | Qué hace |
|---|---|---|
| `POST /api/cotizaciones/calcular` | Admin, Ventas | Desglose sin guardar nada |
| `GET /api/cotizaciones/maderas` | Admin, Ventas | Maderas con precio para un tipo de portón (y si alcanza el stock) |
| `PUT /api/catalogo/precios/:maderaId` | Admin | Precio por m² de una madera para cada tipo de portón |
| `POST /api/pedidos` | Admin, Ventas | Cotiza y crea el pedido `COTIZADO` |
| `GET /api/pedidos/:codigo` · `/proforma` | Todos · Admin, Ventas | Detalle del pedido · proforma en PDF |
| `POST /api/pagos/qr` | Admin, Ventas | QR por el total (verifica antes que haya madera) |
| `POST /api/webhooks/pagos` | Pasarela (firma HMAC) | Confirma o rechaza el pago |
| `GET /api/internal/maderas` · `POST /api/internal/cotizaciones` · `/pedidos/:codigo/pago-qr` | Rasa (`X-Service-Token`) | Lo mismo, para el asistente |
| `POST /api/dev/pagos/:id/simular` | Simuladores (`X-Service-Token`) | Simula el cobro; no existe en producción |

**Simular una venta completa por WhatsApp** (API, Rasa y acciones levantados):

1. En **Inventario**, cada madera que quieras ofrecer necesita su precio por m² (Editar madera) y stock: un portón de
   4 × 2,20 m consume 9,68 m². El seed solo trae precios para **Cedro 1″**.
2. `npm run whatsapp:simular` y escribe, por ejemplo, "quiero un portón corredizo de 4 por 2,20". El bot confirma las
   medidas, te ofrece las maderas con su precio, cotiza, envía la proforma (en modo simulado se guarda en
   `backend/tmp/whatsapp-simulado/`) y pregunta si confirmas.
3. Al confirmar recibes el QR (también en esa carpeta). Escribe `/pagar` para que la pasarela simulada lo cobre
   (o `/rechazar`). El bot avisa del pago y el pedido pasa a producción con la madera descontada.

Fuera del chat: `npm run pagos:simular -- MCH-2026-0001` (o `--fallido`) cobra el QR vigente de un pedido.

### 5. Logística, trazabilidad y pruebas

En el panel, **Logística y trazabilidad** muestra los pedidos pagados: en producción (fases 1 a 10 del taller), en ruta
a instalación (fase 11) y entregados. Admin y Taller los avanzan de a un paso; el Admin puede retroceder con motivo;
Ventas solo consulta. Cada cambio queda en un historial inmutable con fecha, hora exacta, usuario y motivo.

```bash
cd backend
npm run demo:pedidos            # 4 pedidos pagados de demostración, en distintas etapas
npm run pruebas:rendimiento     # tiempos de respuesta de los endpoints principales (API levantada)
```

Las pruebas de aceptación (UAT) y la medición de tiempos se describen en [docs/UAT_MACHOBOL.md](docs/UAT_MACHOBOL.md).

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
| `npm run whatsapp:simular` | Simula un cliente de WhatsApp contra el webhook local (ver las secciones 3 y 4) |
| `npm run pagos:simular -- <código>` | Simula el cobro (o con `--fallido`, el rechazo) del QR vigente de un pedido |
| `npm run demo:pedidos` | Crea pedidos pagados de demostración en distintas etapas (consume madera; no se pueden borrar) |
| `npm run pruebas:rendimiento` | Mide los tiempos de respuesta de los endpoints principales y guarda un informe (ver docs/UAT) |
| `npm run tunel` | Abre un túnel HTTPS público hacia la API con cloudflared, para el webhook de Meta |
