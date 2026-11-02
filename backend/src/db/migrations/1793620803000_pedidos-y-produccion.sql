-- Up Migration

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

-- Down Migration

DROP TABLE historial_fases;
DROP TABLE pedido_accesorios;
DROP TABLE pedidos;
DROP TABLE fases_produccion;
DROP TABLE estados_pedido;
