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
  scene: 'flat' | 'obstacles' = 'flat',
): Promise<SimulationManifest> {
  const response = await fetch(
    `/simulation-assets/jumper-walking/${scene === 'obstacles' ? 'obstacles-manifest-performances' : 'manifest-performances'}.json`,
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
    hash !==
    (scene === 'obstacles'
      ? '70e7cde85317c0156b7a12b39dbc97905a6fc5b6439fa731a3d476f38645652a'
      : '6cf3406e2e5d13e418241780411ea2283be0852c95591ee4164092a7c76c4d22')
  )
    throw new Error('Jumper walking manifest hash mismatch.');
  return JSON.parse(new TextDecoder().decode(bytes));
}
