import { Insignia } from '../../components/ui.jsx';

export default function EstadoMadera({ madera }) {
  if (!madera.activo) return <Insignia>Inactiva</Insignia>;
  if (Number(madera.stock_actual_m2) === 0) return <Insignia tono="peligro">Sin stock</Insignia>;
  if (madera.bajo_minimo) return <Insignia tono="alerta">Bajo mínimo</Insignia>;
  return <Insignia tono="exito">Disponible</Insignia>;
}
