-- ====================================================================================================
-- MACHOBOL: creación completa de la base de datos en Supabase (SQL Editor)
--
-- Ejecutar UNA sola vez, sobre un proyecto vacío. Todo corre en una transacción: si algo falla, no queda nada a medias.
-- Generado el 2026-11-18 a partir de backend/src/db/migrations (8 migraciones) y del seed.
-- No editar a mano: los cambios futuros se hacen con una migración nueva y `npm run db:migrate`.
--
-- Después de ejecutarlo, falta solo el usuario Administrador: lo crea `npm run db:seed` con los datos del .env
-- (ADMIN_EMAIL y ADMIN_PASSWORD), porque la contraseña se guarda hasheada con bcrypt.
-- ====================================================================================================

BEGIN;

-- ====================================================================================================
-- Registro de migraciones (tabla de node-pg-migrate): así `npm run db:migrate` no vuelve a aplicarlas
-- ====================================================================================================

CREATE TABLE public.pgmigrations (
  id     SERIAL PRIMARY KEY,
  name   varchar(255) NOT NULL,
  run_on timestamp NOT NULL
);

-- ====================================================================================================
-- Migración 1793620800000_tipos-y-funciones
-- ====================================================================================================

-- Tipos enumerados compartidos por varias tablas.
CREATE TYPE rol_usuario       AS ENUM ('ADMIN', 'VENTAS', 'TALLER');
CREATE TYPE tipo_porton       AS ENUM ('CORREDIZO', 'BATIENTE');
CREATE TYPE modo_precio       AS ENUM ('POR_M2', 'FIJO');
CREATE TYPE tipo_adicional    AS ENUM ('ACCESORIO', 'RECARGO');
CREATE TYPE tipo_movimiento   AS ENUM ('INGRESO', 'SALIDA', 'AJUSTE');
CREATE TYPE canal_pedido      AS ENUM ('WHATSAPP', 'PANEL');
CREATE TYPE estado_pago       AS ENUM ('PENDIENTE', 'CONFIRMADO', 'EXPIRADO', 'FALLIDO', 'REVISION');
CREATE TYPE direccion_mensaje AS ENUM ('IN', 'OUT');

-- Mantiene la columna actualizado_en en cada UPDATE.
CREATE FUNCTION fn_set_actualizado_en() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$;

INSERT INTO public.pgmigrations (name, run_on) VALUES ('1793620800000_tipos-y-funciones', now());

-- ====================================================================================================
-- Migración 1793620801000_seguridad-y-clientes
-- ====================================================================================================

-- Convenciones de todo el esquema:
--   * Claves INTEGER (no BIGINT), porque node-postgres devuelve BIGINT como string.
--   * Todos los montos están en bolivianos (Bs), NUMERIC(12,2). El sistema no maneja otras monedas.

-- Personal interno con acceso al panel (RBAC).
CREATE TABLE usuarios (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre          VARCHAR(120) NOT NULL,
  email           VARCHAR(160) NOT NULL,
  password_hash   VARCHAR(100) NOT NULL,
  rol             rol_usuario  NOT NULL,
  activo          BOOLEAN      NOT NULL DEFAULT true,
  creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_usuarios_email UNIQUE (email),
  CONSTRAINT ck_usuarios_email_minusculas CHECK (email = lower(email))
);

CREATE TRIGGER trg_usuarios_actualizado_en BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- Clientes que escriben por WhatsApp. wa_id es el número E.164 sin "+", tal como lo envía Meta.
CREATE TABLE clientes (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wa_id           VARCHAR(15)  NOT NULL,
  nombre          VARCHAR(120),
  ci_nit          VARCHAR(20),
  direccion       TEXT,
  creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_clientes_wa_id UNIQUE (wa_id),
  CONSTRAINT ck_clientes_wa_id_formato CHECK (wa_id ~ '^[0-9]{8,15}$')
);

CREATE TRIGGER trg_clientes_actualizado_en BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

INSERT INTO public.pgmigrations (name, run_on) VALUES ('1793620801000_seguridad-y-clientes', now());

-- ====================================================================================================
-- Migración 1793620802000_catalogo-e-inventario
-- ====================================================================================================

CREATE TABLE categorias_producto (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre          VARCHAR(80)  NOT NULL,
  descripcion     TEXT,
  activo          BOOLEAN      NOT NULL DEFAULT true,
  creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_categorias_producto_nombre UNIQUE (nombre)
);

CREATE TRIGGER trg_categorias_producto_actualizado_en BEFORE UPDATE ON categorias_producto
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- Stock de madera, guardado solo en m². Las trocas (pulgadas × pies) se convierten al registrar el ingreso.
CREATE TABLE inventario_madera (
  id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  especie          VARCHAR(80)   NOT NULL,
  espesor_pulg     NUMERIC(5,2)  NOT NULL,
  stock_actual_m2  NUMERIC(12,4) NOT NULL DEFAULT 0,
  stock_minimo_m2  NUMERIC(12,4) NOT NULL DEFAULT 0,
  activo           BOOLEAN       NOT NULL DEFAULT true,
  creado_en        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  actualizado_en   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT uq_inventario_madera_especie_espesor UNIQUE (especie, espesor_pulg),
  CONSTRAINT ck_inventario_madera_espesor CHECK (espesor_pulg > 0),
  -- Última defensa del descuento ACID: el stock nunca puede quedar negativo.
  CONSTRAINT ck_inventario_madera_stock_no_negativo CHECK (stock_actual_m2 >= 0),
  CONSTRAINT ck_inventario_madera_minimo CHECK (stock_minimo_m2 >= 0)
);

CREATE TRIGGER trg_inventario_madera_actualizado_en BEFORE UPDATE ON inventario_madera
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- Portones: precio en Bs por m² (cotizador paramétrico). Parques infantiles: precio fijo de catálogo en Bs.
CREATE TABLE productos (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  categoria_id    INTEGER       NOT NULL REFERENCES categorias_producto (id),
  nombre          VARCHAR(120)  NOT NULL,
  descripcion     TEXT,
  tipo_porton     tipo_porton,
  modo_precio     modo_precio   NOT NULL,
  precio_m2       NUMERIC(12,2),
  precio_fijo     NUMERIC(12,2),
  -- Consumo de madera: área × factor_consumo × (1 + merma_pct / 100).
  madera_id       INTEGER       REFERENCES inventario_madera (id),
  factor_consumo  NUMERIC(6,3)  NOT NULL DEFAULT 1,
  merma_pct       NUMERIC(5,2)  NOT NULL DEFAULT 10,
  activo          BOOLEAN       NOT NULL DEFAULT true,
  creado_en       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT uq_productos_nombre UNIQUE (nombre),
  CONSTRAINT ck_productos_modo_precio CHECK (
    (modo_precio = 'POR_M2'
      AND tipo_porton IS NOT NULL
      AND precio_m2 IS NOT NULL AND precio_m2 > 0
      AND precio_fijo IS NULL)
    OR
    (modo_precio = 'FIJO'
      AND tipo_porton IS NULL
      AND precio_fijo IS NOT NULL AND precio_fijo > 0
      AND precio_m2 IS NULL)
  ),
  CONSTRAINT ck_productos_factor_consumo CHECK (factor_consumo > 0),
  CONSTRAINT ck_productos_merma CHECK (merma_pct BETWEEN 0 AND 100)
);

CREATE INDEX ix_productos_categoria ON productos (categoria_id);

CREATE TRIGGER trg_productos_actualizado_en BEFORE UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- Adicionales que se suman al subtotal antes del redondeo:
--   ACCESORIO: componente del portón (motor, puerta de ingreso).
--   RECARGO: cargo del servicio (p. ej. transporte/viáticos fuera de la ciudad).
CREATE TABLE accesorios (
  id                      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo                  VARCHAR(40)    NOT NULL,
  nombre                  VARCHAR(120)   NOT NULL,
  tipo_adicional          tipo_adicional NOT NULL DEFAULT 'ACCESORIO',
  precio                  NUMERIC(12,2)  NOT NULL,
  -- NULL = compatible con ambos tipos de portón.
  tipo_porton_compatible  tipo_porton,
  activo                  BOOLEAN        NOT NULL DEFAULT true,
  creado_en               TIMESTAMPTZ    NOT NULL DEFAULT now(),
  actualizado_en          TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT uq_accesorios_codigo UNIQUE (codigo),
  CONSTRAINT ck_accesorios_precio CHECK (precio >= 0),
  CONSTRAINT ck_accesorios_recargo_sin_tipo_porton CHECK (
    tipo_adicional = 'ACCESORIO' OR tipo_porton_compatible IS NULL
  )
);

CREATE TRIGGER trg_accesorios_actualizado_en BEFORE UPDATE ON accesorios
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

INSERT INTO public.pgmigrations (name, run_on) VALUES ('1793620802000_catalogo-e-inventario', now());

-- ====================================================================================================
-- Migración 1793620803000_pedidos-y-produccion
-- ====================================================================================================

-- Estado comercial del pedido (COTIZADO, PENDIENTE_PAGO, EN_PRODUCCION, ...).
CREATE TABLE estados_pedido (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo          VARCHAR(30)  NOT NULL,
  nombre          VARCHAR(60)  NOT NULL,
  descripcion     TEXT,
  creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_estados_pedido_codigo UNIQUE (codigo)
);

CREATE TRIGGER trg_estados_pedido_actualizado_en BEFORE UPDATE ON estados_pedido
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- Las 11 fases de producción, de "Aserradero" (1) a "Instalación" (11).
CREATE TABLE fases_produccion (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  orden           SMALLINT     NOT NULL,
  nombre          VARCHAR(80)  NOT NULL,
  descripcion     TEXT,
  creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_fases_produccion_orden UNIQUE (orden),
  CONSTRAINT uq_fases_produccion_nombre UNIQUE (nombre),
  CONSTRAINT ck_fases_produccion_orden CHECK (orden BETWEEN 1 AND 11)
);

CREATE TRIGGER trg_fases_produccion_actualizado_en BEFORE UPDATE ON fases_produccion
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- Un pedido nace como cotización y avanza por estados y fases. Montos en Bs, congelados al cotizar.
CREATE TABLE pedidos (
  id                   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo               VARCHAR(20)   NOT NULL,
  cliente_id           INTEGER       NOT NULL REFERENCES clientes (id),
  producto_id          INTEGER       NOT NULL REFERENCES productos (id),
  -- Medidas: solo para productos cotizados por m². El área la calcula la propia BD.
  alto_m               NUMERIC(5,2),
  ancho_m              NUMERIC(5,2),
  area_m2              NUMERIC(10,4) GENERATED ALWAYS AS (alto_m * ancho_m) STORED,
  precio_m2_aplicado   NUMERIC(12,2),
  subtotal_base        NUMERIC(12,2) NOT NULL,
  -- Suma de accesorios y recargos (pedido_accesorios).
  total_adicionales    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_exacto         NUMERIC(12,2) NOT NULL,
  total_final          NUMERIC(12,2) NOT NULL,
  -- Madera que se descontará cuando se confirme el pago.
  madera_id            INTEGER       REFERENCES inventario_madera (id),
  madera_requerida_m2  NUMERIC(12,4) NOT NULL DEFAULT 0,
  estado_id            INTEGER       NOT NULL REFERENCES estados_pedido (id),
  fase_actual_id       INTEGER       REFERENCES fases_produccion (id),
  canal                canal_pedido  NOT NULL,
  -- NULL cuando el pedido lo generó el asistente de WhatsApp.
  creado_por           INTEGER       REFERENCES usuarios (id),
  observaciones        TEXT,
  creado_en            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  actualizado_en       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT uq_pedidos_codigo UNIQUE (codigo),
  CONSTRAINT ck_pedidos_medidas_completas CHECK (num_nulls(alto_m, ancho_m, precio_m2_aplicado) IN (0, 3)),
  CONSTRAINT ck_pedidos_medidas_positivas CHECK (alto_m > 0 AND ancho_m > 0 AND precio_m2_aplicado > 0),
  CONSTRAINT ck_pedidos_montos_no_negativos CHECK (subtotal_base >= 0 AND total_adicionales >= 0 AND total_final >= 0),
  CONSTRAINT ck_pedidos_total_exacto CHECK (total_exacto = subtotal_base + total_adicionales),
  -- Regla de negocio: un portón cotizado por m² se redondea al múltiplo de 100 Bs más cercano (empate hacia arriba).
  CONSTRAINT ck_pedidos_redondeo_100 CHECK (
    precio_m2_aplicado IS NULL OR total_final = round(total_exacto / 100) * 100
  ),
  CONSTRAINT ck_pedidos_madera CHECK (
    madera_requerida_m2 >= 0 AND (madera_requerida_m2 = 0 OR madera_id IS NOT NULL)
  )
);

CREATE INDEX ix_pedidos_cliente ON pedidos (cliente_id);
CREATE INDEX ix_pedidos_estado ON pedidos (estado_id);
CREATE INDEX ix_pedidos_fase_actual ON pedidos (fase_actual_id) WHERE fase_actual_id IS NOT NULL;

CREATE TRIGGER trg_pedidos_actualizado_en BEFORE UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- Accesorios y recargos del pedido, con su precio congelado al cotizar.
CREATE TABLE pedido_accesorios (
  pedido_id        INTEGER       NOT NULL REFERENCES pedidos (id) ON DELETE CASCADE,
  accesorio_id     INTEGER       NOT NULL REFERENCES accesorios (id),
  precio_aplicado  NUMERIC(12,2) NOT NULL,
  creado_en        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (pedido_id, accesorio_id),
  CONSTRAINT ck_pedido_accesorios_precio CHECK (precio_aplicado >= 0)
);

-- Bitácora de solo inserción: cada paso de un pedido por las fases del Kanban.
CREATE TABLE historial_fases (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id    INTEGER      NOT NULL REFERENCES pedidos (id),
  fase_id      INTEGER      NOT NULL REFERENCES fases_produccion (id),
  -- NULL cuando el cambio es automático (p. ej. pago confirmado → fase 1).
  usuario_id   INTEGER      REFERENCES usuarios (id),
  observacion  TEXT,
  creado_en    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ix_historial_fases_pedido ON historial_fases (pedido_id, creado_en);

INSERT INTO public.pgmigrations (name, run_on) VALUES ('1793620803000_pedidos-y-produccion', now());

-- ====================================================================================================
-- Migración 1793620804000_movimientos-pagos-mensajes
-- ====================================================================================================

-- Kardex de madera (solo inserción). cantidad_m2 lleva signo: positivo entra, negativo sale.
CREATE TABLE movimientos_inventario (
  id                   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  madera_id            INTEGER          NOT NULL REFERENCES inventario_madera (id),
  tipo                 tipo_movimiento  NOT NULL,
  cantidad_m2          NUMERIC(12,4)    NOT NULL,
  stock_resultante_m2  NUMERIC(12,4)    NOT NULL,
  -- Medidas originales de la troca (solo en INGRESO), como trazabilidad.
  piezas               INTEGER,
  ancho_pulg           NUMERIC(6,2),
  largo_pies           NUMERIC(6,2),
  pedido_id            INTEGER          REFERENCES pedidos (id),
  usuario_id           INTEGER          REFERENCES usuarios (id),
  motivo               TEXT,
  creado_en            TIMESTAMPTZ      NOT NULL DEFAULT now(),
  CONSTRAINT ck_movimientos_signo CHECK (
    (tipo = 'INGRESO' AND cantidad_m2 > 0)
    OR (tipo = 'SALIDA' AND cantidad_m2 < 0)
    OR (tipo = 'AJUSTE' AND cantidad_m2 <> 0)
  ),
  CONSTRAINT ck_movimientos_stock_resultante CHECK (stock_resultante_m2 >= 0),
  CONSTRAINT ck_movimientos_troca_completa CHECK (
    (tipo = 'INGRESO') = (piezas IS NOT NULL AND ancho_pulg IS NOT NULL AND largo_pies IS NOT NULL)
  ),
  CONSTRAINT ck_movimientos_troca_positiva CHECK (piezas > 0 AND ancho_pulg > 0 AND largo_pies > 0),
  CONSTRAINT ck_movimientos_salida_con_pedido CHECK (tipo <> 'SALIDA' OR pedido_id IS NOT NULL),
  CONSTRAINT ck_movimientos_ajuste_con_motivo CHECK (
    tipo <> 'AJUSTE' OR (motivo IS NOT NULL AND length(btrim(motivo)) > 0)
  )
);

CREATE INDEX ix_movimientos_madera ON movimientos_inventario (madera_id, creado_en DESC);
-- Red de seguridad ACID: un pedido descuenta madera una sola vez.
CREATE UNIQUE INDEX ux_movimientos_salida_por_pedido ON movimientos_inventario (pedido_id) WHERE tipo = 'SALIDA';

-- Cobros QR en Bs. Se exige el pago total: el servicio de pagos cobra siempre el total_final del pedido.
CREATE TABLE pagos_qr (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id       INTEGER       NOT NULL REFERENCES pedidos (id),
  transaccion_id  VARCHAR(64)   NOT NULL,
  monto           NUMERIC(12,2) NOT NULL,
  estado          estado_pago   NOT NULL DEFAULT 'PENDIENTE',
  qr_payload      TEXT,
  expira_en       TIMESTAMPTZ   NOT NULL,
  confirmado_en   TIMESTAMPTZ,
  creado_en       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT uq_pagos_qr_transaccion UNIQUE (transaccion_id),
  CONSTRAINT ck_pagos_qr_monto CHECK (monto > 0)
);

CREATE INDEX ix_pagos_qr_pedido ON pagos_qr (pedido_id);
-- Un pedido no puede tener dos pagos confirmados.
CREATE UNIQUE INDEX ux_pagos_qr_confirmado_por_pedido ON pagos_qr (pedido_id) WHERE estado = 'CONFIRMADO';

CREATE TRIGGER trg_pagos_qr_actualizado_en BEFORE UPDATE ON pagos_qr
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- Auditoría de la conversación y deduplicación de webhooks reenviados por Meta.
CREATE TABLE mensajes_whatsapp (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- NULL solo en salientes cuyo envío falló antes de que Meta asignara un id.
  wa_message_id  VARCHAR(128),
  cliente_id     INTEGER            NOT NULL REFERENCES clientes (id),
  direccion      direccion_mensaje  NOT NULL,
  contenido      JSONB              NOT NULL,
  creado_en      TIMESTAMPTZ        NOT NULL DEFAULT now(),
  CONSTRAINT uq_mensajes_whatsapp_wa_message_id UNIQUE (wa_message_id),
  CONSTRAINT ck_mensajes_entrantes_con_id CHECK (direccion = 'OUT' OR wa_message_id IS NOT NULL)
);

CREATE INDEX ix_mensajes_whatsapp_cliente ON mensajes_whatsapp (cliente_id, creado_en);

INSERT INTO public.pgmigrations (name, run_on) VALUES ('1793620804000_movimientos-pagos-mensajes', now());

-- ====================================================================================================
-- Migración 1793620805000_cobro-exacto-y-precios-por-madera
-- ====================================================================================================

-- 1. Cobro exacto (decisión del 2026-11-06): el total ya no se redondea a múltiplos de 100 Bs.
--    Se cobra el monto exacto, con centavos si los hay.
ALTER TABLE pedidos DROP CONSTRAINT ck_pedidos_redondeo_100;

-- Las cotizaciones aún sin pagar pasan al monto exacto, y sus QR pendientes vencen (cobraban el monto anterior).
-- Los pedidos ya pagados conservan el total que efectivamente se cobró.
UPDATE pagos_qr SET estado = 'EXPIRADO'
WHERE estado = 'PENDIENTE'
  AND pedido_id IN (SELECT id FROM pedidos WHERE total_final <> total_exacto);

UPDATE pedidos SET total_final = total_exacto
WHERE total_final <> total_exacto
  AND estado_id IN (SELECT id FROM estados_pedido WHERE codigo IN ('COTIZADO', 'PENDIENTE_PAGO'));

-- 2. El precio por m² depende del tipo de portón Y de la madera que elige el cliente.
CREATE TABLE precios_porton (
  producto_id     INTEGER        NOT NULL REFERENCES productos (id),
  madera_id       INTEGER        NOT NULL REFERENCES inventario_madera (id),
  precio_m2       NUMERIC(12,2)  NOT NULL,
  creado_en       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ    NOT NULL DEFAULT now(),
  PRIMARY KEY (producto_id, madera_id),
  CONSTRAINT ck_precios_porton_precio CHECK (precio_m2 > 0)
);

CREATE INDEX ix_precios_porton_madera ON precios_porton (madera_id);

CREATE TRIGGER trg_precios_porton_actualizado_en BEFORE UPDATE ON precios_porton
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- Los precios vigentes (uno por producto, para la madera fija del producto) pasan a la tabla nueva.
INSERT INTO precios_porton (producto_id, madera_id, precio_m2)
SELECT id, madera_id, precio_m2
FROM productos
WHERE modo_precio = 'POR_M2' AND madera_id IS NOT NULL AND precio_m2 IS NOT NULL;

-- El producto ya no tiene precio ni madera propios: los define precios_porton.
ALTER TABLE productos DROP CONSTRAINT ck_productos_modo_precio;
ALTER TABLE productos DROP COLUMN precio_m2, DROP COLUMN madera_id;
ALTER TABLE productos ADD CONSTRAINT ck_productos_modo_precio CHECK (
  (modo_precio = 'POR_M2' AND tipo_porton IS NOT NULL AND precio_fijo IS NULL)
  OR
  (modo_precio = 'FIJO' AND tipo_porton IS NULL AND precio_fijo IS NOT NULL AND precio_fijo > 0)
);

INSERT INTO public.pgmigrations (name, run_on) VALUES ('1793620805000_cobro-exacto-y-precios-por-madera', now());

-- ====================================================================================================
-- Migración 1793620806000_logistica-y-trazabilidad
-- ====================================================================================================

-- 1. Estado operativo: tras la fase 10 (control de calidad y despacho) el pedido sale "en ruta" hacia la
--    instalación (fase 11), y al cerrarla queda entregado e instalado.
INSERT INTO estados_pedido (codigo, nombre, descripcion)
VALUES ('EN_RUTA', 'En ruta / instalación', 'Despachado del taller; en camino o en instalación (fase 11).')
ON CONFLICT (codigo) DO NOTHING;

UPDATE estados_pedido
SET nombre = 'Entregado / instalado', descripcion = 'Fase 11 (instalación) completada.'
WHERE codigo = 'ENTREGADO';

-- 2. Calendario logístico: fecha en que se instalará el portón.
ALTER TABLE pedidos ADD COLUMN fecha_instalacion DATE;
CREATE INDEX ix_pedidos_fecha_instalacion ON pedidos (fecha_instalacion) WHERE fecha_instalacion IS NOT NULL;

-- 3. Trazabilidad: historial inmutable de cada cambio de estado o de fase de un pedido.
CREATE TABLE historial_pedido (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id           INTEGER      NOT NULL REFERENCES pedidos (id),
  estado_anterior_id  INTEGER      REFERENCES estados_pedido (id),
  estado_nuevo_id     INTEGER      NOT NULL REFERENCES estados_pedido (id),
  fase_anterior_id    INTEGER      REFERENCES fases_produccion (id),
  fase_nueva_id       INTEGER      REFERENCES fases_produccion (id),
  -- NULL cuando el cambio lo hizo el sistema (p. ej. el pago confirmado por la pasarela).
  usuario_id          INTEGER      REFERENCES usuarios (id),
  motivo              TEXT,
  -- clock_timestamp(): la hora exacta del cambio, no la del inicio de la transacción.
  creado_en           TIMESTAMPTZ  NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX ix_historial_pedido_pedido ON historial_pedido (pedido_id, id);

-- Inmutable: ni la API ni nadie con acceso a la BD puede corregir o borrar lo que ya pasó.
CREATE FUNCTION fn_historial_pedido_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'El historial de pedidos es inmutable: no se puede %.',
    CASE TG_OP WHEN 'UPDATE' THEN 'modificar un registro' ELSE 'borrar un registro' END
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER trg_historial_pedido_inmutable BEFORE UPDATE OR DELETE ON historial_pedido
  FOR EACH ROW EXECUTE FUNCTION fn_historial_pedido_inmutable();

-- Cada alta de pedido y cada cambio de estado o fase queda registrado, venga del código que venga.
-- Quién lo hizo y por qué llegan en variables de la transacción (set_config('machobol.usuario_id' / 'machobol.motivo')).
CREATE FUNCTION fn_registrar_historial_pedido() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.estado_id IS NOT DISTINCT FROM OLD.estado_id
     AND NEW.fase_actual_id IS NOT DISTINCT FROM OLD.fase_actual_id THEN
    RETURN NEW;
  END IF;
  INSERT INTO historial_pedido (pedido_id, estado_anterior_id, estado_nuevo_id, fase_anterior_id, fase_nueva_id, usuario_id, motivo)
  VALUES (
    NEW.id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.estado_id END,
    NEW.estado_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.fase_actual_id END,
    NEW.fase_actual_id,
    NULLIF(current_setting('machobol.usuario_id', true), '')::int,
    NULLIF(current_setting('machobol.motivo', true), '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pedidos_historial AFTER INSERT OR UPDATE OF estado_id, fase_actual_id ON pedidos
  FOR EACH ROW EXECUTE FUNCTION fn_registrar_historial_pedido();

-- Lo que ya registraba historial_fases pasa a la tabla nueva…
INSERT INTO historial_pedido (pedido_id, estado_nuevo_id, fase_nueva_id, usuario_id, motivo, creado_en)
SELECT h.pedido_id, (SELECT id FROM estados_pedido WHERE codigo = 'EN_PRODUCCION'), h.fase_id, h.usuario_id, h.observacion, h.creado_en
FROM historial_fases h
ORDER BY h.id;

-- …y los pedidos sin ningún registro reciben uno con su estado actual, para que todos tengan trazabilidad.
INSERT INTO historial_pedido (pedido_id, estado_nuevo_id, fase_nueva_id, motivo)
SELECT p.id, p.estado_id, p.fase_actual_id, 'Estado vigente al activar la trazabilidad'
FROM pedidos p
WHERE NOT EXISTS (SELECT 1 FROM historial_pedido h WHERE h.pedido_id = p.id)
ORDER BY p.id;

DROP TABLE historial_fases;

INSERT INTO public.pgmigrations (name, run_on) VALUES ('1793620806000_logistica-y-trazabilidad', now());

-- ====================================================================================================
-- Migración 1793620807000_proteger-api-de-supabase
-- ====================================================================================================

-- Supabase publica el esquema `public` por su API REST (PostgREST) a los roles `anon` y `authenticated`, que se
-- usan con la publishable key, una clave pensada para ir en el navegador. Este sistema no usa esa API: el backend
-- se conecta directo a PostgreSQL. Sin este bloqueo, cualquiera con la URL del proyecto y esa clave podría leer o
-- modificar las tablas (usuarios, clientes, pagos...).
--
-- 1) RLS activado en todas las tablas y sin políticas: `anon` y `authenticated` no ven ni tocan ninguna fila.
--    El dueño de las tablas (el rol con el que se conecta el backend) no está sujeto a RLS, así que la aplicación
--    funciona igual, también en el PostgreSQL local.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END
$$;

-- 2) Además se quitan los permisos de esos roles, también para las tablas que se creen en el futuro.
--    Solo en Supabase: en un PostgreSQL común esos roles no existen y este bloque no hace nada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
  END IF;
END
$$;

INSERT INTO public.pgmigrations (name, run_on) VALUES ('1793620807000_proteger-api-de-supabase', now());

-- ====================================================================================================
-- Datos base del sistema (equivalente a `npm run db:seed`, sin el usuario Administrador)
-- ====================================================================================================

INSERT INTO categorias_producto (nombre, descripcion) VALUES
  ('Portones', 'Portones de madera cotizados por m².'),
  ('Parques infantiles', 'Parques infantiles con precio fijo de catálogo.')
ON CONFLICT (nombre) DO NOTHING;

-- Madera de ejemplo (stock 0): el stock se carga desde el panel, registrando una troca en Inventario.
INSERT INTO inventario_madera (especie, espesor_pulg, stock_minimo_m2) VALUES ('Cedro', 1, 20)
ON CONFLICT (especie, espesor_pulg) DO NOTHING;

INSERT INTO productos (categoria_id, nombre, tipo_porton, modo_precio)
SELECT c.id, v.nombre, v.tipo::tipo_porton, 'POR_M2'
FROM categorias_producto c, (VALUES
  ('Portón Corredizo', 'CORREDIZO'),
  ('Portón Batiente', 'BATIENTE')
) AS v(nombre, tipo)
WHERE c.nombre = 'Portones'
ON CONFLICT (nombre) DO NOTHING;

-- Precios aprobados para Cedro 1″ (Bs/m²); los de otras maderas los fija el Admin en el panel.
INSERT INTO precios_porton (producto_id, madera_id, precio_m2)
SELECT p.id, m.id, v.precio
FROM (VALUES
  ('Portón Corredizo', 2470),
  ('Portón Batiente', 2500)
) AS v(nombre, precio)
JOIN productos p ON p.nombre = v.nombre
JOIN inventario_madera m ON m.especie = 'Cedro' AND m.espesor_pulg = 1
ON CONFLICT (producto_id, madera_id) DO NOTHING;

INSERT INTO accesorios (codigo, nombre, tipo_adicional, precio, tipo_porton_compatible)
SELECT codigo, nombre, tipo::tipo_adicional, precio, compatible::tipo_porton FROM (VALUES
  ('MOTOR_CORREDIZO', 'Motor para portón corredizo', 'ACCESORIO', 1740, 'CORREDIZO'),
  ('MOTOR_BATIENTE', 'Motor para portón batiente', 'ACCESORIO', 2088, 'BATIENTE'),
  ('PUERTA_INGRESO', 'Puerta de ingreso peatonal', 'ACCESORIO', 696, NULL),
  ('TRANSPORTE_VIATICOS', 'Transporte / viáticos (entrega fuera de la ciudad)', 'RECARGO', 150, NULL)
) AS v(codigo, nombre, tipo, precio, compatible)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO estados_pedido (codigo, nombre, descripcion) VALUES
  ('COTIZADO', 'Cotizado', 'Cotización emitida, aún sin solicitud de pago.'),
  ('PENDIENTE_PAGO', 'Pendiente de pago', 'QR generado, esperando la confirmación del banco.'),
  ('EN_PRODUCCION', 'En producción', 'Pago confirmado y madera descontada; avanza por las fases 1 a 10.'),
  ('EN_RUTA', 'En ruta / instalación', 'Despachado del taller; en camino o en instalación (fase 11).'),
  ('ENTREGADO', 'Entregado / instalado', 'Fase 11 (instalación) completada.'),
  ('CANCELADO', 'Cancelado', 'Pedido anulado.'),
  ('REVISION_STOCK', 'Revisión de stock', 'Pago recibido sin madera suficiente; requiere acción del Admin.')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO fases_produccion (orden, nombre) VALUES
  (1, 'Aserradero'),
  (2, 'Secado'),
  (3, 'Cepillado'),
  (4, 'Corte y dimensionado'),
  (5, 'Armado de estructura'),
  (6, 'Lijado'),
  (7, 'Tratamiento / inmunizado'),
  (8, 'Acabado (barniz / pintura)'),
  (9, 'Montaje de herrajes y accesorios'),
  (10, 'Control de calidad y despacho'),
  (11, 'Instalación')
ON CONFLICT (orden) DO NOTHING;

COMMIT;
