-- Up Migration

-- Sprint 6 (decisión del 2026-11-25): el bot no cobra. Cotiza un precio referencial y agenda una reunión con un asesor;
-- el precio final y los pagos se acuerdan en persona, y la fabricación empieza con un anticipo (50 %, editable).

-- 1. Estados de la venta. PENDIENTE_PAGO (esperaba el QR de la pasarela) deja de usarse; se conserva porque el
--    historial inmutable lo menciona.
INSERT INTO estados_pedido (codigo, nombre, descripcion) VALUES
  ('REUNION_SOLICITADA', 'Reunión solicitada', 'El cliente aceptó la cotización y pidió una reunión con un asesor.'),
  ('REUNION_AGENDADA', 'Reunión agendada', 'El asesor fijó la reunión para acordar el precio final y los pagos.')
ON CONFLICT (codigo) DO NOTHING;
UPDATE estados_pedido SET descripcion = 'Ya no se usa: esperaba el pago del QR de la pasarela (hasta el Sprint 5).'
WHERE codigo = 'PENDIENTE_PAGO';
UPDATE estados_pedido SET descripcion = 'Anticipo recibido, pero sin madera suficiente para iniciar la producción.'
WHERE codigo = 'REVISION_STOCK';

-- Los pedidos que esperaban el QR vuelven a cotizados (el trigger lo deja en el historial con este motivo).
SELECT set_config('machobol.usuario_id', '', true),
       set_config('machobol.motivo', 'Cambio del proceso de venta: el cobro QR se reemplaza por la reunión con un asesor', true);
UPDATE pedidos SET estado_id = (SELECT id FROM estados_pedido WHERE codigo = 'COTIZADO')
WHERE estado_id = (SELECT id FROM estados_pedido WHERE codigo = 'PENDIENTE_PAGO');
SELECT set_config('machobol.motivo', '', true);

-- 2. Pagos registrados a mano por el Admin (reemplazan a pagos_qr). Un pago no se borra ni se edita: se anula.
CREATE TYPE metodo_pago AS ENUM ('QR', 'EFECTIVO', 'TRANSFERENCIA', 'CHEQUE');

CREATE TABLE pagos (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id         INTEGER       NOT NULL REFERENCES pedidos (id),
  monto             NUMERIC(12,2) NOT NULL,
  metodo            metodo_pago   NOT NULL,
  -- Número de cheque, de transacción o de comprobante.
  referencia        VARCHAR(80),
  observacion       TEXT,
  -- NULL en los pagos que llegaron por la pasarela QR (hasta el Sprint 5).
  registrado_por    INTEGER       REFERENCES usuarios (id),
  anulado_en        TIMESTAMPTZ,
  anulado_por       INTEGER       REFERENCES usuarios (id),
  motivo_anulacion  TEXT,
  creado_en         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_pagos_monto CHECK (monto > 0),
  CONSTRAINT ck_pagos_anulacion_completa CHECK (
    (anulado_en IS NULL AND anulado_por IS NULL AND motivo_anulacion IS NULL)
    OR (anulado_en IS NOT NULL AND motivo_anulacion IS NOT NULL AND length(btrim(motivo_anulacion)) > 0)
  )
);

CREATE INDEX ix_pagos_pedido ON pagos (pedido_id);
CREATE INDEX ix_pagos_creado_en ON pagos (creado_en) WHERE anulado_en IS NULL;

CREATE FUNCTION fn_pagos_solo_anulacion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un pago no se borra: se anula con un motivo.' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.anulado_en IS NOT NULL
     OR (NEW.pedido_id, NEW.monto, NEW.metodo, NEW.referencia, NEW.observacion, NEW.registrado_por, NEW.creado_en)
        IS DISTINCT FROM
        (OLD.pedido_id, OLD.monto, OLD.metodo, OLD.referencia, OLD.observacion, OLD.registrado_por, OLD.creado_en) THEN
    RAISE EXCEPTION 'Un pago registrado no se modifica: solo se puede anular, una vez.' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pagos_solo_anulacion BEFORE UPDATE OR DELETE ON pagos
  FOR EACH ROW EXECUTE FUNCTION fn_pagos_solo_anulacion();

-- El dinero que ya entró por la pasarela pasa a la tabla nueva; los QR pendientes, vencidos o fallidos no eran pagos.
INSERT INTO pagos (pedido_id, monto, metodo, referencia, observacion, creado_en)
SELECT pedido_id, monto, 'QR', transaccion_id, 'Pago por la pasarela QR (hasta el Sprint 5)', COALESCE(confirmado_en, actualizado_en)
FROM pagos_qr
WHERE estado IN ('CONFIRMADO', 'REVISION')
ORDER BY id;

DROP TABLE pagos_qr;
DROP TYPE estado_pago;

-- 3. Datos del negocio que responde el bot y número del encargado que recibe los avisos (una sola fila, la carga el seed).
CREATE TABLE configuracion_negocio (
  id                  SMALLINT      PRIMARY KEY DEFAULT 1,
  ciudad              VARCHAR(80)   NOT NULL,
  direccion           TEXT          NOT NULL,
  maps_url            VARCHAR(300),
  horarios            TEXT          NOT NULL,
  formas_pago         TEXT          NOT NULL,
  tiempo_fabricacion  TEXT          NOT NULL,
  cobertura           TEXT          NOT NULL,
  -- Porcentaje del precio acordado que debe estar pagado para iniciar la producción.
  anticipo_pct        NUMERIC(5,2)  NOT NULL DEFAULT 50,
  -- WhatsApp del encargado (solo dígitos, con código de país) que recibe los avisos de madera y de reuniones.
  whatsapp_avisos     VARCHAR(15),
  actualizado_por     INTEGER       REFERENCES usuarios (id),
  creado_en           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  actualizado_en      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_configuracion_negocio_unica CHECK (id = 1),
  CONSTRAINT ck_configuracion_negocio_anticipo CHECK (anticipo_pct > 0 AND anticipo_pct <= 100),
  CONSTRAINT ck_configuracion_negocio_whatsapp CHECK (whatsapp_avisos ~ '^[0-9]{8,15}$')
);

CREATE TRIGGER trg_configuracion_negocio_actualizado_en BEFORE UPDATE ON configuracion_negocio
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- 4. Pedido: reunión con el asesor y traslado. total_final pasa a ser el precio final acordado (nace igual al referencial).
ALTER TABLE pedidos
  ADD COLUMN fecha_reunion        TIMESTAMPTZ,
  ADD COLUMN preferencia_reunion  TEXT,
  -- Instalación a 45 minutos o más de la ciudad: el adicional por el traslado se acuerda en la reunión.
  ADD COLUMN fuera_ciudad         BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX ix_pedidos_fecha_reunion ON pedidos (fecha_reunion) WHERE fecha_reunion IS NOT NULL;

UPDATE pedidos p SET fuera_ciudad = true
WHERE EXISTS (
  SELECT 1 FROM pedido_accesorios pa JOIN accesorios a ON a.id = pa.accesorio_id
  WHERE pa.pedido_id = p.id AND a.codigo = 'TRANSPORTE_VIATICOS'
);

-- 5. El recargo fijo de 150 Bs por transporte se retira (las cotizaciones anteriores lo conservan).
UPDATE accesorios SET activo = false WHERE codigo = 'TRANSPORTE_VIATICOS';

-- 6. El historial registra también los cambios del precio acordado, con su motivo.
ALTER TABLE historial_pedido
  ADD COLUMN total_anterior  NUMERIC(12,2),
  ADD COLUMN total_nuevo     NUMERIC(12,2);

CREATE OR REPLACE FUNCTION fn_registrar_historial_pedido() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  cambio_total boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    cambio_total := NEW.total_final IS DISTINCT FROM OLD.total_final;
    IF NEW.estado_id IS NOT DISTINCT FROM OLD.estado_id
       AND NEW.fase_actual_id IS NOT DISTINCT FROM OLD.fase_actual_id
       AND NOT cambio_total THEN
      RETURN NEW;
    END IF;
  END IF;
  INSERT INTO historial_pedido (pedido_id, estado_anterior_id, estado_nuevo_id, fase_anterior_id, fase_nueva_id,
                                total_anterior, total_nuevo, usuario_id, motivo)
  VALUES (
    NEW.id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.estado_id END,
    NEW.estado_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.fase_actual_id END,
    NEW.fase_actual_id,
    CASE WHEN cambio_total THEN OLD.total_final END,
    CASE WHEN cambio_total THEN NEW.total_final END,
    NULLIF(current_setting('machobol.usuario_id', true), '')::int,
    NULLIF(current_setting('machobol.motivo', true), '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER trg_pedidos_historial ON pedidos;
CREATE TRIGGER trg_pedidos_historial AFTER INSERT OR UPDATE OF estado_id, fase_actual_id, total_final ON pedidos
  FOR EACH ROW EXECUTE FUNCTION fn_registrar_historial_pedido();

-- 7. Las tablas nuevas, protegidas como las demás frente a la API pública de Supabase (ver 1793620807000).
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion_negocio ENABLE ROW LEVEL SECURITY;

-- Down Migration

-- Se recupera la estructura anterior. Los pagos registrados a mano no vuelven a pagos_qr (no eran cobros QR), y los
-- estados de la reunión se conservan porque el historial inmutable los menciona.
CREATE OR REPLACE FUNCTION fn_registrar_historial_pedido() RETURNS trigger
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

DROP TRIGGER trg_pedidos_historial ON pedidos;
CREATE TRIGGER trg_pedidos_historial AFTER INSERT OR UPDATE OF estado_id, fase_actual_id ON pedidos
  FOR EACH ROW EXECUTE FUNCTION fn_registrar_historial_pedido();

ALTER TABLE historial_pedido DROP COLUMN total_anterior, DROP COLUMN total_nuevo;

UPDATE accesorios SET activo = true WHERE codigo = 'TRANSPORTE_VIATICOS';

UPDATE pedidos SET estado_id = (SELECT id FROM estados_pedido WHERE codigo = 'COTIZADO')
WHERE estado_id IN (SELECT id FROM estados_pedido WHERE codigo IN ('REUNION_SOLICITADA', 'REUNION_AGENDADA'));
DROP INDEX ix_pedidos_fecha_reunion;
ALTER TABLE pedidos DROP COLUMN fecha_reunion, DROP COLUMN preferencia_reunion, DROP COLUMN fuera_ciudad;

DROP TABLE configuracion_negocio;

CREATE TYPE estado_pago AS ENUM ('PENDIENTE', 'CONFIRMADO', 'EXPIRADO', 'FALLIDO', 'REVISION');
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
CREATE UNIQUE INDEX ux_pagos_qr_confirmado_por_pedido ON pagos_qr (pedido_id) WHERE estado = 'CONFIRMADO';
CREATE TRIGGER trg_pagos_qr_actualizado_en BEFORE UPDATE ON pagos_qr
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();
ALTER TABLE pagos_qr ENABLE ROW LEVEL SECURITY;

DROP TABLE pagos;
DROP FUNCTION fn_pagos_solo_anulacion();
DROP TYPE metodo_pago;
