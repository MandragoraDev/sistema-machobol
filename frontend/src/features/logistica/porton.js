const METROS = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TIPO = { CORREDIZO: 'Corredizo', BATIENTE: 'Batiente' };

/** "Corredizo · Cedro 1″ · 4,00 × 2,20 m". */
export function describirPorton({ tipo_porton, madera, ancho_m, alto_m }) {
  return [TIPO[tipo_porton] ?? tipo_porton, madera, `${METROS.format(ancho_m)} × ${METROS.format(alto_m)} m`]
    .filter(Boolean)
    .join(' · ');
}
