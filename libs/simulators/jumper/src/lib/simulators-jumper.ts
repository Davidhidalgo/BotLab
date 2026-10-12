import type { SimulationManifest } from '@botlab/simulators-core';

export const jumperRevision = '78966f45de6f2b6de3f7cea017f32a39f8b993e6';
const manifestSha256 =
  'acca66d66f450c13278a027b413d3f1fbd60dc8b6d51efc250f38004fde96ceb';

export async function loadJumperJointManifest(
  signal?: AbortSignal,
): Promise<SimulationManifest> {
  const response = await fetch('/simulation-assets/jumper/manifest.json', {
    signal,
  });
  if (!response.ok)
    throw new Error(
      'Faltan los recursos de Jumper. Ejecuta la preparación indicada en tools/mujoco/README.md.',
    );
  const bytes = await response.arrayBuffer();
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (value) => value.toString(16).padStart(2, '0'),
  ).join('');
  if (digest !== manifestSha256)
    throw new Error(
      'El manifiesto de Jumper no corresponde a la revisión validada.',
    );
  const manifest = JSON.parse(
    new TextDecoder().decode(bytes),
  ) as SimulationManifest;
  if (
    manifest.revision !== jumperRevision ||
    manifest.variant !== 'fixed-base-joint-probe'
  )
    throw new Error('Variante de Jumper incompatible.');
  return manifest;
}

export async function loadJumperWalkingManifest(
  signal?: AbortSignal,
): Promise<SimulationManifest> {
  const response = await fetch(
    '/simulation-assets/jumper-walking/manifest.json',
    { signal },
  );
  if (!response.ok)
    throw new Error(
      'Faltan recursos de marcha de Jumper. Sigue tools/mujoco/README.md.',
    );
  const bytes = await response.arrayBuffer();
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
  if (
    hash !== 'aeec1ff2435981ccff8cf426c732ea34141bcbbb65cc505dcf2fe2fa9b4d41f1'
  )
    throw new Error('Jumper walking manifest hash mismatch.');
  return JSON.parse(new TextDecoder().decode(bytes));
}
