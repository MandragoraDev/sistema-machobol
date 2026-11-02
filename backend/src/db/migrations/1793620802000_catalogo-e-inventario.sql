-- Up Migration

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

-- Down Migration

DROP TABLE accesorios;
DROP TABLE productos;
DROP TABLE inventario_madera;
DROP TABLE categorias_producto;
