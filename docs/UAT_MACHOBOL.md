# Pruebas técnicas y de aceptación (UAT) — MACHOBOL

Guía para ejecutar las pruebas de aceptación de usuario y medir los tiempos de respuesta de la API.
Cada caso tiene pasos y un resultado esperado; quien prueba marca **✔** o **✘** y anota lo que observe.

## 1. Preparar el entorno

1. Servicios levantados (ver [README](../README.md)): API (`backend`, `npm run dev`), panel (`frontend`, `npm run dev`),
   y para los casos del asistente, Rasa y el servidor de acciones (`rasa_bot`).
2. Base de datos al día: `npm run db:migrate` en `backend`.
3. Usuarios: el Admin del seed, y desde **Usuarios** una cuenta de **Taller** y otra de **Ventas**.
4. Madera con precio y stock: en **Inventario → Editar madera**, precio por m² y una troca registrada.
5. Pedidos de demostración: `npm run demo:pedidos` en `backend` crea 2 en etapa de venta y 4 con anticipo, en distintas
   etapas (consume madera de verdad y no se pueden borrar: el historial es inmutable).
6. En **Configuración**, el WhatsApp del encargado (para ver los avisos). En modo simulado quedan en el log de la API.

## 2. Casos de prueba

| ID | Módulo | Rol | Pasos | Resultado esperado | ✔ / ✘ | Observaciones |
|---|---|---|---|---|---|---|
| UAT-01 | Acceso | Todos | Abrir http://localhost:5173 sin sesión | Lleva al login; no se ve el menú | | |
| UAT-02 | Acceso | Admin | Entrar con una contraseña incorrecta | "Correo o contraseña incorrectos." y no entra | | |
| UAT-03 | Acceso | Taller / Ventas | Entrar con cada cuenta | Cada rol ve su menú y su Dashboard; Ventas y Taller no ven **Usuarios** | | |
| UAT-04 | Inventario | Admin / Taller | Registrar una troca de 10 piezas de 8″ × 10′ | Antes de guardar muestra 6,1935 m²; el stock sube eso mismo | | |
| UAT-05 | Inventario | Admin | Ajuste que dejaría el stock en negativo | El sistema no lo permite y el stock no cambia | | |
| UAT-06 | Catálogo | Admin | Editar una madera y fijar su precio de portón corredizo | La tabla muestra el precio; la madera se ofrece en el bot | | |
| UAT-07 | Asistente | Cliente | `npm run whatsapp:simular` → "quiero un portón corredizo de 4 por 2,20" | El bot confirma 4,00 × 2,20 m (8,80 m²) | | |
| UAT-08 | Asistente | Cliente | Continuar: elegir madera, accesorios y entrega | Cotización con **total referencial** de la madera elegida; llega la proforma PDF; nunca aparece un QR | | |
| UAT-09 | Asistente | Cliente | Responder "sí" a agendar la reunión y dar un horario | "Registramos su solicitud de reunión…"; el pedido aparece en **Ventas** como reunión solicitada | | |
| UAT-10 | Ventas | Ventas / Admin | Agendar la reunión en la ficha; luego, como Admin, registrar el precio acordado | El cliente recibe la fecha; el cambio de precio queda en el historial con el anterior | | |
| UAT-11 | Pagos | Admin | Pulsar **Iniciar producción** con menos del 50 % pagado; registrar el anticipo y repetir | Sin anticipo no se puede; con él, pasa a **En producción, fase 1** y el stock baja una sola vez | | |
| UAT-21 | Asistente | Cliente | Preguntar "¿dónde están?" y "¿aceptan cheque?" | Dirección con el mapa, y formas de pago con el anticipo; sin ningún cobro | | |
| UAT-22 | Asistente | Cliente | Preguntar "¿cómo va mi pedido?" | Estado, etapa y saldo reales de sus pedidos (nunca los de otro cliente) | | |
| UAT-23 | Pagos | Admin | Avanzar a **Entregado** un pedido con saldo; registrar el saldo y repetir | Con saldo no se cierra; con todo pagado queda entregado | | |
| UAT-12 | Logística | Admin / Taller | Abrir **Logística y trazabilidad** | Tablero con los pedidos pagados por etapa; la vista Calendario los ordena por fecha de instalación | | |
| UAT-13 | Logística | Taller | Abrir un pedido en fase 1, escribir una observación y **Avanzar** | Pasa a la fase 2; el historial muestra fecha y hora exactas, el usuario y la observación | | |
| UAT-14 | Logística | Taller | Avanzar un pedido que está en la fase 10 | Pasa a **En ruta / instalación** (fase 11); el cliente recibe el aviso por WhatsApp | | |
| UAT-15 | Logística | Admin | Avanzar un pedido en ruta | Queda **Entregado / instalado**; ya no se puede avanzar | | |
| UAT-16 | Logística | Admin | Retroceder un pedido sin motivo, y luego con motivo | Sin motivo no se puede; con motivo vuelve un paso y el motivo queda en el historial | | |
| UAT-17 | Logística | Taller / Ventas | Abrir un pedido | Taller no ve "Retroceder"; Ventas solo consulta (sin acciones) | | |
| UAT-18 | Logística | Admin / Taller | Programar la fecha de instalación | La fecha aparece en la tarjeta y ordena el calendario; no acepta fechas pasadas | | |
| UAT-19 | Trazabilidad | Admin | Abrir un pedido con la ficha en dos pestañas; avanzar en una y luego en la otra | La segunda se rechaza ("cambió mientras lo veías"): nunca se saltan fases | | |
| UAT-20 | Trazabilidad | Técnico | En PostgreSQL: `UPDATE historial_pedido SET motivo = 'x';` | Error: "El historial de pedidos es inmutable" | | |

## 3. Tiempos de respuesta

Con la API levantada, en `backend`:

```bash
npm run pruebas:rendimiento                                           # 10 s por endpoint, 10 conexiones simultáneas
npm run pruebas:rendimiento -- --segundos 30 --conexiones 50 --umbral-ms 300
```

Carga cada endpoint principal con [autocannon](https://github.com/mcollina/autocannon): salud, inicio de sesión,
inventario, tablero logístico, catálogo del bot, cálculo de cotización y detalle de un pedido con su historial.
Solo usa endpoints de lectura o de cálculo: no crea pedidos, pagos ni mensajes.

- **Métricas:** peticiones por segundo y latencias p50, p90, p97,5, p99 y máxima, en milisegundos.
- **Criterio de aceptación:** sin errores y **p97,5 ≤ 500 ms** (configurable con `--umbral-ms`). El inicio de sesión tiene su
  propio umbral de 1.500 ms y se mide con 2 conexiones: bcrypt es lento a propósito, para dificultar ataques de fuerza bruta.
- **Informe:** se imprime en la consola y se guarda en `backend/pruebas/resultados/rendimiento-AAAAMMDD-HHMM.md`
  (fuera de git; copia los que sirvan como evidencia). El comando termina con error si algún endpoint no cumple.
- **En uso real:** cada petición queda en el log de la API con su `responseTime` (ms).

Referencias (10 conexiones):
- Base de pruebas local: endpoints de lectura con p97,5 de 2 a 10 ms; inicio de sesión ≈ 225 ms.
- Base en Supabase São Paulo con la API en el equipo local (2026-11-18): cada consulta ≈ 106 ms de ida y vuelta;
  p50 entre 103 y 412 ms. Con la API desplegada junto a la base (Sprint 6, parte B) se espera ≈ 1–2 ms por consulta.

## 4. Registro

| Fecha | Quién probó | Versión (commit) | Casos ✔ | Casos ✘ | Observaciones |
|---|---|---|---|---|---|
| | | | | | |
