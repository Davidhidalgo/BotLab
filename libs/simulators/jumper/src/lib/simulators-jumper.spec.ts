import { it, expect, vi, afterEach } from 'vitest';
import { loadJumperJointManifest } from './simulators-jumper';
afterEach(() => vi.unstubAllGlobals());
it('rejects a manifest with different metadata even if its own assets look valid', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ schemaVersion: 1, revision: 'a'.repeat(40) }),
        ),
    ),
  );
  await expect(loadJumperJointManifest()).rejects.toThrow('revisión validada');
});
