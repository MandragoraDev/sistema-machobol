-- Up Migration

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

-- Down Migration

CREATE TABLE historial_fases (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id    INTEGER      NOT NULL REFERENCES pedidos (id),
  fase_id      INTEGER      NOT NULL REFERENCES fases_produccion (id),
  usuario_id   INTEGER      REFERENCES usuarios (id),
  observacion  TEXT,
  creado_en    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_historial_fases_pedido ON historial_fases (pedido_id, creado_en);

INSERT INTO historial_fases (pedido_id, fase_id, usuario_id, observacion, creado_en)
SELECT pedido_id, fase_nueva_id, usuario_id, motivo, creado_en
FROM historial_pedido
WHERE fase_nueva_id IS NOT NULL AND fase_nueva_id IS DISTINCT FROM fase_anterior_id
ORDER BY id;

DROP TRIGGER trg_pedidos_historial ON pedidos;
DROP FUNCTION fn_registrar_historial_pedido();
DROP TABLE historial_pedido;
DROP FUNCTION fn_historial_pedido_inmutable();

DROP INDEX ix_pedidos_fecha_instalacion;
ALTER TABLE pedidos DROP COLUMN fecha_instalacion;

UPDATE estados_pedido SET nombre = 'Entregado', descripcion = 'Fase 11 (Instalación) completada.' WHERE codigo = 'ENTREGADO';
-- Falla a propósito si algún pedido quedó EN_RUTA: hay que moverlo antes de revertir.
DELETE FROM estados_pedido WHERE codigo = 'EN_RUTA';
