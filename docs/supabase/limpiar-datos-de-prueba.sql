-- ====================================================================================================
-- MACHOBOL: borra el contenido de prueba antes de empezar a operar con clientes reales (SQL Editor de Supabase)
--
-- Ejecutar UNA sola vez, justo antes de la puesta en marcha. Borra TODOS los clientes, pedidos, pagos, mensajes,
-- historial y movimientos de inventario; quita la madera y los usuarios de prueba, y deja el stock en 0.
-- Conserva el catálogo, los precios del Cedro, los estados, las fases y el usuario Administrador.
--
-- El historial de pedidos no admite UPDATE ni DELETE (trigger fila por fila); TRUNCATE lo vacía entero, y solo puede
-- hacerlo el dueño de las tablas. Por eso esta limpieza es deliberada y se hace una única vez.
-- ====================================================================================================

BEGIN;

TRUNCATE historial_pedido, pagos_qr, pedido_accesorios, movimientos_inventario, mensajes_whatsapp, pedidos, clientes
  RESTART IDENTITY;

-- Madera de prueba (Tajibo, con precios inventados para probar la elección de madera).
DELETE FROM precios_porton WHERE madera_id IN (SELECT id FROM inventario_madera WHERE especie = 'Tajibo');
DELETE FROM inventario_madera WHERE especie = 'Tajibo';

-- El stock de prueba se descarta: el real se registra con las trocas que lleguen.
UPDATE inventario_madera SET stock_actual_m2 = 0;

-- Usuarios de prueba.
DELETE FROM usuarios WHERE email IN ('ventas.prueba@machobol.local', 'taller.prueba@machobol.local');

COMMIT;

-- Resultado: todo en 0, salvo el catálogo y el Administrador.
SELECT (SELECT count(*) FROM clientes)          AS clientes,
       (SELECT count(*) FROM pedidos)           AS pedidos,
       (SELECT count(*) FROM historial_pedido)  AS historial,
       (SELECT count(*) FROM pagos_qr)          AS pagos,
       (SELECT count(*) FROM mensajes_whatsapp) AS mensajes,
       (SELECT count(*) FROM inventario_madera) AS maderas,
       (SELECT sum(stock_actual_m2) FROM inventario_madera) AS stock_m2,
       (SELECT count(*) FROM usuarios)          AS usuarios;
