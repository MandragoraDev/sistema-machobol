-- Up Migration

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

-- Down Migration

DROP TABLE clientes;
DROP TABLE usuarios;
