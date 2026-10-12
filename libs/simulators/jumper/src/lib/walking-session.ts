import { createMujocoSession } from '@botlab/simulators-mujoco';
export function createJumperWalkingSession() {
  return createMujocoSession(
    () =>
      new Worker(new URL('./walking-worker.ts', import.meta.url), {
        type: 'module',
      }),
  );
}
