import type { SimulationDepthFrame } from './session';

/** The central quarter of each sensor axis; absence is unknown, never clear. */
export function evaluateFrontProximity(
  depth: SimulationDepthFrame | undefined,
  timeSeconds: number,
  thresholdMeters: number,
) {
  if (
    !Number.isFinite(thresholdMeters) ||
    thresholdMeters < 0.05 ||
    thresholdMeters > 4
  )
    throw new Error('Usa una distancia de 5–400 cm.');
  if (!depth)
    throw new Error(
      'Esta escena no tiene sensor de distancia. Selecciona Obstáculos + ToF.',
    );
  const age = timeSeconds - depth.capturedAtSeconds;
  if (!Number.isFinite(age) || age < -1e-6 || age > 0.1)
    throw new Error('La lectura del sensor está caducada.');
  const values: number[] = [];
  for (let row = 0; row < depth.rows; row++)
    for (let column = 0; column < depth.columns; column++) {
      if (
        Math.abs((row + 0.5) / depth.rows - 0.5) > 0.125 ||
        Math.abs((column + 0.5) / depth.columns - 0.5) > 0.125
      )
        continue;
      const index = row * depth.columns + column,
        value = depth.distancesMeters[index];
      if (
        depth.statuses[index] !== 'hit' ||
        value === null ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > depth.maxRangeMeters
      )
        throw new Error(
          'No hay una lectura frontal válida. No se puede decidir si el paso está libre.',
        );
      values.push(value);
    }
  if (!values.length) throw new Error('El sensor no tiene zonas frontales.');
  const distanceMeters = Math.min(...values);
  return {
    value: distanceMeters < thresholdMeters,
    distanceMeters,
    thresholdMeters,
    capturedAtSeconds: depth.capturedAtSeconds,
    sequence: depth.sequence,
  };
}
