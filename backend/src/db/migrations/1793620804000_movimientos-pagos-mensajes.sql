-- Up Migration

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

-- Down Migration

DROP TABLE mensajes_whatsapp;
DROP TABLE pagos_qr;
DROP TABLE movimientos_inventario;
