-- ====================================================================================================
-- MACHOBOL: verificación de la base en Supabase (SQL Editor)
--
-- Pegar y ejecutar justo después de machobol_supabase.sql. Cada fila debe terminar en ✅.
-- Si en vez de la tabla aparece el error "relation ... does not exist", el script no llegó a ejecutarse
-- (al fallar se deshace entero): vuelve a correrlo y revisa el mensaje en rojo.
-- La fila de usuarios pasa a 1 cuando `npm run db:seed` crea el Administrador; los datos del catálogo
-- cambian a medida que el Admin carga maderas y precios.
-- ====================================================================================================

WITH comprobaciones (orden, comprobacion, esperado, obtenido) AS (
  VALUES
    (1, 'Tablas en el esquema public', 16,
        (SELECT count(*) FROM pg_tables WHERE schemaname = 'public')),
    (2, 'Tablas protegidas con RLS', 16,
        (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity)),
    (3, 'Permisos de la API pública (anon / authenticated)', 0,
        (SELECT count(*)
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         CROSS JOIN LATERAL aclexplode(c.relacl) a
         WHERE n.nspname = 'public' AND c.relkind = 'r'
           AND a.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated')))),
    (4, 'Migraciones registradas', 8,
        (SELECT count(*) FROM public.pgmigrations)),
    (5, 'Tipos enumerados', 8,
        (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'public' AND t.typtype = 'e')),
    (6, 'Funciones de los triggers', 3,
        (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname LIKE 'fn\_%')),
    (7, 'Triggers', 13,
        (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND NOT t.tgisinternal)),
    (8,  'Categorías',                  2, (SELECT count(*) FROM public.categorias_producto)),
    (9,  'Productos (portones)',        2, (SELECT count(*) FROM public.productos)),
    (10, 'Maderas',                     1, (SELECT count(*) FROM public.inventario_madera)),
    (11, 'Precios por madera',          2, (SELECT count(*) FROM public.precios_porton)),
    (12, 'Accesorios y recargos',       4, (SELECT count(*) FROM public.accesorios)),
    (13, 'Estados del pedido',          7, (SELECT count(*) FROM public.estados_pedido)),
    (14, 'Fases de producción',        11, (SELECT count(*) FROM public.fases_produccion)),
    (15, 'Usuarios (0 hasta crear el Admin con db:seed)', 0, (SELECT count(*) FROM public.usuarios))
)
SELECT comprobacion AS "Comprobación",
       esperado     AS "Esperado",
       obtenido     AS "Obtenido",
       CASE WHEN obtenido = esperado THEN '✅' ELSE '❌' END AS "Resultado"
FROM comprobaciones
ORDER BY orden;
