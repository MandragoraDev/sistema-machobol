# Pruebas técnicas y de aceptación (UAT) — MACHOBOL

Guía para ejecutar las pruebas de aceptación de usuario y medir los tiempos de respuesta de la API.
Cada caso tiene pasos y un resultado esperado; quien prueba marca **✔** o **✘** y anota lo que observe.

## 1. Preparar el entorno

1. Servicios levantados (ver [README](../README.md)): API (`backend`, `npm run dev`), panel (`frontend`, `npm run dev`),
   y para los casos del asistente, Rasa y el servidor de acciones (`rasa_bot`).
2. Base de datos al día: `npm run db:migrate` en `backend`.
3. Usuarios: el Admin del seed, y desde **Usuarios** una cuenta de **Taller** y otra de **Ventas**.
4. Madera con precio y stock: en **Inventario → Editar madera**, precio por m² y una troca registrada.
5. Pedidos pagados para la logística: `npm run demo:pedidos` en `backend` crea 4 pedidos de demostración ya pagados,
   en distintas etapas (consume madera de verdad y no se pueden borrar: el historial es inmutable).

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
| UAT-08 | Asistente | Cliente | Continuar: elegir madera, accesorios y entrega | Cotización con el precio de la madera elegida y total exacto (sin redondeo); llega la proforma PDF | | |
| UAT-09 | Asistente | Cliente | Confirmar el pedido | Llega el QR por el total exacto, con su vencimiento | | |
| UAT-10 | Pagos | Cliente | En el simulador, escribir `/pagar` | "¡Pago recibido!"; el pedido aparece **En producción, fase 1** en Logística; el stock baja | | |
| UAT-11 | Pagos | Cliente | Repetir el pago del mismo QR (`npm run pagos:simular -- <código>`) | No hay QR vigente; el stock no vuelve a bajar | | |
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

Referencia (equipo de desarrollo, base de pruebas, 10 conexiones): todos los endpoints de lectura respondieron con
p97,5 de 2 a 10 ms, y el inicio de sesión, con unos 225 ms.

## 4. Registro

| Fecha | Quién probó | Versión (commit) | Casos ✔ | Casos ✘ | Observaciones |
|---|---|---|---|---|---|
| | | | | | |
