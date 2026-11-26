# PLAN_MACHOBOL — Sistema Web Integral y Asistente Virtual

> Versión 1.6 · 2026-11-25 · Estado: **aprobado** · Sprints 1 a 5 completados · Moneda única: **bolivianos (Bs)**
> Forma de trabajo: un sprint a la vez, con punto de confirmación al cierre de cada uno.

---

## 0. Resumen

Sistema para MACHOBOL (portones y parques infantiles de madera) que automatiza:

- **Ventas por WhatsApp** con un asistente virtual (Rasa) que responde consultas, cotiza y agenda reuniones con un asesor.
- **Cotización paramétrica** de portones por m², con PDF (precio referencial). El precio final y los pagos se acuerdan
  en persona; la fabricación empieza con un anticipo del 50 %. Todo el sistema opera en bolivianos (Bs).
- **Inventario de madera** en m², con descuento transaccional (ACID) al iniciar la producción.
- **Seguimiento logístico** de cada pedido en 11 fases de producción (tablero Kanban).

| Componente | Tecnología | Carpeta | Puerto (dev) |
|---|---|---|---|
| API REST | Node.js 24 + Express 5 + `pg` | `/backend` | 4000 |
| Panel web | React 19 + Vite + TailwindCSS | `/frontend` | 5173 |
| Motor PLN | Rasa Open Source 3.6 (Python 3.10) | `/rasa_bot` | 5005 (servidor) · 5055 (acciones) |
| Base de datos | PostgreSQL 17 en Supabase (São Paulo, sa-east-1); PostgreSQL 16 local solo para las pruebas | — | 5432 (Session pooler) |

---

## 1. Arquitectura

```
 Cliente (WhatsApp)
        │
        ▼
 Meta WhatsApp Cloud API ──webhook HTTPS──►  backend  /api/webhooks/whatsapp
                                               │  1. verifica firma X-Hub-Signature-256
                                               │  2. deduplica por wa_message_id
                                               ▼
                                   rasa_bot (canal REST :5005)
                                   intents, entidades, formularios
                                               │
                                               ▼
                                   action server (:5055) ──► backend /api/internal/*
                                                             (cotizar, PDF, reunión, estado, datos del negocio)

 Panel web (React) ──JWT──► backend /api/* ──► PostgreSQL (Supabase)
 Admin: registra pagos e "Iniciar producción" ──► transacción ACID (descuento de madera)
```

**Principio rector:** toda la lógica de negocio (precios, stock, fases) vive **solo en el backend**.
Rasa interpreta al cliente y conduce el diálogo, pero nunca calcula precios ni toca la BD.

### 1.1 Backend: monolito modular

Cada dominio es un módulo autocontenido (`routes → controller → service → repository`), sin
dependencias cruzadas entre repositorios. Así puede extraerse como microservicio si el volumen lo exige.

```
sistema-machobol/
├── PLAN_MACHOBOL.md
├── README.md
├── backend/
│   ├── .env.example
│   ├── src/
│   │   ├── config/            # env, pool de PostgreSQL, logger
│   │   ├── db/
│   │   │   ├── migrations/    # node-pg-migrate (SQL)
│   │   │   ├── scripts/       # setup.js: crea el rol y la base de datos
│   │   │   └── seeds/
│   │   ├── middlewares/       # authenticate, authorize, errorHandler, validate
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── usuarios/
│   │   │   ├── clientes/
│   │   │   ├── catalogo/      # categorías, productos, accesorios
│   │   │   ├── inventario/
│   │   │   ├── cotizador/
│   │   │   ├── pedidos/
│   │   │   ├── pagos/         # pagos registrados a mano (anticipo, saldo)
│   │   │   ├── ventas/        # reunión, precio acordado, inicio de producción
│   │   │   ├── configuracion/ # datos del negocio que responde el bot
│   │   │   ├── avisos/        # avisos al encargado por WhatsApp
│   │   │   ├── logistica/     # fases y Kanban
│   │   │   └── whatsapp/
│   │   ├── utils/
│   │   ├── app.js
│   │   └── server.js
│   ├── tests/
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/               # cliente HTTP
│   │   ├── components/
│   │   ├── features/          # auth, dashboard, inventario, pedidos, kanban
│   │   ├── layouts/
│   │   └── routes/
│   └── package.json
└── rasa_bot/
    ├── data/                  # nlu.yml, stories.yml, rules.yml
    ├── actions/               # acciones personalizadas (llaman al backend)
    ├── config.yml
    ├── domain.yml
    ├── endpoints.yml
    └── credentials.yml
```

### 1.2 Identidad visual (Tailwind)

| Token | Color | Uso |
|---|---|---|
| `primary` | `#4E342E` | Café madera: barra lateral, encabezados, botones principales |
| `accent` | `#2E7D32` | Verde: estados positivos, confirmaciones, acciones secundarias |
| `surface` | `#F5EEDC` | Crema: fondo general |

---

## 2. Reglas de negocio → implementación

### 2.1 Cotizador paramétrico (regla fija)

Todos los montos están en **bolivianos (Bs)**. El sistema no maneja otras monedas ni tipo de cambio.

```
área_m2        = alto_m × ancho_m
subtotal_base  = área_m2 × precio_m2 de la madera elegida   (Cedro 1″: Corredizo 2,470 Bs/m² · Batiente 2,500 Bs/m²)
adicionales    = Σ accesorios                 (Motor corredizo +1,740 · Motor batiente +2,088 · Puerta ingreso +696)
total_exacto   = subtotal_base + adicionales  (precio referencial de la cotización, exacto, sin redondeo)
total_final    = precio final acordado        (nace igual a total_exacto; el Admin lo cambia con motivo, Sprint 6)
```

- **Venta con reunión (2026-11-25):** la cotización es un precio referencial. El precio final, el traslado fuera de la
  ciudad (a 45 minutos o más) y los pagos se acuerdan con el asesor. Se retiró el recargo fijo de 150 Bs.

- **Cobro exacto (2026-11-06):** el total ya no se redondea a múltiplos de 100 Bs. Con pago 100 % digital por QR no hay
  cambio físico que dar, y el sobrecargo por redondeo generaba fricción con el cliente. Se cobra el monto exacto, con centavos.
- **Precio según la madera (2026-11-06):** el precio por m² depende del tipo de portón **y** de la madera que elige el
  cliente (tabla `precios_porton`). El Admin fija los precios de cada madera en el panel (Inventario → Editar madera);
  una madera sin precio para un tipo de portón no se le ofrece al cliente.
- **Aritmética entera:** las medidas se convierten a centímetros y los montos a centavos. Así no hay
  errores de punto flotante (`área_cm² × precio / 100 = centavos`).
- **Snapshot de precios:** el pedido guarda la madera, el precio por m² y el de cada accesorio vigentes al cotizar.
  Si después cambia el catálogo, las cotizaciones emitidas no se alteran.
- **Convención de centavos:** medio centavo no se puede cobrar, así que el subtotal se redondea al centavo más cercano;
  todos los montos se guardan con 2 decimales.
- Accesorios y recargos viven en la misma tabla (`accesorios.tipo_adicional` = `ACCESORIO` | `RECARGO`). Hoy no hay
  recargos activos: el de transporte quedó inactivo (las cotizaciones anteriores lo conservan).

**Casos de prueba de referencia (Bs, madera Cedro 1″):**

| Tipo | Alto × Ancho | Área | Base | Adicionales | Total referencial |
|---|---|---|---|---|---|
| Corredizo | 2.20 × 4.00 | 8.80 | 21,736.00 | Motor corredizo 1,740 | **23,476.00** |
| Batiente | 2.00 × 3.00 | 6.00 | 15,000.00 | Motor batiente 2,088 + Puerta 696 | **17,784.00** |
| Corredizo | 1.50 × 2.50 | 3.75 | 9,262.50 | — | **9,262.50** |
| Corredizo | 2.00 × 2.50 | 5.00 | 12,350.00 | — | **12,350.00** |

### 2.2 Inventario de madera

- **Ingreso (troca):** se registra en piezas de `ancho (pulgadas) × largo (pies)` y se convierte al momento.
  El espesor solo clasifica la madera (forma parte de su nombre) y no interviene en el cálculo:
  ```
  m² = piezas × (ancho_pulg × 0.0254) × (largo_pies × 0.3048)
  ej.: 10 piezas de 8" × 10' = 10 × 0.2032 × 3.048 = 6.1935 m²
  ```
- **Almacenamiento:** el stock se guarda **solo en m²** (`NUMERIC(12,4)`). Las medidas originales quedan
  en `movimientos_inventario` como trazabilidad, no como stock.
- **Consumo por pedido:** `madera_requerida_m2 = área_portón × factor_consumo × (1 + merma)`, configurable por producto.
  Valores confirmados: factor **1** (1 m² de portón consume 1 m² de madera) y merma **10 %**. Ejemplo: un portón de 8.80 m² descuenta 9.68 m².
- **Defensa en profundidad:** `CHECK (stock_actual_m2 >= 0)` en la tabla, además de la validación en el servicio.
- **Alerta:** si después de un movimiento `stock_actual_m2 <= stock_minimo_m2`, se marca en el Dashboard.

### 2.3 Transacción ACID al iniciar la producción

Desde el Sprint 6 no hay cobro automático: el Admin registra los pagos que recibe y, con el anticipo cubierto (50 % del
precio acordado), pulsa **Iniciar producción**. El descuento de madera ocurre solo dentro de esta transacción:

```sql
BEGIN;
  SELECT ... FROM pedidos WHERE codigo = $1 FOR UPDATE;               -- un inicio a la vez por pedido
  --  si los pagos vigentes < anticipo → ROLLBACK y 409
  SELECT stock_actual_m2 FROM inventario_madera WHERE id = $2 FOR UPDATE;
  --  si stock < requerido → el pedido pasa a REVISION_STOCK (y se avisa al encargado)
  UPDATE inventario_madera SET stock_actual_m2 = stock_actual_m2 - $req WHERE id = $2;
  INSERT INTO movimientos_inventario (tipo, cantidad_m2, pedido_id, ...) VALUES ('SALIDA', ...);
  UPDATE pedidos SET estado = 'EN_PRODUCCION', fase_actual = 1 WHERE ...;
  -- el trigger trg_pedidos_historial registra el cambio en historial_pedido
COMMIT;
```

- `SELECT ... FOR UPDATE` serializa los pedidos que compiten por la misma madera: uno la descuenta y el otro queda en
  `REVISION_STOCK`. Con la madera repuesta, "Reintentar producción" vuelve a ejecutar la transacción.
- El índice único `ux_movimientos_salida_por_pedido` garantiza que un pedido descuente madera una sola vez.
- Los pagos no se borran ni se editan (trigger): se anulan con un motivo. El saldo (50 % restante) se paga al instalar:
  no se puede cerrar la instalación con saldo pendiente.

### 2.4 Estados del pedido vs. fases de producción

Son dos dimensiones distintas:

- **Estado** (`estados_pedido`): `COTIZADO → REUNION_SOLICITADA → REUNION_AGENDADA → EN_PRODUCCION → EN_RUTA → ENTREGADO`,
  más `CANCELADO` y `REVISION_STOCK`. `PENDIENTE_PAGO` (QR de la pasarela) dejó de usarse en el Sprint 6.
- **Fase de producción** (`fases_produccion`): avanza **estrictamente en orden** (1 → 2 → … → 11), de a un paso.
  Las fases 1 a 10 transcurren `EN_PRODUCCION` (en el taller). Al cerrar la fase 10 (control de calidad y despacho) el
  pedido sale `EN_RUTA` y entra a la fase 11 (instalación); al cerrarla queda `ENTREGADO` (entregado / instalado).
- **Trazabilidad (Sprint 5):** cada alta y cada cambio de estado o de fase queda en `historial_pedido`, tabla inmutable
  (un trigger rechaza `UPDATE` y `DELETE`), con la hora exacta (`clock_timestamp()`), el usuario y el motivo. Lo escribe
  un trigger de `pedidos`, así que ningún camino del código puede cambiar un pedido sin dejar rastro.

Fases definitivas (confirmadas el 2026-11-02):

| # | Fase |
|---|---|
| 1 | Aserradero |
| 2 | Secado |
| 3 | Cepillado |
| 4 | Corte y dimensionado |
| 5 | Armado de estructura |
| 6 | Lijado |
| 7 | Tratamiento / inmunizado |
| 8 | Acabado (barniz / pintura) |
| 9 | Montaje de herrajes y accesorios |
| 10 | Control de calidad y despacho |
| 11 | Instalación |

### 2.5 Roles (RBAC)

| Recurso | Admin | Ventas | Taller |
|---|---|---|---|
| Usuarios | CRUD | — | — |
| Catálogo y precios | CRUD | Lectura | Lectura |
| Clientes | CRUD | CRUD | — |
| Cotizaciones / pedidos | CRUD | Crear / leer / cancelar | Lectura |
| Reuniones con clientes | Agendar | Agendar | — |
| Precio acordado, pagos, iniciar producción | Sí (pagos: registrar y anular con motivo) | Lectura | Lectura |
| Configuración del negocio | Editar | Lectura | Lectura |
| Inventario: ingreso de trocas | Sí | — | Sí |
| Inventario: ajustes manuales | Sí (motivo obligatorio) | — | — |
| Kanban: mover fase | Avanzar y retroceder (con motivo) | Lectura | Avanzar |

---

## 3. Modelo de datos (PostgreSQL)

Las tablas incluyen `id` (PK, `INTEGER` identity), `creado_en` y `actualizado_en` (este último lo mantiene un trigger).
Excepción: las bitácoras de solo inserción (`movimientos_inventario`, `historial_pedido`, `mensajes_whatsapp`) no llevan `actualizado_en`.
Los montos van en Bs como `NUMERIC(12,2)`, y los m² en `NUMERIC(12,4)`.
Cada regla de integridad tiene un nombre (`ck_*`, `uq_*`, `ux_*`), así la API puede traducir cada violación a un mensaje claro.

| Tabla | Propósito | Campos clave |
|---|---|---|
| `usuarios` | Personal interno | `nombre`, `email` UNIQUE, `password_hash`, `rol` ENUM(`ADMIN`,`VENTAS`,`TALLER`), `activo` |
| `clientes` | Clientes de WhatsApp | `wa_id` UNIQUE (teléfono E.164), `nombre`, `ci_nit`, `direccion` |
| `categorias_producto` | Portones, Parques infantiles | `nombre` UNIQUE |
| `productos` | Catálogo | `categoria_id` FK, `nombre`, `tipo_porton` ENUM(`CORREDIZO`,`BATIENTE`) NULL, `modo_precio` ENUM(`POR_M2`,`FIJO`), `precio_fijo`, `factor_consumo`, `merma_pct` |
| `precios_porton` | Precio por m² según portón y madera (desde 2026-11-06) | PK(`producto_id`, `madera_id`), `precio_m2` |
| `accesorios` | Accesorios y recargos | `codigo` UNIQUE, `nombre`, `tipo_adicional` ENUM(`ACCESORIO`,`RECARGO`), `precio`, `tipo_porton_compatible` NULL |
| `inventario_madera` | Stock por tipo de madera | `especie`, `espesor_pulg`, `stock_actual_m2` NUMERIC(12,4) CHECK ≥ 0, `stock_minimo_m2` |
| `movimientos_inventario` | Kardex | `madera_id` FK, `tipo` ENUM(`INGRESO`,`SALIDA`,`AJUSTE`), `cantidad_m2`, `piezas`, `ancho_pulg`, `largo_pies`, `stock_resultante_m2`, `pedido_id` FK NULL, `usuario_id` FK NULL, `motivo` |
| `estados_pedido` | Catálogo de estados | `codigo` UNIQUE, `nombre` |
| `fases_produccion` | Fases 1–11 | `orden` UNIQUE CHECK 1–11, `nombre`, `descripcion` |
| `pedidos` | Cotización → pedido | `codigo` UNIQUE (`MCH-AAAA-NNNN`), `cliente_id`, `producto_id`, `alto_m`, `ancho_m`, `area_m2`, `precio_m2_aplicado`, `subtotal_base`, `total_adicionales`, `total_exacto` (referencial), `total_final` (acordado), `madera_id`, `madera_requerida_m2`, `estado_id`, `fase_actual_id` NULL, `canal` ENUM(`WHATSAPP`,`PANEL`), `creado_por` NULL, `fuera_ciudad`, `fecha_reunion`, `preferencia_reunion`, `fecha_instalacion` |
| `pedido_accesorios` | Accesorios del pedido | PK(`pedido_id`,`accesorio_id`), `precio_aplicado` |
| `historial_pedido` | Trazabilidad inmutable (Sprint 5; reemplazó a `historial_fases`) | `pedido_id`, `estado_anterior_id`, `estado_nuevo_id`, `fase_anterior_id`, `fase_nueva_id`, `total_anterior`, `total_nuevo` (precio acordado, Sprint 6), `usuario_id`, `motivo`, `creado_en` |
| `pagos` | Pagos registrados a mano (Sprint 6; reemplazó a `pagos_qr`) | `pedido_id` FK, `monto`, `metodo` ENUM(`QR`,`EFECTIVO`,`TRANSFERENCIA`,`CHEQUE`), `referencia`, `registrado_por`, `anulado_en`, `anulado_por`, `motivo_anulacion` (no se borran: se anulan) |
| `configuracion_negocio` | Datos que responde el bot (una fila, Sprint 6) | `ciudad`, `direccion`, `maps_url`, `horarios`, `formas_pago`, `tiempo_fabricacion`, `cobertura`, `anticipo_pct`, `whatsapp_avisos` |
| `mensajes_whatsapp` | Auditoría y deduplicación | `wa_message_id` UNIQUE, `cliente_id`, `direccion` ENUM(`IN`,`OUT`), `contenido` JSONB |

**Tablas añadidas al esquema solicitado y su motivo:**

- `pedido_accesorios`: guardar los IDs de accesorios como arreglo dentro de `pedidos` impediría las FK y el snapshot de precio. Una tabla intermedia resuelve ambas cosas.
- `historial_pedido`: registra quién movió cada pedido, cuándo y por qué; el tablero logístico y las auditorías lo necesitan.
- `mensajes_whatsapp`: Meta reenvía webhooks; sin esta tabla un mensaje se procesaría dos veces.
- `pagos` y `configuracion_negocio` (Sprint 6): la venta real se acuerda en persona, con varios pagos por pedido, y los
  datos que responde el bot los mantiene el Admin sin tocar el código.

---

## 4. Sprints

### Sprint 1 — Inicialización del proyecto y base de datos ✅ (2026-11-02)

**Objetivo:** esqueleto ejecutable de backend y frontend, con el esquema completo de PostgreSQL creado por migraciones.

- [x] Estructura de carpetas `/backend`, `/frontend`, `/rasa_bot`; `.gitignore`, `.editorconfig`, `README.md`, `backend/.env.example`.
- [x] Backend: Express 5, `pg`, `dotenv`, `helmet`, `cors` y logger (`pino`); `app.js` / `server.js`; manejador central de errores.
- [x] `GET /api/health` que verifica la conexión a la BD (503 si PostgreSQL no responde).
- [x] PostgreSQL: base `machobol`, rol de aplicación `machobol_app` con privilegios mínimos (`npm run db:setup`).
- [x] Migraciones con `node-pg-migrate` (5 archivos SQL): ENUMs, todas las tablas de §3, FKs, CHECKs, índices y trigger `actualizado_en`.
- [x] Seeds: categorías; productos (Corredizo 2,470 Bs/m², Batiente 2,500 Bs/m²); 3 accesorios y el recargo de transporte; fases 1–11; estados; una madera de ejemplo; usuario Admin inicial (contraseña desde `.env`, hasheada con bcrypt).
- [x] Scripts npm: `dev`, `test`, `db:setup`, `db:migrate`, `db:rollback`, `db:reset`, `db:seed`, `db:migration:create`.
- [x] Frontend: Vite + React + Tailwind con los tokens de color de §1.2, un layout base y la tarjeta "Estado del sistema".

**Verificación realizada:** 36 comprobaciones contra un PostgreSQL 18 temporal: setup y seed idempotentes, cada CHECK
o índice único rechaza su caso inválido, no quedan columnas de USD ni de tipo de cambio, `down 0` deja la BD vacía y
`/api/health` funciona directo y a través del proxy de Vite. Además, 4 pruebas Jest del backend.
BD local del equipo de desarrollo (PostgreSQL 16.15) creada con `db:setup`, `db:migrate` y `db:seed` el 2026-11-02.

**Entregables:** repositorio que arranca con `npm run dev` en ambos proyectos, y BD reproducible desde cero.
**Criterios de aceptación:**
- `db:migrate` sobre una BD vacía crea el esquema sin errores, y `db:rollback` lo revierte por completo.
- `GET /api/health` → `{ "status": "ok", "db": "ok" }`.
- Insertar stock negativo en `inventario_madera` falla por el CHECK.

---

### Sprint 2 — Seguridad JWT, autenticación y CRUD de Inventario / Dashboard ✅ (2026-11-03)

**Objetivo:** acceso seguro por rol y gestión completa de la madera desde el panel.

- [x] `POST /api/auth/login`: bcrypt (costo 12), JWT HS256 de 8 h (payload: `sub`, `nombre`, `rol`), enviado como `Authorization: Bearer`.
- [x] `GET /api/auth/me`; middlewares `authenticate` y `authorize(...roles)`. `authenticate` también comprueba en la BD que el usuario siga activo: desactivar a alguien corta su sesión al instante.
- [x] Límite de 10 intentos fallidos por IP cada 15 min (`express-rate-limit`); validación de entrada con `zod`; el header `Authorization` se oculta en los logs.
- [x] CRUD de usuarios (solo Admin, API + pantalla). El hash nunca se devuelve ni se registra en logs; el Admin no puede desactivarse ni quitarse el rol.
- [x] Inventario:
  - `GET /api/inventario` (stock, alerta de mínimo y resumen).
  - `POST /api/inventario` y `PATCH /api/inventario/:id` (catálogo de maderas, solo Admin; el stock no se edita aquí).
  - `POST /api/inventario/ingresos` (Admin y Taller: troca → m² exacto con BigInt, en transacción con `SELECT … FOR UPDATE`, con su movimiento).
  - `POST /api/inventario/ajustes` (Admin, motivo obligatorio; si dejaría el stock negativo, 409 sin modificar nada).
  - `GET /api/inventario/movimientos` (paginado y filtrable por madera y tipo).
- [x] React: `/login` como vista raíz (no hay web pública), rutas protegidas, menú lateral oculto hasta iniciar sesión y filtrado por el rol del token.
- [x] Pantalla Inventario con formulario de ingreso que **muestra la conversión a m² en vivo** (misma función que la API).
- [x] Dashboard por rol: Admin (resumen, alertas, últimos movimientos y estado del sistema), Taller (resumen, alertas, movimientos y acceso directo a registrar troca), Ventas (stock disponible, sin acciones).
- [x] Pruebas (Jest + Supertest): conversión troca → m², login, 401 sin token o con token inválido/expirado, 403 por rol, ajuste negativo, rate limit.

**Verificación realizada:**
- 41 pruebas Jest: 37 de integración contra PostgreSQL real (`machobol_test`) y 4 sin BD.
- 24 comprobaciones en el navegador (Edge) con los tres roles: redirecciones, menús, conversión en vivo, registro de troca y ajuste, alta de usuarios, cierre de sesión y token manipulado.
- La base de desarrollo no se tocó durante las pruebas.
- Pruebas manuales del equipo superadas; confirmado el 2026-11-03.

**Criterios de aceptación:**
- Un usuario Taller recibe 403 en `/api/usuarios`.
- Ingresar 10 piezas de 8" × 10' suma exactamente 6.1935 m² y genera un movimiento `INGRESO`.
- El ajuste que dejaría el stock negativo se rechaza sin modificar nada.

---

### Sprint 3 — Rasa: intents, entidades y webhooks de WhatsApp ✅ (2026-11-04)

**Objetivo:** recibir mensajes reales de WhatsApp, entenderlos con Rasa y responder.

- [x] Entorno Python 3.10 aislado (`rasa_bot/.venv`) con Rasa Open Source 3.6.21 y `rasa-sdk` 3.6.2 (TensorFlow 2.12, CPU). Idioma `es`.
- [x] Pipeline NLU: `WhitespaceTokenizer`, `RegexFeaturizer`, `LexicalSyntacticFeaturizer`, `CountVectorsFeaturizer` (palabra y `char_wb`), `DIETClassifier`, `EntitySynonymMapper`, `FallbackClassifier` (umbral 0.4).
- [x] Intents: `saludar`, `despedir`, `consultar_productos`, `cotizar_porton`, `informar_medidas`, `elegir_tipo_porton`, `agregar_accesorio`, `confirmar`, `negar`, `consultar_estado_pedido`, `hablar_con_asesor`.
- [x] Entidades:
  - `tipo_porton`, con sinónimos (corredero, corrediza, deslizante, de riel → corredizo; abatible, de dos hojas → batiente).
  - `alto` y `ancho`, con regex que acepta "2,20", "2.20 m" y "4 x 2". Además, las acciones leen de forma determinista lo que DIET no separa ("4x2,20", "dos por dos y medio", "220 cm").
  - `accesorio` (motor, puerta de ingreso) y `codigo_pedido` (`MCH-AAAA-NNNN`).
- [x] Formulario `formulario_cotizacion` (tipo, ancho, alto, confirmación de medidas, accesorios y si la entrega es fuera de la ciudad). El bot **confirma las medidas** antes de seguir ("portón corredizo de 4,00 m de ancho × 2,20 m de alto (8,80 m²). ¿Las medidas son correctas?"); si el cliente las corrige, vuelve a confirmarlas.
- [x] Servidor de acciones con `action_cotizar` conectado a un endpoint simulado (la versión real llega en el Sprint 4). Las preguntas de accesorios y de entrega muestran los precios reales del catálogo (motor según el tipo de portón, recargo de 150 Bs).
- [x] Backend, módulo `whatsapp`:
  - `GET /api/webhooks/whatsapp` de verificación (`hub.verify_token`, comparado en tiempo constante).
  - `POST` con validación HMAC-SHA256 sobre el cuerpo crudo (401 si no coincide), respuesta 200 en cuanto el mensaje queda registrado y procesamiento asíncrono (en orden por cliente).
  - Deduplicación por `wa_message_id` (`ON CONFLICT DO NOTHING` sobre el índice único) y alta automática de `clientes` con el nombre de perfil.
  - Reenvío a Rasa y respuesta por Graph API: los botones de Rasa se convierten en botones o listas de WhatsApp. Sin credenciales de Meta funciona en **modo simulado** (nada sale hacia Meta).
  - Audios e imágenes reciben "solo puedo leer texto"; si Rasa no responde, el cliente recibe un aviso de que lo atenderá un asesor.
- [x] Autenticación servicio a servicio (Rasa → backend) mediante el header `X-Service-Token` en `/api/internal/*` (`GET /catalogo`, `POST /cotizaciones`). El header se oculta en los logs.
- [x] Script simulador (`npm run whatsapp:simular`) que envía *payloads* de Meta firmados, para probar sin depender del túnel.
- [ ] Túnel HTTPS de desarrollo y número de prueba de Meta: documentado (`npm run tunel` con cloudflared, pasos en el README). Falta crear la app de Meta y cargar sus credenciales en `backend/.env`.

**Verificación realizada:**
- `rasa data validate`: sin errores ni conflictos (7 avisos esperados de respuestas que usan el formulario y las acciones).
- `rasa test nlu` con validación cruzada de 5 particiones: F1 ponderado de intents **0.924** (mínimo 0.85; el más bajo, `confirmar`, 0.81).
  Entidades: 0.879 en total. `ancho` y `alto` quedan en 0.74 con DIET solo; por eso las acciones vuelven a leer las medidas
  con el lector determinista, y en las pruebas de punta a punta el bot termina con las medidas correctas en todos los casos.
- "quiero un portón corredizo de 4 por 2,20" → `cotizar_porton` (confianza 1.00), `tipo_porton=corredizo`, `ancho=4`, `alto=2,20`.
- 78 pruebas Jest (37 nuevas: firma, verificación, deduplicación concurrente, alta de clientes, conversión de mensajes, Graph API simulada, token de servicio) y 11 pruebas Python del lector de medidas.
- 26 comprobaciones de punta a punta con los servidores reales (webhook firmado → API → Rasa → acciones → API interna → BD): cotización completa con botones, paso a paso con corrección de medidas, interrupciones, cancelación, audio, deduplicación y firma inválida.

**Decisiones tomadas en este sprint:**
- El bot trata al cliente de "usted". Los textos están en `rasa_bot/domain.yml`.
- Medidas sin etiqueta ("4 por 2,20"): la primera es el ancho y la segunda el alto; el bot siempre las confirma. Rango de cordura en el bot: 0,30–20 m (los límites comerciales los valida el backend en el Sprint 4).
- El recargo de transporte no lo pide el bot por código: envía `fuera_ciudad` y el backend decide.
- Rasa y el servidor de acciones escuchan solo en `127.0.0.1`; Rasa corre sin `--enable-api`.
- Las conversaciones de Rasa viven en memoria; el historial completo queda en `mensajes_whatsapp`.

**Criterios de aceptación:**
- `rasa data validate` sin errores; `rasa test nlu` con F1 de intents ≥ 0.85.
- "quiero un portón corredizo de 4 por 2,20" → `cotizar_porton`, `tipo_porton=corredizo` y las dos medidas extraídas.
- Un webhook repetido con el mismo `wa_message_id` se procesa una sola vez.
- Un webhook con firma inválida → 401.

---

### Sprint 4 — Cotizador, PDF y pagos QR con transaccionalidad ACID ✅ (2026-11-11)

**Objetivo:** cerrar el ciclo de venta, de la cotización al pago confirmado y el stock descontado.

- [x] `cotizador.calculo`: función pura con aritmética entera en BigInt (§2.1): centímetros, centavos y diezmilésimas de m². Valida rangos de medidas (0,30–20 m, provisional) y la compatibilidad de los accesorios; los recargos no se eligen como accesorio. `cotizador.service` aplica `TRANSPORTE_VIATICOS` solo si la entrega es fuera de la ciudad.
- [x] `POST /api/cotizaciones/calcular` (panel) y `POST /api/internal/cotizaciones` (Rasa, que además crea el pedido).
- [x] `POST /api/pedidos`: crea el pedido `COTIZADO` con snapshot de precios (`pedido_accesorios.precio_aplicado`) y `madera_requerida_m2`. Código `MCH-AAAA-NNNN` correlativo por año (candado de transacción). `GET /api/pedidos/:codigo` y `/proforma`.
- [x] Pruebas tabuladas del cotizador: casos de §2.1, decimales, centavos, precio según la madera, madera con merma, medidas inválidas, motor incompatible, recargo pedido como accesorio.
- [x] PDF con PDFKit (una página, tamaño carta): logo, datos del cliente, madera, desglose (área, base, adicionales y total exacto a pagar), código y validez (`COTIZACION_VALIDEZ_DIAS`, 15 días). Se envía por WhatsApp como documento, subido como media a la Graph API.
- [x] **Corrección del 2026-11-06 — cobro exacto:** sin redondeo a 100 Bs en el cotizador, el PDF, el QR y el webhook (que exige el monto exacto, centavo a centavo). La migración quita `ck_pedidos_redondeo_100` y pasa al monto exacto las cotizaciones aún sin pagar.
- [x] **Corrección del 2026-11-06 — madera elegida por el cliente:** tabla `precios_porton` (portón × madera), precios editables por el Admin (`PUT /api/catalogo/precios/:maderaId` y el formulario de madera del panel), `GET /api/internal/maderas` y `GET /api/cotizaciones/maderas` (maderas con precio y si alcanza el stock). En Rasa: intent `elegir_madera`, entidad `tipo_madera` (con tabla de búsqueda) y la pregunta "¿En qué madera lo quiere?" con botones; las acciones reconocen cualquier especie de la BD, aunque el modelo no la conozca.
- [x] Pagos QR:
  - Interfaz `PaymentGateway { crearCobro, imagenQr, verificarCallback }` con implementación simulada `mockQr` (genera `transaccion_id` y un QR PNG con `qrcode`).
  - `POST /api/pagos/qr`: pre-valida el stock y genera el cobro en Bs por el **total** del pedido (no se aceptan anticipos), con vencimiento (`PAGOS_QR_VIGENCIA_MINUTOS`, 60 min). Si ya hay un QR vigente devuelve el mismo; rechaza cotizaciones vencidas.
  - `POST /api/webhooks/pagos`: callback firmado (HMAC-SHA256 en `X-Pasarela-Firma`) que ejecuta la transacción de §2.3, con candados en orden fijo pago → pedido → madera.
  - `POST /api/dev/pagos/:id/simular` (nunca en producción; requiere el token de servicio). Scripts `npm run pagos:simular` y `/pagar` en el simulador de WhatsApp.
- [x] Bot de punta a punta: cotiza con el precio real → proforma PDF → "¿Confirma el pedido?" → QR → pago simulado → "¡Pago recibido! Su pedido MCH-… ya está en producción".

**Verificación realizada:**
- 123 pruebas Jest (45 nuevas): cálculo tabulado, pedidos y snapshot, proforma, QR con pre-validación, idempotencia, concurrencia, reversión total, adjuntos por WhatsApp y subida de media a la Graph API. 13 pruebas Python.
- Los tres criterios de aceptación tienen su prueba automática (`tests/pagos.test.js`).
- 22 comprobaciones de punta a punta con Rasa real contra `machobol_test`: venta pagada (stock 15 → 5,32 m²), cotización sin confirmar, QR rechazado por falta de stock y pago rechazado por el banco.
- Tras las correcciones del 2026-11-06: 130 pruebas Jest y 18 Python; NLU con F1 de intents 0.926 (`elegir_madera` 0.91,
  entidad `tipo_madera` 0.83, más el reconocimiento de las acciones); 12 comprobaciones de punta a punta con elección de madera
  (botón, texto libre, madera inexistente, madera nombrada en el primer mensaje) y un pago exacto con centavos
  (27.259,12 Bs) que descuenta la madera elegida (Tajibo 100 → 90,32 m²) sin tocar las demás.

**Decisiones tomadas en este sprint:**
- Un pago confirmado sobre un pedido que ya no admite pagos (cancelado o pagado con otro QR) queda en `REVISION`, sin descontar stock: el dinero entró y lo resuelve el Admin.
- Un callback con un monto distinto al del cobro se rechaza (400) sin cambiar nada.
- El cliente recibe aviso por WhatsApp del pago confirmado, en revisión o rechazado. La alerta al Admin, por ahora, queda en el log; el Dashboard la mostrará en el Sprint 5.
- Rasa nunca genera ni ve los archivos: pide un adjunto y el backend comprueba que el pedido sea de quien conversa.
- Cada pedido descuenta la madera que eligió el cliente. El bot ofrece con botón solo las maderas con stock suficiente para
  esas medidas; si ninguna alcanza, ofrece todas (la cotización sale, pero el QR se genera recién cuando haya stock).

**Criterios de aceptación:**
- Prueba de concurrencia: dos pagos simultáneos con stock para uno solo. Exactamente uno queda `EN_PRODUCCION`, el otro `REVISION_STOCK`, y el stock nunca es negativo.
- Un callback repetido 3 veces descuenta el stock una sola vez.
- Si falla cualquier paso dentro de la transacción, ni el stock, ni el pago, ni el pedido cambian.

---

### Sprint 5 — Calendario logístico, trazabilidad y pruebas ✅ (2026-11-25)

**Objetivo:** visibilidad de la producción y la entrega (R-13), trazabilidad inmutable y entorno de pruebas técnicas.

- [x] Estado operativo: `EN_PRODUCCION` (fases 1–10) → `EN_RUTA` (fase 11, despacho e instalación) → `ENTREGADO`
  (entregado / instalado). Migración `1793620806000` con el estado `EN_RUTA` y la fecha de instalación del pedido.
- [x] Trazabilidad: `historial_pedido` inmutable (trigger que rechaza `UPDATE`/`DELETE`), escrito por un trigger de
  `pedidos` en cada alta y cada cambio de estado o fase, con hora exacta, usuario y motivo. Reemplaza a `historial_fases`.
- [x] Endpoints de logística (transaccionales, con el pedido bloqueado `FOR UPDATE`):
  - `GET /api/logistica/tablero` (todos los roles): pedidos pagados con su etapa, días en ella y el paso siguiente.
  - `GET /api/logistica/pedidos/:codigo`: detalle con el historial completo.
  - `POST …/avanzar` (Admin, Taller) y `POST …/retroceder` (Admin, motivo obligatorio): de a un paso. El cliente
    envía la etapa que veía (`desde`); si otro usuario movió el pedido, se rechaza con 409 en vez de saltar una fase.
  - `PATCH …/instalacion` (Admin, Taller): fecha de instalación (calendario).
  - `POST …/reintentar-produccion` (Admin): un pedido cobrado sin madera (`REVISION_STOCK`) entra a producción al reponer stock.
- [x] React: página **Logística y trazabilidad** con tablero Kanban simple (columnas por estado operativo, fases dentro de
  cada tarjeta), vista calendario (tabla por fecha de instalación, con filtro) y ficha con acciones por rol e historial.
  Tarjeta "Pedidos en curso" en el Dashboard.
- [x] Al cerrar la fase 11, el pedido pasa a `ENTREGADO`. Avisos por WhatsApp al salir en ruta y al quedar instalado.
- [x] Pruebas técnicas: `npm run pruebas:rendimiento` (autocannon, latencias p50–p99 e informe Markdown),
  `npm run demo:pedidos` (pedidos pagados de demostración) y guía UAT con 20 casos en [docs/UAT_MACHOBOL.md](docs/UAT_MACHOBOL.md).
- [x] **Base de datos en Supabase (2026-11-18):** el esquema se creó con [docs/supabase/machobol_supabase.sql](docs/supabase/machobol_supabase.sql)
  (generado desde las migraciones) y se comprobó con [docs/supabase/verificar.sql](docs/supabase/verificar.sql). Conexión por
  Session pooler con TLS verificado (`certs/supabase-ca.crt`). La migración `1793620807000` activa RLS y quita los permisos
  de `anon`/`authenticated`: la API REST pública responde "permission denied". Las pruebas siguen en `machobol_test` local.
  Contenido de prueba cargado por la API (usuarios Ventas/Taller, Tajibo, trocas, 4 pedidos pagados en distintas etapas y
  una cotización por WhatsApp); se elimina con [docs/supabase/limpiar-datos-de-prueba.sql](docs/supabase/limpiar-datos-de-prueba.sql).
- [x] Bot: `consultar_estado_pedido` responde con el estado, la fase y el saldo reales (hecho en el Sprint 6, parte A).
- [x] Dashboard final: ventas del mes (hecho en el Sprint 6, parte A; los "pagos en revisión" dejaron de existir con la
  pasarela).
- → Plantillas de WhatsApp aprobadas por Meta y endurecimiento para producción: pasan al Sprint 6, parte B (despliegue).

**Verificación realizada:**
- 144 pruebas Jest (14 nuevas de logística: recorrido completo de las 11 fases, historial con hora exacta, usuario y motivo,
  avances simultáneos, permisos por rol, inmutabilidad del historial y reintento tras reponer madera).
- 19 comprobaciones en Edge con los tres roles contra `machobol_test`: tablero, avance con observación, retroceso con
  motivo, entrega, fecha de instalación, calendario, conflicto por doble avance y vista móvil.
- Tiempos de respuesta (base de pruebas, 10 conexiones): endpoints de lectura con p97,5 entre 2 y 10 ms; inicio de sesión ≈ 225 ms.
- Con la base en Supabase São Paulo y la API en el equipo local (2026-11-18): cada consulta cuesta ≈ 106 ms de ida y
  vuelta. p50 entre 103 ms (salud) y 412 ms (catálogo y cotización); 5 de 6 endpoints cumplen el umbral de 500 ms en p97,5
  (la cotización llega a 754 ms). Se comparó con un proyecto en Virginia (≈ 125 ms por consulta, 3 de 6 cumplían) y se
  eligió São Paulo. Con la API desplegada en la misma región que la base, cada consulta costaría ≈ 1–2 ms (Sprint 6).
  Informe: `backend/pruebas/resultados/rendimiento-20261118-0054.md`.

**Criterios de aceptación:**
- Prueba E2E: mensaje simulado → cotización → pago → fase 1 → … → fase 11 → `ENTREGADO`, con stock e historial consistentes.
- Taller puede avanzar tarjetas; Ventas solo las ve.
- Ningún intento de saltar una fase pasa la validación, ni en la API ni en la UI.

---

### Sprint 6 — Venta con reunión y anticipo, avisos de madera y despliegue 🟡 (parte A implementada el 2026-11-25; parte B pendiente)

**Objetivo:** que el sistema venda como vende MACHOBOL y dejarlo funcionando en la nube. El bot cotiza un precio
referencial y agenda una reunión con un asesor; el precio final y los pagos se acuerdan en persona; la fabricación
empieza con un **anticipo del 50 %**. No hay cobro por el bot ni integración con un banco (trabajo futuro).

**Decisiones del negocio (2026-11-25):**
- Nunca se cobra por conversar, por preguntar ni por cotizar. Si la cotización le agrada, el cliente pide una reunión
  con un asesor y ahí se coordina el precio final y los pagos.
- Para iniciar la fabricación se exige un anticipo del 50 % del precio acordado (porcentaje editable).
- Formas de pago: QR, efectivo, transferencia y cheque. Los pagos los registra el Admin.
- Tienda en Santa Cruz de la Sierra (4to anillo y calle Las Anguilas, a una cuadra de la radial 19); atención de 7:30 a
  21:00. Fabricación de un portón: de 3 semanas a 1 mes. Instalación a nivel nacional.
- **Traslado:** si la instalación queda a 45 minutos o más de la ciudad, se cobra un adicional que se acuerda en la
  reunión. Se elimina el recargo fijo de 150 Bs (el bot ya no suma nada; solo anota que es fuera de la ciudad).
- **Saldo:** el 50 % restante se paga al instalar. No se puede cerrar la instalación (`ENTREGADO`) con saldo pendiente.
- WhatsApp del encargado para los avisos: por ahora, el del responsable del proyecto (se edita en Configuración).
- Si falta madera para un pedido, o el stock baja del mínimo, se avisa al Admin en el panel y por WhatsApp.

#### Parte A — Ajustes de venta (en local)

**Flujo:**

```
COTIZADO ──"quiero reunión"──► REUNIÓN SOLICITADA ──el asesor fija fecha──► REUNIÓN AGENDADA
(precio referencial)            (con la preferencia de horario del cliente)         │ reunión: precio final acordado
                                                                                     │ y pagos registrados
                         anticipo ≥ 50 % ─► "Iniciar producción" ─► EN_PRODUCCION → … (Sprint 5)
                                                                 └► REVISION_STOCK + aviso, si falta madera
```

**Base de datos (una migración):**
- `pagos` reemplaza a `pagos_qr`: monto, método (`QR`, `EFECTIVO`, `TRANSFERENCIA`, `CHEQUE`), referencia (número de
  cheque o de transacción), quién lo registró y cuándo. Un pago no se borra: se **anula** con un motivo.
- `configuracion_negocio` (una sola fila, editable por el Admin): dirección, enlace de Google Maps, horarios, formas
  de pago, tiempo de fabricación, cobertura de instalación, porcentaje de anticipo (50 %) y WhatsApp del encargado que
  recibe los avisos.
- `pedidos`: `fecha_reunion` y la preferencia de horario que dio el cliente. `total_final` pasa a ser el **precio
  final acordado**: nace igual al referencial y el Admin lo cambia con un motivo que queda en el historial.
- Estados: `PENDIENTE_PAGO` se reemplaza por `REUNION_SOLICITADA` y `REUNION_AGENDADA`. `REVISION_STOCK` se mantiene
  para el pedido con anticipo pero sin madera.

**Reglas transaccionales (§2.3 se adapta):**
- **Iniciar producción** (Admin): solo con pagos ≥ 50 % del precio acordado. Usa la misma transacción ACID del Sprint 4
  (pedido y madera bloqueados, descuento una sola vez). Si la madera no alcanza, el pedido queda en `REVISION_STOCK` y
  se avisa al Admin. Con stock repuesto, "Reintentar" (Sprint 5) lo pasa a producción.
- El saldo siempre es precio acordado − pagos vigentes.

**Avisos al Admin (en este sprint):**
- Pedido sin madera suficiente, o stock por debajo del mínimo tras una salida: mensaje en el panel en ese momento,
  alerta en el Dashboard y WhatsApp al encargado.
- Nueva solicitud de reunión: alerta en el Dashboard y WhatsApp al encargado.
- Mientras no esté conectada la app de Meta, los WhatsApp quedan en modo simulado. Con Meta real hacen falta plantillas
  aprobadas (Parte B).

**Bot de WhatsApp:**
- Consultas generales sin cobro: ubicación con el enlace de Google Maps, horarios, formas de pago, tiempo de
  fabricación, cobertura y anticipo. Las respuestas salen de `configuracion_negocio`.
- Cotización y proforma con "precio referencial; el precio final se acuerda con el asesor". Después pregunta si quiere
  agendar una reunión con un asesor (*Sí, agendar* · *Tengo dudas* · *Ahora no*), y si acepta, pide el día y el horario
  que le convienen.
- Avisa al cliente cuando la reunión queda agendada y cuando empieza la producción.
- "¿Cómo va mi pedido?" responde con el estado y la fase reales (pendiente del Sprint 5).

**Panel:**
- Página **Ventas**: cotizaciones y reuniones por agendar, con la preferencia del cliente. Admin y Ventas fijan la
  fecha de la reunión, que aparece en el calendario.
- Ficha del pedido:
  - Precio referencial y precio acordado (editable, con motivo).
  - Pagos: registro, lista y anulación (Admin).
  - Saldo y porcentaje pagado.
  - Botón **Iniciar producción**, activo desde el 50 %.
- Página **Configuración** (Admin): los datos del negocio que responde el bot y el WhatsApp del encargado.
- Dashboard: reuniones por agendar, pedidos sin madera, ventas del mes (pagos del mes) y stock bajo (pendiente del
  Sprint 5).

**Se retira:** la pasarela simulada (`mockQr`), su webhook, `POST /api/pagos/qr`, `POST /api/dev/pagos/:id/simular` y
`npm run pagos:simular`.

**Pruebas:**
- Jest:
  - Iniciar producción por debajo del 50 % (rechazado) y desde el 50 %.
  - Dos pedidos que compiten por la última madera: uno pasa a producción y el otro a revisión de stock, con aviso.
  - Pago anulado.
  - Precio acordado auditado.
  - Avisos al encargado.
  - Permisos por rol.
- Python: los mensajes nuevos del bot.
- Se adapta el contenido de prueba de Supabase y se regenera el diccionario de datos.

**Verificación de la parte A (2026-11-25):**
- Migración `1793620808000_venta-con-reunion-y-anticipo`: aplica, se revierte y se vuelve a aplicar en `machobol_test`.
  Aplicada en Supabase (los pagos que entraron por la pasarela pasaron a `pagos`) y en la base local de respaldo.
- 145 pruebas Jest (nuevas: pagos, ventas y configuración; adaptadas: logística, pedidos, API interna y WhatsApp).
  Incluyen anticipo por debajo y por encima del 50 %, dos pedidos que compiten por la última madera, avisos al
  encargado, saldo pendiente al cerrar la instalación, pagos inmutables y permisos por rol.
- 33 pruebas Python (nuevas: consultas generales y estado del pedido; medidas que un dato dudoso ya no borra).
- Bot reentrenado (intent `consultar_informacion`). Validación cruzada de 5 particiones sobre 417 ejemplos de 13 intents:
  F1 ponderado de intents **0,918** (mínimo 0,85; el más bajo, `consultar_productos`, 0,831) y de entidades 0,893.
  Un primer intento dio 0,894: los ejemplos genéricos ("quiero información") chocaban con `consultar_productos` y se
  reescribieron. Punta a punta con el simulador contra Supabase: consultas de
  ubicación, pagos, fabricación y cobertura sin cobro; cotización → "Sí, agendar" → horario → reunión solicitada;
  "¿cómo va mi pedido?" con estado real y sin mostrar pedidos ajenos.
- Panel: compila (`vite build`). Acciones de venta probadas por la API contra Supabase (agendar, precio acordado,
  anticipo, iniciar producción rechazada sin anticipo).
- Scripts de Supabase regenerados: `machobol_supabase.sql` (9 migraciones), `verificar.sql` (16 comprobaciones ✅) y
  `limpiar-datos-de-prueba.sql` (probado con ROLLBACK).

#### Parte B — Despliegue en la nube

- [x] **Empaquetado (2026-11-25):** [deploy/docker-compose.yml](deploy/docker-compose.yml) con `caddy` (HTTPS automático,
  panel compilado, `/api/internal` bloqueado desde internet), `api` (Node 24 Debian slim, detrás del proxy con
  `TRUST_PROXY=1`), `rasa` (3.6.21 con el modelo entrenado), `acciones` (rasa-sdk 3.6.2 + aiohttp) y `respaldo`
  (pg_dump diario del esquema public, 14 días). Solo Caddy publica puertos. Scripts `deploy/preparar-servidor.sh`
  (Docker, 2 GB de intercambio, actualizaciones de seguridad) y `deploy/subir.sh` (sube el último commit y el modelo por
  SSH, conserva la versión anterior para volver atrás). La imagen de acciones solo existe para x86: el servidor no puede
  ser ARM (Graviton).
  **Probado con Docker Desktop** (`DOMINIO=localhost`, contra Supabase): los 5 contenedores sanos en ~50 s; HTTP → HTTPS,
  panel y sus rutas, `/api/health` con la base, `/api/internal` bloqueado desde fuera (404 aun con el token), cabeceras
  de seguridad, inicio de sesión a través de Caddy con el límite por IP, bot completo dentro de la red de Docker y copia
  de la base **restaurada** en un PostgreSQL vacío (datos, funciones y triggers; el historial sigue inmutable).
  Memoria en uso: ~1 GB (Rasa ≈ 914 MB, API ≈ 53 MB, acciones ≈ 32 MB, Caddy ≈ 15 MB).
- [ ] Servidor en AWS São Paulo (x86, 4 GB recomendado), IP fija, puertos 80/443. Cuenta creada el 2026-11-24 (plan
  gratuito, 100 USD de crédito hasta el 2027-05-24): primero se confirma si el plan permite Lightsail o solo EC2.
  Acceso desde la terminal con `aws login` (AWS CLI ≥ 2.32, sin claves de acceso).
- [ ] HTTPS con dominio (DuckDNS gratuito o dominio propio).
- [ ] Endurecimiento: secretos nuevos de producción, contraseña nueva de la base y del Admin (CORS, modo producción y
  proxy de confianza ya van en el compose).
- [ ] Copia diaria de la base funcionando en el servidor (la restauración ya se probó en local).
- App de Meta: webhook en el dominio, número de prueba y plantillas enviadas a aprobación (avisos al cliente y al
  encargado).

**Criterios de aceptación:**
- Una pregunta como "¿dónde están?" recibe la dirección y el mapa, sin ningún cobro.
- Una cotización aceptada termina en una reunión solicitada que el asesor ve en el panel.
- No se puede iniciar la producción por debajo del 50 %; desde el 50 % la madera se descuenta una sola vez.
- Si falta madera, el pedido queda en revisión de stock y el encargado recibe el aviso.
- `https://dominio` abre el panel con HTTPS, el bot responde por WhatsApp y el sistema se levanta solo tras reiniciar
  el servidor.

---

### Sprint 7 — Pruebas finales y entrega 📝 (propuesto)

- Los casos UAT sobre el sistema desplegado, con los tres roles y conversaciones reales de WhatsApp.
- Rendimiento medido en el servidor desplegado, con los números finales para la tesis.
- Ajustes según las pruebas y reentrenamiento del bot con las frases reales que no entendió.
- Limpieza de los datos de prueba (`docs/supabase/limpiar-datos-de-prueba.sql`) y puesta en marcha.
- Documentación final: diccionario de datos, manual de usuario y README de instalación.

---

## 5. Prerrequisitos del entorno

Detectado en esta máquina (Windows 10) el 2026-11-02:

| Requisito | Estado | Acción |
|---|---|---|
| Node.js ≥ 20 | ✅ v24.18.0 (npm 11.16.0) | — |
| PostgreSQL 16+ | ✅ PostgreSQL 16.15 (servicio `postgresql-x64-16`, puerto 5432) | Desde el 2026-11-18 solo aloja `machobol_test` |
| Supabase | ✅ Proyecto en São Paulo (sa-east-1), PostgreSQL 17.11, plan gratuito | Base del sistema desde el 2026-11-18 (ver §4, Sprint 5) |
| Python 3.10 (Rasa) | ✅ Python 3.10.11 junto al 3.14; Rasa en `rasa_bot/.venv` | — |
| Docker | ❌ No instalado | Opcional; el plan no lo requiere |
| Túnel HTTPS (cloudflared) | ❌ No instalado | `winget install --id Cloudflare.cloudflared` cuando se configure Meta |
| App de Meta + número de prueba de WhatsApp | — | Crear la app y cargar App Secret, token y Phone Number ID en `backend/.env` |

---

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Incompatibilidad de Rasa con Python 3.14 | `venv` con Python 3.10 y versiones fijadas en `requirements.txt` |
| Meta exige HTTPS público, plantillas y verificación de negocio | Simulador local de webhooks; plantillas solicitadas con anticipación (Sprint 3) |
| Dos pagos compiten por la última madera | `SELECT ... FOR UPDATE` + CHECK ≥ 0 + prueba de concurrencia automatizada |
| Errores de redondeo con decimales | Aritmética entera en centímetros y centavos; pruebas tabuladas |
| Medidas ambiguas en el chat ("4 por 2") | El bot confirma explícitamente alto y ancho antes de cotizar |
| Anticipo cobrado sin stock disponible | Al iniciar la producción, `REVISION_STOCK` + aviso al encargado (panel, Dashboard y WhatsApp); "Reintentar" al reponer la madera |

---

## 7. Decisiones de negocio confirmadas

Todos los supuestos quedaron resueltos el 2026-11-02:

| Tema | Decisión | Dónde se aplica |
|---|---|---|
| **Moneda** | Todo el sistema opera solo en bolivianos (Bs), sin tipo de cambio. | Todos los montos; `pagos_qr.monto` |
| **Precios** | Cedro 1″: corredizo 2,470 Bs/m², batiente 2,500 Bs/m²; motor corredizo 1,740; motor batiente 2,088; puerta de ingreso 696. Cada madera tiene su propio precio por m², que fija el Admin. | Seed de `precios_porton` y `accesorios`; panel de Inventario |
| **Redondeo** | ~~Al múltiplo de 100 Bs~~. **Eliminado el 2026-11-06: se cobra el monto exacto**, con centavos. | Cotizador; migración `1793620805000` |
| **Madera** | El cliente elige la madera; el bot ofrece las que tienen precio para ese portón (con botón, las que tienen stock suficiente). | `precios_porton` + `GET /api/internal/maderas` |
| **Fases** | Las 11 fases de §2.4 son definitivas. | Seed de `fases_produccion` |
| **Consumo de madera** | 1 m² de portón consume 1 m² de madera, más un 10 % de merma. | `productos.factor_consumo = 1`, `merma_pct = 10` |
| **Troca** | m² = ancho (pulg) × largo (pies); el espesor solo clasifica la madera. | Ingreso de inventario (Sprint 2) |
| **Pago** | ~~Pago total de la cotización por QR~~. **Desde el 2026-11-25:** el bot no cobra; cotiza un precio referencial y agenda una reunión con un asesor, donde se acuerda el precio final. La fabricación empieza con un anticipo del 50 % (editable). Se acepta QR, efectivo, transferencia y cheque; los pagos los registra el Admin. | Sprint 6 |
| **Validez** | La cotización mantiene su precio referencial 15 días (configurable). | `COTIZACION_VALIDEZ_DIAS` |
| **Recargo de transporte** | ~~150 Bs fijos fuera de la ciudad~~. **Desde el 2026-11-25:** a 45 minutos o más de la ciudad se cobra un adicional que se acuerda en la reunión. | Sprint 6 |
| **Parques infantiles** | Precio fijo de catálogo, sin la fórmula por m². | `productos.modo_precio = 'FIJO'` |
| **Compatibilidad** | Cada motor solo aplica a su tipo de portón; la puerta de ingreso y el transporte aplican a ambos. | `accesorios.tipo_porton_compatible` |

---

## 8. Forma de trabajo

1. Se ejecuta **un sprint a la vez**, empezando por el Sprint 1 (backend + BD).
2. Al cierre de cada sprint: demostración de los criterios de aceptación y **confirmación explícita** antes de avanzar.
3. Un commit por módulo con mensajes convencionales (`feat(inventario): ...`). Pruebas en verde antes de cerrar un sprint.
4. Este documento se actualiza al cerrar cada sprint (casillas marcadas y decisiones registradas).
