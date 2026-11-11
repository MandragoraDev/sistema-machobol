-- Up Migration

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

-- Down Migration

ALTER TABLE productos DROP CONSTRAINT ck_productos_modo_precio;
ALTER TABLE productos
  ADD COLUMN precio_m2 NUMERIC(12,2),
  ADD COLUMN madera_id INTEGER REFERENCES inventario_madera (id);

-- Cada producto recupera el precio de su primera madera.
UPDATE productos p
SET precio_m2 = pp.precio_m2, madera_id = pp.madera_id
FROM (
  SELECT DISTINCT ON (producto_id) producto_id, madera_id, precio_m2
  FROM precios_porton
  ORDER BY producto_id, madera_id
) pp
WHERE pp.producto_id = p.id;

ALTER TABLE productos ADD CONSTRAINT ck_productos_modo_precio CHECK (
  (modo_precio = 'POR_M2'
    AND tipo_porton IS NOT NULL
    AND precio_m2 IS NOT NULL AND precio_m2 > 0
    AND precio_fijo IS NULL)
  OR
  (modo_precio = 'FIJO'
    AND tipo_porton IS NULL
    AND precio_fijo IS NOT NULL AND precio_fijo > 0
    AND precio_m2 IS NULL)
);

DROP TABLE precios_porton;

-- NOT VALID: los pedidos cotizados con cobro exacto no cumplen la regla anterior.
ALTER TABLE pedidos ADD CONSTRAINT ck_pedidos_redondeo_100 CHECK (
  precio_m2_aplicado IS NULL OR total_final = round(total_exacto / 100) * 100
) NOT VALID;
