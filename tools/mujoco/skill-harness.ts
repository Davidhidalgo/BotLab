/* oxlint-disable @nx/enforce-module-boundaries -- Test-only pinned policy probe. */
import loadMujoco from '@mujoco/mujoco';
import wasmUrl from '@mujoco/mujoco/mujoco.wasm?url';
import * as ort from 'onnxruntime-web/wasm';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { MujocoWorld } from '../../libs/simulators/mujoco/src/lib/world';
import { fetchSimulationAssets } from '../../libs/simulators/mujoco/src/lib/assets';
import { walkingObservation } from '../../libs/simulators/microduck-mujoco/src/lib/observations';
import { loadMicroduckMujocoManifest } from '@botlab/simulators-microduck-mujoco';
export async function probeSkills() {
  const mj = await loadMujoco({
    locateFile: (name) => (name.endsWith('.wasm') ? wasmUrl : name),
  });
  const manifest = await loadMicroduckMujocoManifest();
  const files = await fetchSimulationAssets(manifest);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
  const walking = await ort.InferenceSession.create(
    files[manifest.controller!.model],
    { executionProviders: ['wasm'] },
  );
  const home = Array.from(new Float32Array(manifest.joints.map((j) => j.home)));
  const results = [];
  try {
    for (const [name, sha, steps] of [
      [
        'ball_kick_left.onnx',
        'd6928284dccd3dd61e08bf2f760effa74309fbefd97b2b31afb2a60f526d196a',
        25,
      ],
      [
        'ball_kick_right.onnx',
        '147a32c388c6b19111b3ac3b550a9a6dc8b8bf267118af4d8c3712522eedb5af',
        25,
      ],
      [
        'alpha_ground_pick.onnx',
        'ffbf5109982ff999b0ba53afe86b9ae731bbec679d67fb7f8ab4c52152c88872',
        140,
      ],
      [
        'roulade.onnx',
        '3d60da08fc13f29c1b57f41977aa898132c0d60042100149d8e775affcbca32b',
        150,
      ],
    ] as const) {
      const bytes = await (
        await fetch('/simulation-assets/microduck/' + name)
      ).arrayBuffer();
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      )
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      if (digest !== sha) throw new Error('Policy mismatch');
      const skill = await ort.InferenceSession.create(bytes, {
        executionProviders: ['wasm'],
      });
      for (const warmup of [0, 100]) {
        const world = new MujocoWorld(mj, manifest, files);
        let previous = Array(14).fill(0);
        const samples = [];
        try {
          for (const [phase, ticks] of [
            ['warmup', warmup],
            ['skill', steps],
            ['balance', 200],
            ['advance', 100],
            ['rest', 100],
          ] as const) {
            let minHeight = Infinity,
              maxTilt = 0,
              maxJointChange = 0;
            const before = world.feedback();
            for (let tick = 0; tick < ticks; tick++) {
              const f = world.feedback();
              const obs = walkingObservation(f, home, previous, {
                forward: phase === 'advance' ? 0.25 : 0,
                yaw: 0,
              });
              if (phase === 'skill' && name === 'alpha_ground_pick.onnx') {
                const angle = (2 * Math.PI * tick * 0.02) / 4;
                obs[48] = Math.cos(angle);
                obs[49] = Math.sin(angle);
              }
              const input = new ort.Tensor('float32', obs, [1, 61]);
              const session = phase === 'skill' ? skill : walking;
              const outputs = await session.run({
                [session.inputNames[0]]: input,
              });
              previous = Array.from(
                outputs[session.outputNames[0]].data as Float32Array,
              );
              world.setControllerTargets(previous.map((v, i) => home[i] + v));
              input.dispose();
              Object.values(outputs).forEach((o) => o.dispose());
              for (let k = 0; k < 4; k++) world.step();
              const after = world.feedback();
              minHeight = Math.min(minHeight, after.rootPosition[2]);
              maxTilt = Math.max(
                maxTilt,
                Math.acos(
                  Math.max(
                    -1,
                    Math.min(
                      1,
                      1 -
                        2 *
                          (after.quaternion[1] ** 2 + after.quaternion[2] ** 2),
                    ),
                  ),
                ),
              );
              maxJointChange = Math.max(
                maxJointChange,
                ...after.positions.map((v, i) =>
                  Math.abs(v - before.positions[i]),
                ),
              );
            }
            if (ticks)
              samples.push({
                phase,
                minHeight,
                maxTilt,
                maxJointChange,
                feedback: world.feedback(),
              });
          }
          results.push({ name, sha, warmup, samples });
        } finally {
          world.dispose();
        }
      }
      await skill.release();
    }
    return results;
  } finally {
    await walking.release();
  }
}
