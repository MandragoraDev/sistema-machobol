-- Up Migration

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

-- Down Migration

DROP FUNCTION fn_set_actualizado_en();

DROP TYPE direccion_mensaje;
DROP TYPE estado_pago;
DROP TYPE canal_pedido;
DROP TYPE tipo_movimiento;
DROP TYPE tipo_adicional;
DROP TYPE modo_precio;
DROP TYPE tipo_porton;
DROP TYPE rol_usuario;
