// Piezas de interfaz compartidas, con la paleta institucional (PLAN §1.2).
import { cloneElement, useId } from 'react';

/** Estilo de input/select sin ancho: para controles compactos (p. ej. filtros en línea). */
export const claseControl =
  'rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 ' +
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-stone-100';

export const claseInput = `w-full ${claseControl}`;

export function Tarjeta({ titulo, acciones, children, className = '' }) {
  return (
    <section className={`rounded-lg border border-primary/15 bg-white p-5 shadow-sm ${className}`}>
      {(titulo || acciones) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {titulo && <h2 className="font-semibold text-primary">{titulo}</h2>}
          {acciones}
        </div>
      )}
      {children}
    </section>
  );
}

/** Etiqueta + control. `children` es un único input/select/textarea: se le asigna el id que enlaza la etiqueta. */
export function Campo({ etiqueta, ayuda, children }) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-stone-700">
        {etiqueta}
      </label>
      {cloneElement(children, { id, 'aria-describedby': ayuda ? idAyuda : undefined })}
      {ayuda && (
        <p id={idAyuda} className="mt-1 text-xs text-stone-500">
          {ayuda}
        </p>
      )}
    </div>
  );
}

const VARIANTES_BOTON = {
  primario: 'bg-primary text-surface hover:bg-primary/90',
  exito: 'bg-accent text-white hover:bg-accent/90',
  secundario: 'border border-primary/30 bg-white text-primary hover:bg-primary/5',
};

export function Boton({ variante = 'primario', className = '', ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTES_BOTON[variante]} ${className}`}
      {...props}
    />
  );
}

const TONOS_ALERTA = {
  error: 'border-red-200 bg-red-50 text-red-800',
  exito: 'border-accent/30 bg-accent/10 text-accent',
  info: 'border-primary/20 bg-surface text-primary',
};

export function Alerta({ tipo = 'info', children }) {
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={`rounded-md border px-3 py-2 text-sm ${TONOS_ALERTA[tipo]}`}>
      {children}
    </div>
  );
}

/** Muestra un error de la API, con el detalle por campo si lo trae. */
export function ErrorApi({ error }) {
  if (!error) return null;
  const detalles = error.datos?.detalles ?? [];
  const mensaje = error.status && error.status < 500 ? error.message : 'No se pudo conectar con el servidor. Intenta de nuevo.';
  return (
    <Alerta tipo="error">
      {mensaje}
      {detalles.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {detalles.map((d) => (
            <li key={`${d.campo}-${d.mensaje}`}>{d.campo ? `${d.campo}: ${d.mensaje}` : d.mensaje}</li>
          ))}
        </ul>
      )}
    </Alerta>
  );
}

const TONOS_INSIGNIA = {
  neutro: 'bg-stone-200 text-stone-700',
  exito: 'bg-accent/15 text-accent',
  alerta: 'bg-amber-100 text-amber-800',
  peligro: 'bg-red-100 text-red-700',
  primario: 'bg-primary/10 text-primary',
};

export function Insignia({ tono = 'neutro', children }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONOS_INSIGNIA[tono]}`}>
      {children}
    </span>
  );
}

export function EncabezadoPagina({ titulo, descripcion, acciones }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-primary">{titulo}</h1>
        {descripcion && <p className="mt-1 text-sm text-stone-600">{descripcion}</p>}
      </div>
      {acciones}
    </div>
  );
}
