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
    `/simulation-assets/microduck/${scene === 'obstacles' ? 'obstacles-manifest-skills' : 'manifest-skills'}.json`,
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
      ? '9cd48e9933670971b93aab9ade5b5dada3f3f5ab17bb7710529459cf604802e7'
      : '4b6f076d619c24af80568df1196e7e2dca63440b924eca5a9bba6be10ac8b2b3')
  )
    throw new Error('MicroDuck manifest hash mismatch.');
  return JSON.parse(new TextDecoder().decode(bytes));
}
