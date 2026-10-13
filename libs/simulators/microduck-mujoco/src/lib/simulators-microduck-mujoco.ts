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
  scene: 'flat' | 'obstacles' = 'flat',
): Promise<SimulationManifest> {
  const response = await fetch(
    `/simulation-assets/microduck/${scene === 'obstacles' ? 'obstacles-manifest-posture' : 'manifest-posture'}.json`,
    {
      signal,
    },
  );
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
    hash !==
    (scene === 'obstacles'
      ? '9592d64a358bfc6515dc59c125e13f751c1e65ab359b86d8165cf84acb26c86e'
      : '958611d00fd8374eddb6edd25822d11a067b2c39abf9004ab6a99487ef3c7003')
  )
    throw new Error('MicroDuck manifest hash mismatch.');
  return JSON.parse(new TextDecoder().decode(bytes));
}
