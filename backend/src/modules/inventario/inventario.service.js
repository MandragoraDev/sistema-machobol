const db = require('../../config/db');
const AppError = require('../../utils/AppError');
const inventarioRepository = require('./inventario.repository');
const { trocaAM2 } = require('./inventario.conversion');

async function listar({ incluirInactivas }) {
  const [maderas, resumen] = await Promise.all([
    inventarioRepository.listarMaderas({ incluirInactivas }),
    inventarioRepository.resumen(),
  ]);
  return { maderas, resumen };
}

function crearMadera(datos) {
  return inventarioRepository.crearMadera(datos);
}

async function actualizarMadera(id, cambios) {
  const madera = await inventarioRepository.actualizarMadera(id, cambios);
  if (!madera) {
    throw new AppError(404, 'La madera no existe.');
  }
  return madera;
}

async function maderaBloqueada(client, id) {
  const madera = await inventarioRepository.bloquearMadera(client, id);
  if (!madera) {
    throw new AppError(404, 'La madera no existe.');
  }
  return madera;
}

/** Ingreso de una troca: convierte a m² y suma el stock con su movimiento, todo en una transacción. */
async function registrarIngreso({ madera_id, piezas, ancho_pulg, largo_pies, observacion }, usuario) {
  const cantidadM2 = trocaAM2(piezas, ancho_pulg, largo_pies);
  if (Number(cantidadM2) === 0) {
    throw new AppError(400, 'La troca equivale a menos de 0.0001 m²; revisa las medidas.');
  }

  return db.withTransaction(async (client) => {
    const madera = await maderaBloqueada(client, madera_id);
    if (!madera.activo) {
      throw new AppError(409, `La madera ${madera.especie} está inactiva; actívala antes de registrar ingresos.`);
    }
    const { stock_actual_m2 } = await inventarioRepository.sumarStock(client, madera.id, cantidadM2);
    const movimiento = await inventarioRepository.insertarMovimiento(client, {
      madera_id: madera.id,
      tipo: 'INGRESO',
      cantidad_m2: cantidadM2,
      stock_resultante_m2: stock_actual_m2,
      piezas,
      ancho_pulg,
      largo_pies,
      usuario_id: usuario.id,
      motivo: observacion || null,
    });
    return { movimiento, stock_actual_m2 };
  });
}

/** Ajuste manual (Admin). Si dejaría el stock en negativo se rechaza sin modificar nada. */
async function registrarAjuste({ madera_id, cantidad_m2, motivo }, usuario) {
  return db.withTransaction(async (client) => {
    const madera = await maderaBloqueada(client, madera_id);
    const actualizado = await inventarioRepository.sumarStock(client, madera.id, cantidad_m2);
    if (!actualizado) {
      throw new AppError(
        409,
        `Stock insuficiente: hay ${Number(madera.stock_actual_m2)} m² de ${madera.especie} y el ajuste resta ${Math.abs(cantidad_m2)} m².`,
      );
    }
    const movimiento = await inventarioRepository.insertarMovimiento(client, {
      madera_id: madera.id,
      tipo: 'AJUSTE',
      cantidad_m2,
      stock_resultante_m2: actualizado.stock_actual_m2,
      usuario_id: usuario.id,
      motivo,
    });
    return { movimiento, stock_actual_m2: actualizado.stock_actual_m2 };
  });
}

function listarMovimientos(filtros) {
  return inventarioRepository.listarMovimientos(filtros);
}

module.exports = {
  listar,
  crearMadera,
  actualizarMadera,
  registrarIngreso,
  registrarAjuste,
  listarMovimientos,
};
