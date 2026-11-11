const { cotizarPorton, maderaRequerida } = require('../src/modules/cotizador/cotizador.calculo');

// Productos y catálogo del seed, con los valores como los entrega PostgreSQL (NUMERIC → texto).
// El precio por m² ya no es del producto: depende de la madera elegida (Cedro: 2.470 corredizo, 2.500 batiente).
const CORREDIZO = { nombre: 'Portón Corredizo', tipo_porton: 'CORREDIZO', modo_precio: 'POR_M2', factor_consumo: '1.000', merma_pct: '10.00' };
const BATIENTE = { ...CORREDIZO, nombre: 'Portón Batiente', tipo_porton: 'BATIENTE' };
const MOTOR_CORREDIZO = { id: 1, codigo: 'MOTOR_CORREDIZO', nombre: 'Motor para portón corredizo', tipo_adicional: 'ACCESORIO', precio: '1740.00', tipo_porton_compatible: 'CORREDIZO' };
const MOTOR_BATIENTE = { id: 2, codigo: 'MOTOR_BATIENTE', nombre: 'Motor para portón batiente', tipo_adicional: 'ACCESORIO', precio: '2088.00', tipo_porton_compatible: 'BATIENTE' };
const PUERTA = { id: 3, codigo: 'PUERTA_INGRESO', nombre: 'Puerta de ingreso peatonal', tipo_adicional: 'ACCESORIO', precio: '696.00', tipo_porton_compatible: null };
const TRANSPORTE = { id: 4, codigo: 'TRANSPORTE_VIATICOS', nombre: 'Transporte / viáticos', tipo_adicional: 'RECARGO', precio: '150.00', tipo_porton_compatible: null };

describe('Casos de referencia del PLAN §2.1: cobro exacto, sin redondeo (Bs)', () => {
  it.each([
    // producto, precio m², alto, ancho, accesorios, recargos, área, base, adicionales, total
    [CORREDIZO, '2470.00', 2.2, 4, [MOTOR_CORREDIZO], [], '8.8000', '21736.00', '1740.00', '23476.00'],
    [BATIENTE, '2500.00', 2, 3, [MOTOR_BATIENTE, PUERTA], [], '6.0000', '15000.00', '2784.00', '17784.00'],
    [CORREDIZO, '2470.00', 1.5, 2.5, [], [], '3.7500', '9262.50', '0.00', '9262.50'],
    [CORREDIZO, '2470.00', 2, 2.5, [], [], '5.0000', '12350.00', '0.00', '12350.00'],
    [BATIENTE, '2500.00', 2, 3, [], [TRANSPORTE], '6.0000', '15000.00', '150.00', '15150.00'],
  ])('%#: alto %s × ancho %s', (producto, precioM2, altoM, anchoM, accesorios, recargos, area, base, adicionales, total) => {
    const c = cotizarPorton({ producto, precioM2, anchoM, altoM, accesorios, recargos });
    expect([c.area_m2, c.subtotal_base, c.total_adicionales, c.total_exacto, c.total_final])
      .toEqual([area, base, adicionales, total, total]);
    expect(c).not.toHaveProperty('ajuste_redondeo');
  });
});

describe('Aritmética exacta', () => {
  it('el total es la suma exacta del portón y sus adicionales, con centavos', () => {
    // 2,15 × 3,33 = 7,1595 m² × 2.470 = 17.683,965 Bs → 17.683,97 (medio centavo no se cobra) + 696 = 18.379,97
    const c = cotizarPorton({ producto: CORREDIZO, precioM2: '2470.00', anchoM: 3.33, altoM: 2.15, accesorios: [PUERTA] });
    expect([c.area_m2, c.subtotal_base, c.total_final]).toEqual(['7.1595', '17683.97', '18379.97']);
  });

  it('usa el precio por m² de la madera elegida', () => {
    const cedro = cotizarPorton({ producto: CORREDIZO, precioM2: '2470.00', anchoM: 4, altoM: 2.2 });
    const tajibo = cotizarPorton({ producto: CORREDIZO, precioM2: '2899.90', anchoM: 4, altoM: 2.2 });
    expect([cedro.precio_m2, cedro.total_final]).toEqual(['2470.00', '21736.00']);
    expect([tajibo.precio_m2, tajibo.total_final]).toEqual(['2899.90', '25519.12']); // 8,80 × 2.899,90
  });

  it('valores que en coma flotante darían error (0,1 + 0,2) quedan exactos', () => {
    const c = cotizarPorton({ producto: CORREDIZO, precioM2: '0.10', anchoM: 10, altoM: 10, recargos: [{ ...TRANSPORTE, precio: '0.20' }] });
    expect(c.total_final).toBe('10.20');
  });

  it('calcula la madera: área × factor × (1 + merma) — 8,80 m² descuenta 9,68 m²', () => {
    expect(cotizarPorton({ producto: CORREDIZO, precioM2: '2470.00', anchoM: 4, altoM: 2.2 }).madera_requerida_m2).toBe('9.6800');
    expect(maderaRequerida({ ...CORREDIZO, factor_consumo: '1.250', merma_pct: '12.50' }, 3.33, 2.15)).toBe('10.0680'); // 10,068046…
  });

  it('el transporte solo se suma si viene como recargo', () => {
    const c = cotizarPorton({ producto: BATIENTE, precioM2: '2500.00', anchoM: 3, altoM: 2 });
    expect(c.adicionales).toEqual([]);
    expect(c.total_final).toBe('15000.00');
  });
});

describe('Validaciones', () => {
  const base = { producto: CORREDIZO, precioM2: '2470.00' };

  it.each([
    ['ancho menor a 0,30 m', { anchoM: 0.29, altoM: 2 }, 'El ancho debe estar entre 0.30 m y 20.00 m.'],
    ['alto mayor a 20 m', { anchoM: 4, altoM: 20.01 }, 'El alto debe estar entre 0.30 m y 20.00 m.'],
  ])('rechaza %s', (_caso, medidas, mensaje) => {
    expect(() => cotizarPorton({ ...base, ...medidas })).toThrow(mensaje);
  });

  it('rechaza un motor incompatible con el tipo de portón', () => {
    expect(() => cotizarPorton({ ...base, anchoM: 4, altoM: 2.2, accesorios: [MOTOR_BATIENTE] }))
      .toThrow('Motor para portón batiente no es compatible con un portón corredizo.');
  });

  it('acepta la puerta de ingreso en ambos tipos', () => {
    expect(cotizarPorton({ ...base, anchoM: 4, altoM: 2.2, accesorios: [PUERTA] }).total_adicionales).toBe('696.00');
    expect(cotizarPorton({ producto: BATIENTE, precioM2: '2500.00', anchoM: 3, altoM: 2, accesorios: [PUERTA] }).total_adicionales).toBe('696.00');
  });

  it('no permite elegir un recargo como si fuera accesorio', () => {
    expect(() => cotizarPorton({ ...base, anchoM: 4, altoM: 2.2, accesorios: [TRANSPORTE] })).toThrow('no se elige como accesorio');
  });

  it('no cotiza por m² un producto de precio fijo', () => {
    const parque = { nombre: 'Parque infantil Aventura', tipo_porton: null, modo_precio: 'FIJO', precio_fijo: '8000.00' };
    expect(() => cotizarPorton({ producto: parque, precioM2: '1.00', anchoM: 3, altoM: 2 })).toThrow('no se cotiza por m²');
  });
});
