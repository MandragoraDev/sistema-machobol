const { trocaAM2 } = require('../src/modules/inventario/inventario.conversion');

describe('Conversión de troca (pulgadas × pies) a m²', () => {
  it.each([
    // piezas, ancho (pulg), largo (pies), m² esperados
    [10, 8, 10, '6.1935'], // 10 × 0.2032 m × 3.048 m = 6.193536
    [1, 1, 1, '0.0077'], // 0.00774192
    [3, 7.5, 12.5, '2.1774'], // 2.177415
    [5, 6.25, 10, '2.4194'], // exactamente 2.41935: el empate se redondea hacia arriba
    [10_000, 100, 100, '774192.0000'], // máximos permitidos
  ])('%i piezas de %s″ × %s′ = %s m²', (piezas, ancho, largo, esperado) => {
    expect(trocaAM2(piezas, ancho, largo)).toBe(esperado);
  });

  it('no arrastra errores de punto flotante en medidas con decimales', () => {
    // 0.1 y 0.2 no son exactos en binario; la conversión trabaja con centésimas enteras.
    expect(trocaAM2(1, 0.1, 0.2)).toBe('0.0002'); // 0.0001548384 m²
    expect(trocaAM2(100, 0.1, 0.2)).toBe('0.0155'); // 0.01548384 m²
  });
});
