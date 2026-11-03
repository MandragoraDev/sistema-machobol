import { Insignia } from '../../components/ui.jsx';

const TIPOS = {
  INGRESO: { texto: 'Ingreso', tono: 'exito' },
  SALIDA: { texto: 'Salida', tono: 'primario' },
  AJUSTE: { texto: 'Ajuste', tono: 'alerta' },
};

export default function InsigniaMovimiento({ tipo }) {
  const { texto, tono } = TIPOS[tipo];
  return <Insignia tono={tono}>{texto}</Insignia>;
}
