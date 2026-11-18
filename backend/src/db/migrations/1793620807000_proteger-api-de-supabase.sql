-- Up Migration

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

-- Down Migration

-- Solo se desactiva RLS. Los permisos de `anon` y `authenticated` no se devuelven a propósito:
-- volver a exponer la base por la API pública no es un estado al que convenga regresar.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END
$$;
