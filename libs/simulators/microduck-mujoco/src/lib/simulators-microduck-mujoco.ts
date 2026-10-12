import { createMujocoSession } from '@botlab/simulators-mujoco';
import type { SimulationManifest } from '@botlab/simulators-core';

export function createMicroduckMujocoSession() {
  return createMujocoSession(
    () =>
      new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  );
}
export async function loadMicroduckMujocoManifest(
  signal?: AbortSignal,
): Promise<SimulationManifest> {
  const response = await fetch('/simulation-assets/microduck/manifest.json', {
    signal,
  });
  if (!response.ok)
    throw new Error(
      'Faltan recursos de MicroDuck. Ejecuta python3 tools/mujoco/prepare-microduck.py.',
    );
  const bytes = await response.arrayBuffer();
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
  if (
    hash !== '50f88e703fefd010294a7a46b13e2dc8d1654b3a7c834c82f2449611115f45ed'
  )
    throw new Error('MicroDuck manifest hash mismatch.');
  return JSON.parse(new TextDecoder().decode(bytes));
}
