/* oxlint-disable @nx/enforce-module-boundaries -- Test-only policy probe. */
import loadMujoco from '@mujoco/mujoco';
import wasmUrl from '@mujoco/mujoco/mujoco.wasm?url';
import * as ort from 'onnxruntime-web/wasm';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { MujocoWorld } from '../../libs/simulators/mujoco/src/lib/world';
import { fetchSimulationAssets } from '../../libs/simulators/mujoco/src/lib/assets';
import { walkingObservation } from '../../libs/simulators/microduck-mujoco/src/lib/observations';
import { loadMicroduckMujocoManifest } from '@botlab/simulators-microduck-mujoco';
export async function probePosture() {
  const mj = await loadMujoco({
    locateFile: (name) => (name.endsWith('.wasm') ? wasmUrl : name),
  });
  const manifest = await loadMicroduckMujocoManifest(undefined, 'obstacles');
  const files = await fetchSimulationAssets(manifest);
  const world = new MujocoWorld(mj, manifest, files);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
  const session = await ort.InferenceSession.create(
    files[manifest.controller!.model],
    { executionProviders: ['wasm'] },
  );
  const home = Array.from(new Float32Array(manifest.joints.map((j) => j.home)));
  const indices = ['neck_pitch', 'head_pitch', 'head_yaw', 'head_roll'].map(
    (name) => manifest.joints.findIndex((j) => j.name === name),
  );
  let previous = Array(14).fill(0),
    smooth = [0, 0, 0, 0];
  const posture = await ort.InferenceSession.create(
    new Uint8Array(
      await (
        await fetch('/simulation-assets/microduck/alpha-sitstand.onnx')
      ).arrayBuffer(),
    ),
    { executionProviders: ['wasm'] },
  );
  const samples = [];
  try {
    for (const mode of [
      'walk',
      'sit',
      'stand',
      'walk',
      'sit',
      'stand',
      'walk',
    ]) {
      const head = [0, 0, 0, 0];
      const selected = mode === 'walk' ? session : posture;
      previous = Array(14).fill(0);
      let minHeight = Infinity,
        maxTilt = 0;
      for (let tick = 0; tick < 400; tick++) {
        smooth = smooth.map((v, i) => v + 0.2 * (head[i] - v));
        const input = new ort.Tensor(
          'float32',
          walkingObservation(
            world.feedback(),
            home,
            previous,
            { forward: mode === 'sit' ? 1 : 0, yaw: 0 },
            smooth,
          ),
          [1, 61],
        );
        const outputs = await selected.run({ [selected.inputNames[0]]: input });
        previous = Array.from(
          outputs[selected.outputNames[0]].data as Float32Array,
        );
        world.setControllerTargets(previous.map((v, i) => home[i] + v));
        input.dispose();
        for (const o of Object.values(outputs)) o.dispose();
        for (let i = 0; i < 4; i++) world.step();
        const f = world.feedback();
        minHeight = Math.min(minHeight, f.rootPosition[2]);
        maxTilt = Math.max(
          maxTilt,
          Math.acos(
            Math.min(1, 1 - 2 * (f.quaternion[1] ** 2 + f.quaternion[2] ** 2)),
          ),
        );
      }
      const f = world.feedback();
      samples.push({
        mode,
        head,
        actual: indices.map((i) => f.positions[i]),
        home: indices.map((i) => home[i]),
        minHeight,
        maxTilt,
        frame: world.frame('head-probe', 0, 'paused'),
      });
    }
    return samples;
  } finally {
    world.dispose();
    await session.release();
    await posture.release();
  }
}
