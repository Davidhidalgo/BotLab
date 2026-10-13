/* oxlint-disable @nx/enforce-module-boundaries -- Probe exact product controller feedback. */
import loadMujoco from '@mujoco/mujoco';
import wasmUrl from '@mujoco/mujoco/mujoco.wasm?url';
import { MujocoWorld } from '../../libs/simulators/mujoco/src/lib/world';
import { fetchSimulationAssets } from '../../libs/simulators/mujoco/src/lib/assets';
import { createJumperWalkingController } from '../../libs/simulators/jumper/src/lib/walking-controller';
import { loadJumperWalkingManifest } from '@botlab/simulators-jumper';
export async function probeBodyPitch() {
  const mj = await loadMujoco({
    locateFile: (n) => (n.endsWith('.wasm') ? wasmUrl : n),
  });
  const manifest = await loadJumperWalkingManifest();
  const files = await fetchSimulationAssets(manifest);
  const results = [];
  for (const [target, warmup] of [
    [0.05, 0],
    [0.08, 0],
    [0.1, 0],
    [0.12, 0],
    [0.1, 100],
    [-0.1, 0],
  ] as const) {
    const world = new MujocoWorld(mj, manifest, files);
    const controller = await createJumperWalkingController(manifest, files);
    try {
      const samples = [];
      let quiet = 0,
        maxQuiet = 0;
      for (let tick = 0; tick < 1800 + warmup; tick++) {
        if (tick === warmup) controller.setBodyPitch!(target);
        const output = await controller.infer(world.feedback(), {
          forward: 0,
          yaw: 0,
        });
        controller.accept(output);
        world.setControllerGains(output.kp, output.kd);
        world.setControllerTargets(output.targets);
        for (let k = 0; k < 5; k++) {
          world.step();
          const f = world.feedback();
          controller.validateFeedback(f);
          const [w, x, y, z] = f.quaternion;
          const pitch = Math.asin(
            Math.max(-1, Math.min(1, 2 * (w * y - z * x))),
          );
          if (
            tick >= warmup &&
            Math.abs(pitch - target) <= 0.025 &&
            f.angularVelocity.every((v) => Math.abs(v) <= 0.1)
          ) {
            quiet += world.timestep;
            maxQuiet = Math.max(maxQuiet, quiet);
          } else quiet = 0;
          if (tick % 20 === 0 && k === 4)
            samples.push({
              t: f.timeSeconds,
              pitch,
              gyro: f.angularVelocity,
              position: f.rootPosition,
            });
        }
      }
      results.push({ target, warmup, maxQuiet, samples });
    } finally {
      world.dispose();
      await controller.dispose();
    }
  }
  return results;
}
