const { siguientePaso, pasoAnterior, describirPaso } = require('../src/modules/logistica/logistica.flujo');

const FASES = { 1: 'Aserradero', 2: 'Secado', 10: 'Control de calidad y despacho', 11: 'Instalación' };

describe('Recorrido operativo de un pedido pagado', () => {
  it('avanza fase por fase en producción, sale en ruta tras la fase 10 y termina entregado', () => {
    const recorrido = [{ estado: 'EN_PRODUCCION', fase: 1 }];
    for (let paso = siguientePaso(recorrido[0]); paso; paso = siguientePaso(paso)) recorrido.push(paso);
    expect(recorrido.map((p) => `${p.estado}:${p.fase}`)).toEqual([
      ...Array.from({ length: 10 }, (_, i) => `EN_PRODUCCION:${i + 1}`),
      'EN_RUTA:11',
      'ENTREGADO:11',
    ]);
  });

  it('retrocede de a un paso y no pasa de la fase 1', () => {
    expect(pasoAnterior({ estado: 'ENTREGADO', fase: 11 })).toEqual({ estado: 'EN_RUTA', fase: 11 });
    expect(pasoAnterior({ estado: 'EN_RUTA', fase: 11 })).toEqual({ estado: 'EN_PRODUCCION', fase: 10 });
    expect(pasoAnterior({ estado: 'EN_PRODUCCION', fase: 5 })).toEqual({ estado: 'EN_PRODUCCION', fase: 4 });
    expect(pasoAnterior({ estado: 'EN_PRODUCCION', fase: 1 })).toBeNull();
  });

  it('un pedido que no está en la logística (cotizado, en revisión de stock) no tiene pasos', () => {
    expect(siguientePaso({ estado: 'COTIZADO', fase: null })).toBeNull();
    expect(pasoAnterior({ estado: 'REVISION_STOCK', fase: null })).toBeNull();
  });

  it('describe cada paso para los botones y el historial', () => {
    expect(describirPaso({ estado: 'EN_PRODUCCION', fase: 2 }, FASES)).toBe('Fase 2: Secado');
    expect(describirPaso({ estado: 'EN_RUTA', fase: 11 }, FASES)).toBe('En ruta / instalación (fase 11: Instalación)');
    expect(describirPaso({ estado: 'ENTREGADO', fase: 11 }, FASES)).toBe('Entregado / instalado');
    expect(describirPaso(null, FASES)).toBeNull();
  });
});
