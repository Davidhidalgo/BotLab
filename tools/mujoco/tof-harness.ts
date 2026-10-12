/* oxlint-disable @nx/enforce-module-boundaries -- Dev-only numerical probe of the shared engine, never imported by production. */
import loadMujoco from '@mujoco/mujoco';
import wasmUrl from '@mujoco/mujoco/mujoco.wasm?url';
import { MujocoWorld } from '../../libs/simulators/mujoco/src/lib/world';
import { fetchSimulationAssets } from '../../libs/simulators/mujoco/src/lib/assets';
import { createWalkingController } from '../../libs/simulators/microduck-mujoco/src/lib/controller';
import { loadMicroduckMujocoManifest } from '@botlab/simulators-microduck-mujoco';
export async function probeTof() {
  const mj = await loadMujoco({
    locateFile: (name) => (name.endsWith('.wasm') ? wasmUrl : name),
  });
  const manifest = await loadMicroduckMujocoManifest(undefined, 'obstacles');
  const files = await fetchSimulationAssets(manifest);
  const world = new MujocoWorld(mj, manifest, files);
  const baseline = new MujocoWorld(
    mj,
    { ...manifest, depthSensor: undefined },
    files,
  );
  const controller = await createWalkingController(manifest, files);
  const samples = [];
  let mismatch = false;
  let lastSequence = -1;
  try {
    for (let tick = 0; tick < 250; tick++) {
      const output = await controller.infer(world.feedback(), {
        forward: tick < 50 ? 0 : 0.25,
        yaw: 0,
      });
      controller.accept(output);
      for (const w of [world, baseline]) {
        w.setControllerGains(output.kp, output.kd);
        w.setControllerTargets(output.targets);
      }
      for (let i = 0; i < 4; i++) {
        world.step();
        baseline.step();
        mismatch ||=
          JSON.stringify(world.feedback()) !==
          JSON.stringify(baseline.feedback());
        const f = world.frame('probe', 0, 'running');
        if (f.depth && f.depth.sequence !== lastSequence) {
          samples.push({
            time: f.timeSeconds,
            root: f.rootPosition,
            depth: f.depth,
          });
          lastSequence = f.depth.sequence;
        }
      }
    }
    return { mismatch, samples, manifestId: manifest.id };
  } finally {
    world.dispose();
    baseline.dispose();
    await controller.dispose();
  }
}
