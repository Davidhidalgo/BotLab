import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SimulationManifest } from '@botlab/simulators-core';
import { fetchSimulationAssets, validateManifest } from './assets';
const scene = '<mujoco/>';
async function manifest(): Promise<SimulationManifest> {
  const bytes = new TextEncoder().encode(scene);
  const sha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
  return {
    schemaVersion: 1,
    id: 'test',
    robotId: 'test',
    revision: 'a'.repeat(40),
    mujocoVersion: '3.11.0',
    scene: 'scene.xml',
    assets: [
      {
        path: 'scene.xml',
        url: '/scene.xml',
        sha256,
        bytes: bytes.length,
        source: 'test',
      },
    ],
    joints: [
      {
        name: 'joint',
        min: -1,
        max: 1,
        home: 0,
        kp: 1,
        kd: 0.1,
        effortLimit: 1,
      },
    ],
    evidenceLevel: 'physics',
    variant: 'test',
    limitations: [],
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('verified assets', () => {
  it('rejects traversal, duplicate resources, unresolved scenes and invalid joint bounds', async () => {
    const m = await manifest();
    for (const path of [
      '../scene.xml',
      '/scene.xml',
      'a/../scene.xml',
      'a\\scene.xml',
    ])
      expect(() =>
        validateManifest({ ...m, assets: [{ ...m.assets[0], path }] }),
      ).toThrow(/Invalid|missing/);
    expect(() =>
      validateManifest({ ...m, assets: [...m.assets, ...m.assets] }),
    ).toThrow(/Invalid|missing/);
    expect(() => validateManifest({ ...m, scene: 'missing' })).toThrow(
      /Invalid|missing/,
    );
    expect(() =>
      validateManifest({ ...m, joints: [{ ...m.joints[0], home: 2 }] }),
    ).toThrow(/Invalid|missing/);
  });
  it('verifies bytes before passing them to MuJoCo', async () => {
    const m = await manifest();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(scene)),
    );
    expect((await fetchSimulationAssets(m))['scene.xml']).toEqual(
      new TextEncoder().encode(scene),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<badxml/>')),
    );
    await expect(fetchSimulationAssets(m)).rejects.toThrow(
      'verification failed',
    );
  });
});
