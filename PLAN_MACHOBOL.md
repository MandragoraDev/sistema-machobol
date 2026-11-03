# PLAN_MACHOBOL — Sistema Web Integral y Asistente Virtual

> Versión 1.2 · 2026-11-02 · Estado: **aprobado** · Sprint 1 completado · Moneda única: **bolivianos (Bs)**
> Forma de trabajo: un sprint a la vez, con punto de confirmación al cierre de cada uno.

---

## 0. Resumen

Sistema para MACHOBOL (portones y parques infantiles de madera) que automatiza:

- **Ventas por WhatsApp** con un asistente virtual (Rasa) que entiende al cliente y recoge los datos de la cotización.
- **Cotización paramétrica** de portones por m², con PDF y cobro por QR. Todo el sistema opera en bolivianos (Bs).
- **Inventario de madera** en m², con descuento transaccional (ACID) al confirmarse el pago.
- **Seguimiento logístico** de cada pedido en 11 fases de producción (tablero Kanban).

| Componente | Tecnología | Carpeta | Puerto (dev) |
|---|---|---|---|
| API REST | Node.js 24 + Express 5 + `pg` | `/backend` | 4000 |
| Panel web | React 19 + Vite + TailwindCSS | `/frontend` | 5173 |
| Motor PLN | Rasa Open Source 3.6 (Python 3.10) | `/rasa_bot` | 5005 (servidor) · 5055 (acciones) |
| Base de datos | PostgreSQL 16+ | — | 5432 |

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
                                                             (cotizar, PDF, generar QR)

 Panel web (React) ──JWT──► backend /api/* ──► PostgreSQL
 Pasarela QR (mock) ──callback firmado──► backend /api/webhooks/pagos ──► transacción ACID
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
│   │   │   ├── pagos/         # adaptador de pasarela QR + webhook
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
subtotal_base  = área_m2 × precio_m2          (Corredizo 2,470 Bs/m² · Batiente 2,500 Bs/m²)
adicionales    = Σ accesorios + Σ recargos    (Motor corredizo +1,740 · Motor batiente +2,088 · Puerta ingreso +696
                                               · Transporte/viáticos +150 solo si la entrega es fuera de la ciudad, a más de 45 min)
total_exacto   = subtotal_base + adicionales
total_final    = múltiplo de 100 Bs más cercano a total_exacto (empate hacia arriba)
```

- **Aritmética entera:** las medidas se convierten a centímetros y los montos a centavos. Así no hay
  errores de punto flotante (`área_cm² × precio / 100 = centavos`). Para redondear se usa `round(centavos / 10000) × 10000`.
- **Snapshot de precios:** el pedido guarda el precio por m² y de cada accesorio vigentes al cotizar. Si después
  cambia el catálogo, las cotizaciones emitidas no se alteran.
- Los precios se cargan como *seed* en `productos` y `accesorios` (solo Admin los edita). La fórmula vive en código.
- Se guardan `total_exacto` y `total_final` para auditar el ajuste por redondeo.
- **Convención de centavos:** el subtotal se redondea al centavo antes de redondear a 100 Bs, y todos los montos se guardan con 2 decimales.
- **La BD también aplica la regla:** el CHECK `ck_pedidos_redondeo_100` exige `total_final = round(total_exacto / 100) × 100` en todo pedido cotizado por m².
- Accesorios y recargos viven en la misma tabla (`accesorios.tipo_adicional` = `ACCESORIO` | `RECARGO`) y ambos se suman antes del redondeo.

**Casos de prueba de referencia (Bs):**

| Tipo | Alto × Ancho | Área | Base | Adicionales | Exacto | Final |
|---|---|---|---|---|---|---|
| Corredizo | 2.20 × 4.00 | 8.80 | 21,736.00 | Motor corredizo 1,740 | 23,476.00 | **23,500** |
| Batiente | 2.00 × 3.00 | 6.00 | 15,000.00 | Motor batiente 2,088 + Puerta 696 | 17,784.00 | **17,800** |
| Corredizo | 1.50 × 2.50 | 3.75 | 9,262.50 | — | 9,262.50 | **9,300** |
| Corredizo | 2.00 × 2.50 | 5.00 | 12,350.00 | — | 12,350.00 | **12,400** *(empate → hacia arriba)* |
| Batiente | 2.00 × 3.00 | 6.00 | 15,000.00 | Transporte/viáticos 150 | 15,150.00 | **15,200** *(empate → hacia arriba)* |

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

### 2.3 Transacción ACID de pago y descuento de stock

Para evitar cobrar sin stock, este se **pre-valida** antes de generar el QR. El descuento real ocurre solo dentro de esta transacción:

```sql
BEGIN;
  SELECT ... FROM pagos_qr WHERE transaccion_id = $1 FOR UPDATE;      -- idempotencia
  --  si ya está CONFIRMADO → COMMIT sin cambios y responder 200
  SELECT stock_actual_m2 FROM inventario_madera WHERE id = $2 FOR UPDATE;
  --  si stock < requerido → ROLLBACK
  UPDATE inventario_madera SET stock_actual_m2 = stock_actual_m2 - $req WHERE id = $2;
  INSERT INTO movimientos_inventario (tipo, cantidad_m2, pedido_id, ...) VALUES ('SALIDA', ...);
  UPDATE pagos_qr SET estado = 'CONFIRMADO', confirmado_en = now() WHERE ...;
  UPDATE pedidos  SET estado = 'EN_PRODUCCION', fase_actual = 1 WHERE ...;
  INSERT INTO historial_fases (pedido_id, fase_id, ...) VALUES ($pedido, 1, ...);
COMMIT;
```

- Si hubo `ROLLBACK` por falta de stock, el banco ya cobró. En una transacción aparte, el pago queda en
  `REVISION` y el pedido en `REVISION_STOCK`, y se alerta al Admin para reponer la madera o devolver el dinero.
- `SELECT ... FOR UPDATE` serializa los pagos que compiten por la misma madera.
- El callback de la pasarela puede llegar repetido. Gracias a la idempotencia por `transaccion_id`, solo se descuenta una vez.

### 2.4 Estados del pedido vs. fases de producción

Son dos dimensiones distintas:

- **Estado comercial** (`estados_pedido`): `COTIZADO → PENDIENTE_PAGO → EN_PRODUCCION → ENTREGADO`,
  más `CANCELADO` y `REVISION_STOCK`.
- **Fase de producción** (`fases_produccion`): solo aplica a pedidos `EN_PRODUCCION`. Avanza **estrictamente
  en orden** (1 → 2 → … → 11). Al cerrar la fase 11, el pedido pasa a `ENTREGADO`.

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
| Pagos QR | Lectura + revisión | Generar QR / lectura | — |
| Inventario: ingreso de trocas | Sí | — | Sí |
| Inventario: ajustes manuales | Sí (motivo obligatorio) | — | — |
| Kanban: mover fase | Avanzar y retroceder (con motivo) | Lectura | Avanzar |

---

## 3. Modelo de datos (PostgreSQL)

Las tablas incluyen `id` (PK, `INTEGER` identity), `creado_en` y `actualizado_en` (este último lo mantiene un trigger).
Excepción: las bitácoras de solo inserción (`movimientos_inventario`, `historial_fases`, `mensajes_whatsapp`) no llevan `actualizado_en`.
Los montos van en Bs como `NUMERIC(12,2)`, y los m² en `NUMERIC(12,4)`.
Cada regla de integridad tiene un nombre (`ck_*`, `uq_*`, `ux_*`), así la API puede traducir cada violación a un mensaje claro.

| Tabla | Propósito | Campos clave |
|---|---|---|
| `usuarios` | Personal interno | `nombre`, `email` UNIQUE, `password_hash`, `rol` ENUM(`ADMIN`,`VENTAS`,`TALLER`), `activo` |
| `clientes` | Clientes de WhatsApp | `wa_id` UNIQUE (teléfono E.164), `nombre`, `ci_nit`, `direccion` |
| `categorias_producto` | Portones, Parques infantiles | `nombre` UNIQUE |
| `productos` | Catálogo | `categoria_id` FK, `nombre`, `tipo_porton` ENUM(`CORREDIZO`,`BATIENTE`) NULL, `modo_precio` ENUM(`POR_M2`,`FIJO`), `precio_m2`, `precio_fijo`, `madera_id` FK, `factor_consumo`, `merma_pct` |
| `accesorios` | Accesorios y recargos | `codigo` UNIQUE, `nombre`, `tipo_adicional` ENUM(`ACCESORIO`,`RECARGO`), `precio`, `tipo_porton_compatible` NULL |
| `inventario_madera` | Stock por tipo de madera | `especie`, `espesor_pulg`, `stock_actual_m2` NUMERIC(12,4) CHECK ≥ 0, `stock_minimo_m2` |
| `movimientos_inventario` | Kardex | `madera_id` FK, `tipo` ENUM(`INGRESO`,`SALIDA`,`AJUSTE`), `cantidad_m2`, `piezas`, `ancho_pulg`, `largo_pies`, `stock_resultante_m2`, `pedido_id` FK NULL, `usuario_id` FK NULL, `motivo` |
| `estados_pedido` | Catálogo de estados | `codigo` UNIQUE, `nombre` |
| `fases_produccion` | Fases 1–11 | `orden` UNIQUE CHECK 1–11, `nombre`, `descripcion` |
| `pedidos` | Cotización → pedido | `codigo` UNIQUE (`MCH-AAAA-NNNN`), `cliente_id`, `producto_id`, `alto_m`, `ancho_m`, `area_m2`, `precio_m2_aplicado`, `subtotal_base`, `total_adicionales` (accesorios + recargos), `total_exacto`, `total_final`, `madera_id`, `madera_requerida_m2`, `estado_id`, `fase_actual_id` NULL, `canal` ENUM(`WHATSAPP`,`PANEL`), `creado_por` NULL |
| `pedido_accesorios` | Accesorios del pedido | PK(`pedido_id`,`accesorio_id`), `precio_aplicado` |
| `historial_fases` | Trazabilidad del Kanban | `pedido_id`, `fase_id`, `usuario_id`, `observacion` |
| `pagos_qr` | Cobros QR (pago total, en Bs) | `pedido_id` FK, `transaccion_id` UNIQUE, `monto`, `estado` ENUM(`PENDIENTE`,`CONFIRMADO`,`EXPIRADO`,`FALLIDO`,`REVISION`), `qr_payload`, `expira_en`, `confirmado_en` |
| `mensajes_whatsapp` | Auditoría y deduplicación | `wa_message_id` UNIQUE, `cliente_id`, `direccion` ENUM(`IN`,`OUT`), `contenido` JSONB |

**Tablas añadidas al esquema solicitado y su motivo:**

- `pedido_accesorios`: guardar los IDs de accesorios como arreglo dentro de `pedidos` impediría las FK y el snapshot de precio. Una tabla intermedia resuelve ambas cosas.
- `historial_fases`: registra quién movió cada pedido y cuándo; el Kanban y las auditorías lo necesitan.
- `mensajes_whatsapp`: Meta reenvía webhooks; sin esta tabla un mensaje se procesaría dos veces.

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

### Sprint 2 — Seguridad JWT, autenticación y CRUD de Inventario / Dashboard 🟡 (implementado el 2026-11-03, pendiente de confirmación)

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

**Criterios de aceptación:**
- Un usuario Taller recibe 403 en `/api/usuarios`.
- Ingresar 10 piezas de 8" × 10' suma exactamente 6.1935 m² y genera un movimiento `INGRESO`.
- El ajuste que dejaría el stock negativo se rechaza sin modificar nada.

---

### Sprint 3 — Rasa: intents, entidades y webhooks de WhatsApp

**Objetivo:** recibir mensajes reales de WhatsApp, entenderlos con Rasa y responder.

- [ ] Entorno Python 3.10 aislado (`venv`) con Rasa Open Source 3.6 y `rasa-sdk`. Idioma `es`.
- [ ] Pipeline NLU: `WhitespaceTokenizer`, `RegexFeaturizer`, `LexicalSyntacticFeaturizer`, `CountVectorsFeaturizer` (palabra y `char_wb`), `DIETClassifier`, `EntitySynonymMapper`, `FallbackClassifier`.
- [ ] Intents: `saludar`, `despedir`, `consultar_productos`, `cotizar_porton`, `informar_medidas`, `elegir_tipo_porton`, `agregar_accesorio`, `confirmar`, `negar`, `consultar_estado_pedido`, `hablar_con_asesor`.
- [ ] Entidades:
  - `tipo_porton`, con sinónimos (corredero → corredizo; abatible → batiente).
  - `alto` y `ancho`, con regex que acepta "2,20", "2.20 m" y "4 x 2".
  - `accesorio` y `codigo_pedido`.
- [ ] Formulario `formulario_cotizacion` (tipo, alto, ancho, accesorios y si la entrega es fuera de la ciudad). El bot **confirma las medidas** antes de cotizar ("¿Alto 2.20 m y ancho 4.00 m?").
- [ ] Servidor de acciones con `action_cotizar` conectado a un endpoint simulado (la versión real llega en el Sprint 4).
- [ ] Backend, módulo `whatsapp`:
  - `GET` de verificación (`hub.verify_token`).
  - `POST` con validación HMAC sobre el cuerpo crudo, respuesta 200 inmediata y procesamiento asíncrono.
  - Deduplicación por `wa_message_id`, alta automática de `clientes`.
  - Reenvío a Rasa y respuesta por Graph API.
- [ ] Autenticación servicio a servicio (Rasa → backend) mediante el header `X-Service-Token`.
- [ ] Script simulador que envía *payloads* de Meta falsos, para probar sin depender del túnel.
- [ ] Túnel HTTPS de desarrollo (cloudflared o ngrok) y número de prueba de Meta.

**Criterios de aceptación:**
- `rasa data validate` sin errores; `rasa test nlu` con F1 de intents ≥ 0.85.
- "quiero un portón corredizo de 4 por 2,20" → `cotizar_porton`, `tipo_porton=corredizo` y las dos medidas extraídas.
- Un webhook repetido con el mismo `wa_message_id` se procesa una sola vez.
- Un webhook con firma inválida → 401.

---

### Sprint 4 — Cotizador, PDF y pagos QR con transaccionalidad ACID

**Objetivo:** cerrar el ciclo de venta, de la cotización al pago confirmado y el stock descontado.

- [ ] `cotizador.service`: función pura con aritmética entera (§2.1). Valida rangos de medidas y la compatibilidad de los accesorios, y aplica el recargo `TRANSPORTE_VIATICOS` solo si la entrega es fuera de la ciudad.
- [ ] `POST /api/cotizaciones/calcular` (panel y `/api/internal` para Rasa).
- [ ] `POST /api/pedidos`: crea el pedido `COTIZADO` con snapshot de precios y `madera_requerida_m2`.
- [ ] Pruebas tabuladas del cotizador: casos de §2.1, decimales, empates, medidas inválidas, motor incompatible.
- [ ] PDF con PDFKit: logo, datos del cliente, desglose (área, base, adicionales, exacto, ajuste por redondeo y total final), código y validez. Se envía por WhatsApp como documento.
- [ ] Pagos QR:
  - Interfaz `PaymentGateway { crearCobro, verificarCallback }` con implementación `MockQrGateway` (genera `transaccion_id` y un QR PNG con `qrcode`).
  - `POST /api/pagos/qr`: pre-valida el stock y genera el cobro en Bs por el **total** del pedido (no se aceptan anticipos), con fecha de vencimiento.
  - `POST /api/webhooks/pagos`: callback firmado que ejecuta la transacción de §2.3.
  - `POST /api/dev/pagos/:id/simular` (solo con `NODE_ENV=development`).
- [ ] Bot de punta a punta: cotiza → PDF → "¿Confirmas el pedido?" → QR → pago simulado → mensaje con el código de pedido.

**Criterios de aceptación:**
- Prueba de concurrencia: dos pagos simultáneos con stock para uno solo. Exactamente uno queda `EN_PRODUCCION`, el otro `REVISION_STOCK`, y el stock nunca es negativo.
- Un callback repetido 3 veces descuenta el stock una sola vez.
- Si falla cualquier paso dentro de la transacción, ni el stock, ni el pago, ni el pedido cambian.

---

### Sprint 5 — Tablero Kanban logístico (11 fases) e integración final

**Objetivo:** visibilidad de la producción y el sistema integrado de punta a punta.

- [ ] Endpoints de logística:
  - `GET /api/logistica/tablero`: pedidos agrupados por fase, con días en la fase actual.
  - `PATCH /api/pedidos/:id/fase`: solo avanza a la fase siguiente. El Admin puede retroceder con motivo, y cada cambio se registra en `historial_fases`.
- [ ] React Kanban: 11 columnas con desplazamiento horizontal y arrastrar y soltar (`@dnd-kit`).
  - Solo se puede soltar en la columna siguiente.
  - Tarjetas con código, cliente, producto, medidas y días en la fase.
  - Filtros y panel de detalle con historial.
- [ ] Al cerrar la fase 11, el pedido pasa a `ENTREGADO`.
- [ ] Bot: `consultar_estado_pedido` responde con la fase actual del pedido.
- [ ] Notificaciones por WhatsApp en los hitos (inicio de producción, listo para instalar, instalado), con **plantillas aprobadas por Meta**, obligatorias fuera de la ventana de 24 h.
- [ ] Dashboard final: pedidos por estado y fase, ventas del mes y pagos en revisión.
- [ ] Endurecimiento: CORS restringido, revisión de variables de entorno, logs estructurados, *seeds* de demostración y README completo de instalación.

**Criterios de aceptación:**
- Prueba E2E: mensaje simulado → cotización → pago → fase 1 → … → fase 11 → `ENTREGADO`, con stock e historial consistentes.
- Taller puede avanzar tarjetas; Ventas solo las ve.
- Ningún intento de saltar una fase pasa la validación, ni en la API ni en la UI.

---

## 5. Prerrequisitos del entorno

Detectado en esta máquina (Windows 10) el 2026-11-02:

| Requisito | Estado | Acción |
|---|---|---|
| Node.js ≥ 20 | ✅ v24.18.0 (npm 11.16.0) | — |
| PostgreSQL 16+ | ✅ PostgreSQL 16.15 (servicio `postgresql-x64-16`, puerto 5432) | — |
| Python 3.10 (Rasa) | ⚠️ Solo está Python 3.14; Rasa 3.x requiere 3.8–3.10 | Instalar Python 3.10 junto al 3.14 (`py -3.10`) antes del Sprint 3 |
| Docker | ❌ No instalado | Opcional; el plan no lo requiere |
| Túnel HTTPS (cloudflared / ngrok) | — | Necesario en el Sprint 3 para el webhook de Meta |
| App de Meta + número de prueba de WhatsApp | — | Necesario en el Sprint 3 |

---

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Incompatibilidad de Rasa con Python 3.14 | `venv` con Python 3.10 y versiones fijadas en `requirements.txt` |
| Meta exige HTTPS público, plantillas y verificación de negocio | Simulador local de webhooks; plantillas solicitadas con anticipación (Sprint 3) |
| Dos pagos compiten por la última madera | `SELECT ... FOR UPDATE` + CHECK ≥ 0 + prueba de concurrencia automatizada |
| Errores de redondeo con decimales | Aritmética entera en centímetros y centavos; pruebas tabuladas |
| Medidas ambiguas en el chat ("4 por 2") | El bot confirma explícitamente alto y ancho antes de cotizar |
| Cobro exitoso sin stock disponible | Pre-validación antes del QR + estado `REVISION_STOCK` con alerta al Admin |

---

## 7. Decisiones de negocio confirmadas

Todos los supuestos quedaron resueltos el 2026-11-02:

| Tema | Decisión | Dónde se aplica |
|---|---|---|
| **Moneda** | Todo el sistema opera solo en bolivianos (Bs), sin tipo de cambio. | Todos los montos; `pagos_qr.monto` |
| **Precios** | Corredizo 2,470 Bs/m²; Batiente 2,500 Bs/m²; motor corredizo 1,740; motor batiente 2,088; puerta de ingreso 696. | Seed de `productos` y `accesorios` |
| **Redondeo** | Al múltiplo de 100 Bs más cercano; el empate se redondea hacia arriba (12,350 → 12,400). | `ck_pedidos_redondeo_100` + cotizador |
| **Fases** | Las 11 fases de §2.4 son definitivas. | Seed de `fases_produccion` |
| **Consumo de madera** | 1 m² de portón consume 1 m² de madera, más un 10 % de merma. | `productos.factor_consumo = 1`, `merma_pct = 10` |
| **Troca** | m² = ancho (pulg) × largo (pies); el espesor solo clasifica la madera. | Ingreso de inventario (Sprint 2) |
| **Pago** | Se exige el pago total de la cotización por QR. | `POST /api/pagos/qr` (Sprint 4) |
| **Recargo de transporte** | Transporte/viáticos de 150 Bs, solo si la entrega es fuera de la ciudad (a más de 45 min). | `accesorios` con `tipo_adicional = 'RECARGO'` |
| **Parques infantiles** | Precio fijo de catálogo, sin la fórmula por m². | `productos.modo_precio = 'FIJO'` |
| **Compatibilidad** | Cada motor solo aplica a su tipo de portón; la puerta de ingreso y el transporte aplican a ambos. | `accesorios.tipo_porton_compatible` |

---

## 8. Forma de trabajo

1. Se ejecuta **un sprint a la vez**, empezando por el Sprint 1 (backend + BD).
2. Al cierre de cada sprint: demostración de los criterios de aceptación y **confirmación explícita** antes de avanzar.
3. Un commit por módulo con mensajes convencionales (`feat(inventario): ...`). Pruebas en verde antes de cerrar un sprint.
4. Este documento se actualiza al cerrar cada sprint (casillas marcadas y decisiones registradas).
