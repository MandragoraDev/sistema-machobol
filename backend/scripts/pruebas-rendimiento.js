/**
 * Pruebas técnicas de tiempos de respuesta de los endpoints principales (Sprint 5).
 * Carga cada endpoint con autocannon contra una API ya levantada y genera un informe en Markdown.
 * Solo usa endpoints de lectura o de cálculo: no crea pedidos, pagos ni mensajes.
 *
 *   npm run pruebas:rendimiento
 *   npm run pruebas:rendimiento -- --segundos 20 --conexiones 25 --umbral-ms 300
 *   npm run pruebas:rendimiento -- --url http://servidor:4000/api --email admin@… --password …
 *
 * Por defecto entra con ADMIN_EMAIL / ADMIN_PASSWORD de backend/.env.
 */
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const autocannon = require('autocannon');
const env = require('../src/config/env');

const { values: opciones } = parseArgs({
  options: {
    url: { type: 'string', default: `http://localhost:${env.port}/api` },
    email: { type: 'string', default: process.env.ADMIN_EMAIL },
    password: { type: 'string', default: process.env.ADMIN_PASSWORD },
    segundos: { type: 'string', default: '10' },
    conexiones: { type: 'string', default: '10' },
    'umbral-ms': { type: 'string', default: '500' },
  },
});

const DURACION = Number(opciones.segundos);
const CONEXIONES = Number(opciones.conexiones);
const UMBRAL_MS = Number(opciones['umbral-ms']);
const CARPETA_RESULTADOS = path.resolve(__dirname, '../pruebas/resultados');

async function json(ruta, { method = 'GET', body, token } = {}) {
  const respuesta = await fetch(`${opciones.url}${ruta}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  if (!respuesta.ok) throw new Error(`${method} ${ruta} respondió ${respuesta.status}: ${await respuesta.text()}`);
  return respuesta.json();
}

function cargar({ titulo, ruta, method = 'GET', body, headers = {}, conexiones = CONEXIONES, umbralMs = UMBRAL_MS }) {
  return new Promise((resolver, rechazar) => {
    autocannon(
      {
        url: `${opciones.url}${ruta}`,
        method,
        connections: conexiones,
        duration: DURACION,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body && JSON.stringify(body),
      },
      (err, r) => (err ? rechazar(err) : resolver({ titulo, metodo: method, ruta, conexiones, umbralMs, r })),
    );
  });
}

function fila({ titulo, metodo, ruta, conexiones, umbralMs, r }) {
  const fallidas = r.errors + r.timeouts + r.non2xx;
  const cumple = fallidas === 0 && r.latency.p97_5 <= umbralMs;
  return {
    cumple,
    texto: `| ${titulo} | \`${metodo} ${ruta}\` | ${conexiones} | ${r.requests.total} | ${r.requests.average.toFixed(0)} | ${r.latency.p50} | ${r.latency.p90} | ${r.latency.p97_5} | ${r.latency.p99} | ${r.latency.max} | ${fallidas} | ${umbralMs} | ${cumple ? '✅' : '❌'} |`,
  };
}

async function main() {
  if (!opciones.email || !opciones.password) {
    throw new Error('Falta el usuario: define ADMIN_EMAIL y ADMIN_PASSWORD en backend/.env o usa --email y --password.');
  }
  console.log(`API: ${opciones.url} · ${DURACION} s por endpoint · ${CONEXIONES} conexiones simultáneas · umbral p97,5 ≤ ${UMBRAL_MS} ms\n`);

  const { token } = await json('/auth/login', { method: 'POST', body: { email: opciones.email, password: opciones.password } });
  const conJwt = { Authorization: `Bearer ${token}` };

  // Datos reales para los endpoints que los necesitan (sin crear nada).
  const maderas = await json('/cotizaciones/maderas?tipo_porton=CORREDIZO', { token });
  const { pedidos } = await json('/logistica/tablero', { token });

  const casos = [
    { titulo: 'Salud de la API y la BD', ruta: '/health' },
    // bcrypt (costo 12) es lento a propósito: se mide con menos concurrencia y un umbral propio.
    { titulo: 'Inicio de sesión', ruta: '/auth/login', method: 'POST', body: { email: opciones.email, password: opciones.password }, conexiones: 2, umbralMs: 1500 },
    { titulo: 'Inventario de madera', ruta: '/inventario', headers: conJwt },
    { titulo: 'Tablero logístico', ruta: '/logistica/tablero', headers: conJwt },
    { titulo: 'Catálogo para el bot', ruta: '/internal/catalogo', headers: { 'X-Service-Token': env.serviceToken } },
  ];
  if (maderas.length > 0) {
    casos.push({
      titulo: 'Cotización (cálculo)',
      ruta: '/cotizaciones/calcular',
      method: 'POST',
      headers: conJwt,
      body: { tipo_porton: 'CORREDIZO', madera_id: maderas[0].id, ancho_m: 4, alto_m: 2.2, accesorios: ['MOTOR_CORREDIZO'], fuera_ciudad: true },
    });
  } else {
    console.log('(Se omite la cotización: ninguna madera tiene precio para portón corredizo.)');
  }
  if (pedidos.length > 0) {
    casos.push({ titulo: 'Detalle e historial de un pedido', ruta: `/logistica/pedidos/${pedidos[0].codigo}`, headers: conJwt });
  } else {
    console.log('(Se omite el detalle de pedido: el tablero logístico está vacío.)');
  }

  const resultados = [];
  for (const caso of casos) {
    process.stdout.write(`Midiendo ${caso.titulo}… `);
    const resultado = await cargar(caso);
    resultados.push(resultado);
    console.log(`p50 ${resultado.r.latency.p50} ms · p97,5 ${resultado.r.latency.p97_5} ms · ${resultado.r.requests.average.toFixed(0)} req/s`);
  }

  const filas = resultados.map(fila);
  const fecha = new Date();
  const informe = [
    `# Tiempos de respuesta — ${fecha.toLocaleString('es-BO')}`,
    '',
    `API: ${opciones.url} · ${DURACION} s por endpoint · Node ${process.version} · ${process.platform}`,
    '',
    'Latencias en milisegundos. Un endpoint **cumple** si no hubo errores y su p97,5 está dentro del umbral.',
    '',
    '| Endpoint | Ruta | Conexiones | Peticiones | Req/s | p50 | p90 | p97,5 | p99 | Máx | Fallidas | Umbral | Cumple |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...filas.map((f) => f.texto),
    '',
    `Resultado: **${filas.every((f) => f.cumple) ? 'todos los endpoints cumplen' : `${filas.filter((f) => !f.cumple).length} endpoint(s) no cumplen`}**.`,
    '',
  ].join('\n');

  fs.mkdirSync(CARPETA_RESULTADOS, { recursive: true });
  const dos = (n) => String(n).padStart(2, '0');
  const sello = `${fecha.getFullYear()}${dos(fecha.getMonth() + 1)}${dos(fecha.getDate())}-${dos(fecha.getHours())}${dos(fecha.getMinutes())}`;
  const archivo = path.join(CARPETA_RESULTADOS, `rendimiento-${sello}.md`);
  fs.writeFileSync(archivo, informe);
  console.log(`\n${informe}\nInforme guardado en ${archivo}`);
  process.exitCode = filas.every((f) => f.cumple) ? 0 : 1;
}

main().catch((err) => {
  console.error(err.cause?.code === 'ECONNREFUSED' ? `La API no responde en ${opciones.url}. ¿Está levantada (npm run dev)?` : err.message);
  process.exitCode = 1;
});
