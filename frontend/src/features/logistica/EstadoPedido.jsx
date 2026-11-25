import { Insignia } from '../../components/ui.jsx';

const TONOS = {
  REUNION_SOLICITADA: 'alerta',
  REUNION_AGENDADA: 'primario',
  REVISION_STOCK: 'peligro',
  EN_PRODUCCION: 'primario',
  EN_RUTA: 'alerta',
  ENTREGADO: 'exito',
};

export default function EstadoPedido({ estado, nombre }) {
  return <Insignia tono={TONOS[estado] ?? 'neutro'}>{nombre}</Insignia>;
}
