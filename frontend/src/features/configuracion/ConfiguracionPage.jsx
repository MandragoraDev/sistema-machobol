import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useApi } from '../../hooks/useApi.js';
import { Alerta, Boton, Campo, EncabezadoPagina, ErrorApi, Tarjeta, claseInput } from '../../components/ui.jsx';
import { formatearFechaHora } from '../../utils/formato.js';

const CAMPOS_TEXTO = [
  { campo: 'ciudad', etiqueta: 'Ciudad' },
  { campo: 'direccion', etiqueta: 'Dirección', ayuda: 'La que el bot envía cuando preguntan dónde están.' },
  { campo: 'maps_url', etiqueta: 'Enlace de Google Maps', ayuda: 'Opcional. Se envía junto con la dirección.' },
  { campo: 'horarios', etiqueta: 'Horario de atención', ayuda: 'Por ejemplo: «De 7:30 a 21:00».' },
  { campo: 'formas_pago', etiqueta: 'Formas de pago' },
  { campo: 'tiempo_fabricacion', etiqueta: 'Tiempo de fabricación', ayuda: 'Por ejemplo: «De 3 semanas a 1 mes por portón».' },
];

/**
 * Configuración del negocio (Admin): lo que responde el bot a las consultas generales, el anticipo que exige la
 * producción y el WhatsApp del encargado que recibe los avisos (madera insuficiente, stock bajo, reuniones).
 */
export default function ConfiguracionPage() {
  const { datos, error, recargar } = useApi('/configuracion');
  const [formulario, setFormulario] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState(null);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    if (datos) {
      setFormulario({ ...datos, maps_url: datos.maps_url ?? '', whatsapp_avisos: datos.whatsapp_avisos ?? '', anticipo_pct: Number(datos.anticipo_pct) });
    }
  }, [datos]);

  const cambiar = (campo) => (e) => {
    setGuardado(false);
    setFormulario({ ...formulario, [campo]: e.target.value });
  };

  async function guardar(e) {
    e.preventDefault();
    setErrorGuardar(null);
    setEnviando(true);
    try {
      const { actualizado_en, ...resto } = formulario;
      await api('/configuracion', {
        method: 'PUT',
        body: {
          ...resto,
          maps_url: resto.maps_url.trim() || null,
          whatsapp_avisos: resto.whatsapp_avisos.trim() || null,
          anticipo_pct: Number(resto.anticipo_pct),
        },
      });
      setGuardado(true);
      recargar();
    } catch (err) {
      setErrorGuardar(err);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <EncabezadoPagina
        titulo="Configuración"
        descripcion="Datos del negocio que responde el asistente de WhatsApp, anticipo para iniciar la producción y número que recibe los avisos."
      />
      <ErrorApi error={error} />
      {!formulario ? (
        !error && <p className="text-sm text-stone-500">Cargando…</p>
      ) : (
        <form onSubmit={guardar} className="space-y-6">
          <Tarjeta titulo="Lo que responde el asistente">
            <div className="grid gap-4 sm:grid-cols-2">
              {CAMPOS_TEXTO.map(({ campo, etiqueta, ayuda }) => (
                <Campo key={campo} etiqueta={etiqueta} ayuda={ayuda}>
                  <input type={campo === 'maps_url' ? 'url' : 'text'} required={campo !== 'maps_url'} value={formulario[campo]} onChange={cambiar(campo)} className={claseInput} />
                </Campo>
              ))}
              <div className="sm:col-span-2">
                <Campo etiqueta="Dónde instalan" ayuda="Incluye cómo se cobra el traslado fuera de la ciudad.">
                  <textarea required rows={3} value={formulario.cobertura} onChange={cambiar('cobertura')} className={claseInput} />
                </Campo>
              </div>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Pagos y avisos">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Anticipo para iniciar la producción (%)" ayuda="Porcentaje del precio acordado que debe estar pagado.">
                <input type="number" required min="1" max="100" step="0.01" value={formulario.anticipo_pct} onChange={cambiar('anticipo_pct')} className={claseInput} />
              </Campo>
              <Campo etiqueta="WhatsApp del encargado" ayuda="Con código de país, p. ej. 59171234567. Recibe los avisos de madera insuficiente, stock bajo y reuniones.">
                <input type="tel" value={formulario.whatsapp_avisos} onChange={cambiar('whatsapp_avisos')} className={claseInput} placeholder="591…" />
              </Campo>
            </div>
          </Tarjeta>

          <ErrorApi error={errorGuardar} />
          {guardado && <Alerta tipo="exito">Configuración guardada. El asistente ya responde con los datos nuevos (puede tardar hasta un minuto).</Alerta>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-stone-500">Última actualización: {formatearFechaHora(datos.actualizado_en)}</p>
            <Boton type="submit" disabled={enviando}>Guardar cambios</Boton>
          </div>
        </form>
      )}
    </div>
  );
}
