# Sistema Web Integral y Asistente Virtual — MACHOBOL

Ventas por WhatsApp, cotización paramétrica de portones, inventario de madera en m² y seguimiento de producción en 11 fases.
El plan completo, las reglas de negocio y el modelo de datos están en [PLAN_MACHOBOL.md](PLAN_MACHOBOL.md).

| Carpeta | Contenido |
|---|---|
| [backend/](backend/) | API REST (Node.js + Express 5 + PostgreSQL) |
| [frontend/](frontend/) | Panel web (React 19 + Vite + TailwindCSS) |
| [rasa_bot/](rasa_bot/) | Asistente virtual (Rasa), a partir del Sprint 3 |

## Requisitos

- Node.js 20 o superior
- PostgreSQL 16 o superior

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
