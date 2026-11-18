const TOTAL_FASES = 11;

/** Barra de las 11 fases. Un pedido entregado tiene todas completas. */
export default function ProgresoFases({ estado, fase }) {
  const completas = estado === 'ENTREGADO' ? TOTAL_FASES : (fase?.orden ?? 0);
  return (
    <div>
      <div className="flex gap-0.5" aria-hidden="true">
        {Array.from({ length: TOTAL_FASES }, (_, i) => {
          const orden = i + 1;
          const tono = orden < completas || estado === 'ENTREGADO' ? 'bg-accent' : orden === completas ? 'bg-primary' : 'bg-stone-200';
          return <span key={orden} className={`h-1.5 flex-1 rounded-full ${tono}`} />;
        })}
      </div>
      <p className="mt-1 text-xs text-stone-600">
        {estado === 'ENTREGADO'
          ? 'Las 11 fases completas'
          : fase
            ? `Fase ${fase.orden}/${TOTAL_FASES} · ${fase.nombre}`
            : 'Aún sin fase: espera madera'}
      </p>
    </div>
  );
}
