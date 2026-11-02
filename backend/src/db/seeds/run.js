/**
 * Carga los datos base del sistema. Es idempotente: se puede ejecutar varias veces
 * y nunca sobrescribe lo que el Admin haya editado (ON CONFLICT DO NOTHING).
 * Todo corre en una sola transacción: o se cargan todos los datos o ninguno.
 */
const bcrypt = require('bcrypt');
const { pool, withTransaction } = require('../../config/db');

const BCRYPT_COSTO = 12;

const CATEGORIAS = [
  { nombre: 'Portones', descripcion: 'Portones de madera cotizados por m².' },
  { nombre: 'Parques infantiles', descripcion: 'Parques infantiles con precio fijo de catálogo.' },
];

// Madera de ejemplo para poder probar el sistema; reemplázala por las especies reales del aserradero.
const MADERA_EJEMPLO = { especie: 'Cedro', espesor_pulg: 1, stock_minimo_m2: 20 };

// Precios aprobados por gerencia (reglas de negocio, en Bs).
const PORTONES = [
  { nombre: 'Portón Corredizo', tipo_porton: 'CORREDIZO', precio_m2: 2470 },
  { nombre: 'Portón Batiente', tipo_porton: 'BATIENTE', precio_m2: 2500 },
];

const ACCESORIOS = [
  { codigo: 'MOTOR_CORREDIZO', nombre: 'Motor para portón corredizo', tipo_adicional: 'ACCESORIO', precio: 1740, tipo_porton_compatible: 'CORREDIZO' },
  { codigo: 'MOTOR_BATIENTE', nombre: 'Motor para portón batiente', tipo_adicional: 'ACCESORIO', precio: 2088, tipo_porton_compatible: 'BATIENTE' },
  { codigo: 'PUERTA_INGRESO', nombre: 'Puerta de ingreso peatonal', tipo_adicional: 'ACCESORIO', precio: 696, tipo_porton_compatible: null },
  // Solo se aplica si la dirección de entrega está fuera de la ciudad (a más de 45 min).
  { codigo: 'TRANSPORTE_VIATICOS', nombre: 'Transporte / viáticos (entrega fuera de la ciudad)', tipo_adicional: 'RECARGO', precio: 150, tipo_porton_compatible: null },
];

const ESTADOS_PEDIDO = [
  { codigo: 'COTIZADO', nombre: 'Cotizado', descripcion: 'Cotización emitida, aún sin solicitud de pago.' },
  { codigo: 'PENDIENTE_PAGO', nombre: 'Pendiente de pago', descripcion: 'QR generado, esperando la confirmación del banco.' },
  { codigo: 'EN_PRODUCCION', nombre: 'En producción', descripcion: 'Pago confirmado y madera descontada; avanza por las 11 fases.' },
  { codigo: 'ENTREGADO', nombre: 'Entregado', descripcion: 'Fase 11 (Instalación) completada.' },
  { codigo: 'CANCELADO', nombre: 'Cancelado', descripcion: 'Pedido anulado.' },
  { codigo: 'REVISION_STOCK', nombre: 'Revisión de stock', descripcion: 'Pago recibido sin madera suficiente; requiere acción del Admin.' },
];

// Las 11 fases definitivas de producción, en orden estricto (PLAN §2.4).
const FASES = [
  'Aserradero',
  'Secado',
  'Cepillado',
  'Corte y dimensionado',
  'Armado de estructura',
  'Lijado',
  'Tratamiento / inmunizado',
  'Acabado (barniz / pintura)',
  'Montaje de herrajes y accesorios',
  'Control de calidad y despacho',
  'Instalación',
];

function leerAdmin() {
  const nombre = process.env.ADMIN_NOMBRE || 'Administrador';
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || password.length < 8) {
    throw new Error('Define ADMIN_EMAIL y ADMIN_PASSWORD (mínimo 8 caracteres) en el .env antes de ejecutar el seed.');
  }
  return { nombre, email, password };
}

async function sembrar(client, admin) {
  for (const c of CATEGORIAS) {
    await client.query(
      `INSERT INTO categorias_producto (nombre, descripcion) VALUES ($1, $2)
       ON CONFLICT (nombre) DO NOTHING`,
      [c.nombre, c.descripcion],
    );
  }

  await client.query(
    `INSERT INTO inventario_madera (especie, espesor_pulg, stock_minimo_m2) VALUES ($1, $2, $3)
     ON CONFLICT (especie, espesor_pulg) DO NOTHING`,
    [MADERA_EJEMPLO.especie, MADERA_EJEMPLO.espesor_pulg, MADERA_EJEMPLO.stock_minimo_m2],
  );

  for (const p of PORTONES) {
    await client.query(
      `INSERT INTO productos (categoria_id, nombre, tipo_porton, modo_precio, precio_m2, madera_id)
       SELECT c.id, $2, $3, 'POR_M2', $4, m.id
       FROM categorias_producto c, inventario_madera m
       WHERE c.nombre = $1 AND m.especie = $5 AND m.espesor_pulg = $6
       ON CONFLICT (nombre) DO NOTHING`,
      ['Portones', p.nombre, p.tipo_porton, p.precio_m2, MADERA_EJEMPLO.especie, MADERA_EJEMPLO.espesor_pulg],
    );
  }

  for (const a of ACCESORIOS) {
    await client.query(
      `INSERT INTO accesorios (codigo, nombre, tipo_adicional, precio, tipo_porton_compatible)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (codigo) DO NOTHING`,
      [a.codigo, a.nombre, a.tipo_adicional, a.precio, a.tipo_porton_compatible],
    );
  }

  for (const e of ESTADOS_PEDIDO) {
    await client.query(
      `INSERT INTO estados_pedido (codigo, nombre, descripcion) VALUES ($1, $2, $3)
       ON CONFLICT (codigo) DO NOTHING`,
      [e.codigo, e.nombre, e.descripcion],
    );
  }

  for (const [indice, nombre] of FASES.entries()) {
    await client.query(
      `INSERT INTO fases_produccion (orden, nombre) VALUES ($1, $2)
       ON CONFLICT (orden) DO NOTHING`,
      [indice + 1, nombre],
    );
  }

  const passwordHash = await bcrypt.hash(admin.password, BCRYPT_COSTO);
  const { rowCount } = await client.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ($1, $2, $3, 'ADMIN')
     ON CONFLICT (email) DO NOTHING`,
    [admin.nombre, admin.email, passwordHash],
  );
  return { adminCreado: rowCount === 1 };
}

async function main() {
  const admin = leerAdmin();
  const { adminCreado } = await withTransaction((client) => sembrar(client, admin));
  console.log('Seed completado.');
  console.log(adminCreado ? `Usuario Admin creado: ${admin.email}` : `El usuario ${admin.email} ya existía; no se modificó.`);
}

main()
  .catch((err) => {
    console.error(`Error en el seed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
