// Proforma en PDF (PDFKit) con el desglose exacto de la cotización.
// Las fuentes estándar de PDF solo cubren Latin-1: nada de símbolos fuera de ese rango (como ″).
const PDFDocument = require('pdfkit');
const { formatearDecimal, formatearM2, formatearFecha, formatearFechaHora, formatearTelefono, nombreMadera } = require('../../utils/formato');

const COLOR = { primario: '#4E342E', acento: '#2E7D32', crema: '#F5EEDC', texto: '#292524', tenue: '#78716C', linea: '#D6D3D1' };
// El mismo logo del panel (frontend/public/favicon.svg), en una caja de 32 × 32.
const LOGO = 'M8 23V9h3l5 7 5-7h3v14h-3v-9l-5 7-5-7v9z';

const X = 50;
const ANCHO = 512; // carta (612 pt) menos márgenes de 50
// Columnas de la tabla: descripción, cantidad, precio unitario, importe.
const COL = [
  { x: X, ancho: 262 },
  { x: X + 262, ancho: 80 },
  { x: X + 342, ancho: 85 },
  { x: X + 427, ancho: 85 },
];

const bs = (texto) => formatearDecimal(texto, 2);

function encabezado(doc, pedido) {
  doc.roundedRect(X, 50, 44, 44, 8).fill(COLOR.primario);
  doc.save().translate(X, 50).scale(44 / 32).path(LOGO).fill(COLOR.crema).restore();
  doc.fillColor(COLOR.primario).font('Helvetica-Bold').fontSize(20).text('MACHOBOL', X + 56, 54);
  doc.fillColor(COLOR.tenue).font('Helvetica').fontSize(9).text('Portones y parques infantiles de madera', X + 56, 78);

  doc.fillColor(COLOR.primario).font('Helvetica-Bold').fontSize(16).text('PROFORMA', X, 50, { width: ANCHO, align: 'right' });
  doc.fillColor(COLOR.texto).font('Helvetica').fontSize(10);
  doc.text(`N.º ${pedido.codigo}`, X, 70, { width: ANCHO, align: 'right' });
  doc.text(`Emitida: ${formatearFecha(pedido.creado_en)}`, X, 84, { width: ANCHO, align: 'right' });
  doc.font('Helvetica-Bold').text(`Válida hasta: ${formatearFecha(pedido.valido_hasta)}`, X, 98, { width: ANCHO, align: 'right' });
  doc.moveTo(X, 120).lineTo(X + ANCHO, 120).lineWidth(1).strokeColor(COLOR.primario).stroke();
}

function datosCliente(doc, cliente) {
  const filas = [
    ['Cliente', cliente.nombre || 'Cliente de WhatsApp'],
    ['WhatsApp', formatearTelefono(cliente.wa_id)],
    ...(cliente.ci_nit ? [['CI / NIT', cliente.ci_nit]] : []),
  ];
  let y = 134;
  for (const [etiqueta, valor] of filas) {
    doc.fillColor(COLOR.tenue).font('Helvetica').fontSize(9).text(etiqueta.toUpperCase(), X, y);
    doc.fillColor(COLOR.texto).font('Helvetica').fontSize(10).text(valor, X + 70, y - 1);
    y += 16;
  }
  return y + 8;
}

function fila(doc, y, celdas, { negrita = false, fondo = null, color = COLOR.texto } = {}) {
  const altura = Math.max(...celdas.map((texto, i) => doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
    .heightOfString(texto, { width: COL[i].ancho - 12 }))) + 10;
  if (fondo) doc.rect(X, y, ANCHO, altura).fill(fondo);
  celdas.forEach((texto, i) => {
    doc.fillColor(color).font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
      .text(texto, COL[i].x + 6, y + 5, { width: COL[i].ancho - 12, align: i === 0 ? 'left' : 'right' });
  });
  return y + altura;
}

function detalle(doc, pedido, y) {
  y = fila(doc, y, ['Descripción', 'Cantidad', 'Precio unit. (Bs)', 'Importe (Bs)'], { negrita: true, fondo: COLOR.crema, color: COLOR.primario });
  const madera = pedido.madera ? `\nMadera: ${nombreMadera(pedido.madera, { pulgadas: ' pulg.' })}` : '';
  y = fila(doc, y, [
    `${pedido.producto.nombre} de madera, a medida: ${bs(pedido.ancho_m)} m de ancho × ${bs(pedido.alto_m)} m de alto${madera}`,
    `${formatearM2(pedido.area_m2)} m²`,
    `${bs(pedido.precio_m2)} / m²`,
    bs(pedido.subtotal_base),
  ]);
  for (const adicional of pedido.adicionales) {
    doc.moveTo(X, y).lineTo(X + ANCHO, y).lineWidth(0.5).strokeColor(COLOR.linea).stroke();
    y = fila(doc, y, [adicional.nombre, '1', bs(adicional.precio), bs(adicional.precio)]);
  }
  doc.moveTo(X, y).lineTo(X + ANCHO, y).lineWidth(1).strokeColor(COLOR.primario).stroke();
  return y + 12;
}

/** El total a pagar es la suma exacta del portón y sus adicionales (sin redondeos, decisión del 2026-11-06). */
function totales(doc, pedido, y) {
  const lineas = [
    ['Subtotal del portón', bs(pedido.subtotal_base)],
    ...(Number(pedido.total_adicionales) > 0 ? [['Accesorios y recargos', bs(pedido.total_adicionales)]] : []),
  ];
  for (const [etiqueta, valor] of lineas) {
    doc.fillColor(COLOR.texto).font('Helvetica').fontSize(10).text(etiqueta, X + 162, y, { width: 250, align: 'right' });
    doc.text(valor, X + 427, y, { width: 79, align: 'right' });
    y += 16;
  }
  y += 4;
  doc.rect(X + 262, y, 250, 26).fill(COLOR.primario);
  doc.fillColor(COLOR.crema).font('Helvetica-Bold').fontSize(12).text('TOTAL A PAGAR (Bs)', X + 270, y + 8);
  doc.text(bs(pedido.total_final), X + 427, y + 8, { width: 79, align: 'right' });
  return y + 44;
}

function condiciones(doc, pedido, y) {
  const fueraDeCiudad = pedido.adicionales.some((a) => a.tipo_adicional === 'RECARGO');
  const lineas = [
    `Precios en bolivianos (Bs). El precio se mantiene hasta el ${formatearFecha(pedido.valido_hasta)}.`,
    'Forma de pago: el total, mediante QR. La fabricación empieza cuando se confirma el pago.',
    'Fabricación en 11 etapas, desde el aserradero hasta la instalación.',
    fueraDeCiudad
      ? 'Incluye transporte y viáticos por entrega fuera de la ciudad (a más de 45 minutos).'
      : 'Entrega e instalación dentro de la ciudad.',
  ];
  doc.fillColor(COLOR.primario).font('Helvetica-Bold').fontSize(10).text('Condiciones', X, y);
  doc.fillColor(COLOR.texto).font('Helvetica').fontSize(9).list(lineas, X, y + 16, { bulletRadius: 1.5, textIndent: 10, width: ANCHO });
}

function pie(doc) {
  // El pie va dentro del margen inferior: sin esto, PDFKit abriría una página nueva solo para él.
  doc.page.margins.bottom = 0;
  doc.fillColor(COLOR.tenue).font('Helvetica').fontSize(8)
    .text(`Documento generado por el sistema de MACHOBOL el ${formatearFechaHora(new Date())}.`, X, 750, { width: ANCHO, align: 'center', lineBreak: false });
}

/** Genera la proforma de un pedido (el objeto que devuelve pedidosService) y la devuelve como Buffer. */
function generarProforma(pedido) {
  return new Promise((resolver, rechazar) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: X,
      info: { Title: `Proforma ${pedido.codigo}`, Author: 'MACHOBOL', Subject: 'Cotización de portón de madera' },
    });
    const partes = [];
    doc.on('data', (parte) => partes.push(parte));
    doc.on('end', () => resolver(Buffer.concat(partes)));
    doc.on('error', rechazar);

    encabezado(doc, pedido);
    let y = datosCliente(doc, pedido.cliente);
    y = detalle(doc, pedido, y);
    y = totales(doc, pedido, y);
    condiciones(doc, pedido, y);
    pie(doc);
    doc.end();
  });
}

module.exports = { generarProforma };
