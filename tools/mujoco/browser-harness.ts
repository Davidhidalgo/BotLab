// Test-only imports. Production app never imports this module.
import loadMujoco from '@mujoco/mujoco';
import wasmUrl from '@mujoco/mujoco/mujoco.wasm?url';
import * as ort from 'onnxruntime-web/wasm';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { MujocoWorld } from '../../libs/simulators/mujoco/src/lib/world';
import { fetchSimulationAssets } from '../../libs/simulators/mujoco/src/lib/assets';
import { createWalkingController } from '../../libs/simulators/microduck-mujoco/src/lib/controller';
import { loadJumperJointManifest } from '@botlab/simulators-jumper';
import { loadMicroduckMujocoManifest } from '@botlab/simulators-microduck-mujoco';

export async function physicsReference() {
  const mj = await loadMujoco({
    locateFile: (name) => (name.endsWith('.wasm') ? wasmUrl : name),
  });
  const jm = await loadJumperJointManifest();
  const jw = new MujocoWorld(mj, jm, await fetchSimulationAssets(jm));
  const ji = jm.joints.findIndex((j) => j.name === 'LM_J0_joint');
  const jumper = [];
  for (let run = 0; run < 3; run++) {
    jw.reset();
    const samples = [];
    for (let tick = 0; tick < 60000; tick++) {
      if (tick === 1000) jw.setTarget('LM_J0_joint', 0.2);
      if (tick === 4000) jw.setTarget('LM_J0_joint', jm.joints[ji].home);
      jw.step();
      if ([0, 999, 1999, 3999, 4999, 59999].includes(tick)) {
        const f = jw.frame('reference', run, 'running');
        samples.push({ t: f.timeSeconds, q: f.positions });
      }
    }
    jumper.push(samples);
  }
  jw.dispose();
  const mm = await loadMicroduckMujocoManifest(),
    files = await fetchSimulationAssets(mm);
  const mw = new MujocoWorld(mj, mm, files),
    controller = await createWalkingController(mm, files);
  const samples = [],
    latencies = [],
    vectors = [];
  const begin = performance.now();
  try {
    for (let tick = 0; tick < 3000; tick++) {
      const t = tick * 0.02,
        velocity = {
          forward: t >= 5 && t < 25 ? 0.25 : 0,
          yaw: t >= 30 && t < 40 ? 1 : 0,
        };
      const feedback = mw.feedback(),
        start = performance.now();
      const out = await controller.infer(feedback, velocity);
      latencies.push(performance.now() - start);
      controller.accept(out);
      mw.setControllerTargets(out.targets);
      for (let i = 0; i < 4; i++) mw.step();
      controller.validateFeedback(mw.feedback());
      if (tick % 50 === 49) {
        const f = mw.frame('reference', 0, 'running');
        samples.push({
          t: Math.round(f.timeSeconds * 1e6) / 1e6,
          p: f.rootPosition,
          q: f.rootQuaternion,
          j: f.positions,
        });
      }
      if ([0, 1, 50, 251, 501, 1501].includes(tick))
        vectors.push({ t, action: out.state });
    }
  } finally {
    await controller.dispose();
    mw.dispose();
  }
  latencies.sort((a, b) => a - b);
  return {
    jumper,
    microduck: {
      samples,
      vectors,
      wallSeconds: (performance.now() - begin) / 1000,
      inferenceP50Ms: latencies[1500],
      inferenceP95Ms: latencies[2850],
    },
  };
}

export async function jumperPolicyReference(base: string) {
  const input = await (await fetch(base + 'jumper-reference.json')).json();
  const binding = await import(/* @vite-ignore */ base + 'controller.js');
  await binding.default({
    module_or_path: await (await fetch(base + 'controller.wasm')).arrayBuffer(),
  });
  const fsm = new binding.WebFsm(
    input.toml,
    JSON.stringify(input.contracts),
    JSON.stringify(input.robot),
    0,
    JSON.stringify(input.trajectories),
  );
  let report;
  try {
    report = JSON.parse(fsm.checkReference(input.reference));
  } finally {
    fsm.free();
  }
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
  const session = await ort.InferenceSession.create(base + 'locomotion.onnx', {
    executionProviders: ['wasm'],
  });
  let worst = 0,
    failures = 0;
  try {
    for (const v of input.vectors) {
      const tensor = new ort.Tensor(
        'float32',
        new Float32Array(v.observation),
        [1, 415],
      );
      const out = await session.run({ [session.inputNames[0]]: tensor });
      const action = out[session.outputNames[0]].data as Float32Array;
      for (let i = 0; i < action.length; i++) {
        const error = Math.abs(action[i] - v.nativeAction[i]);
        worst = Math.max(worst, error);
        if (error > 1e-5 + 1e-4 * Math.abs(v.nativeAction[i])) failures++;
      }
      tensor.dispose();
      Object.values(out).forEach((t) => t.dispose());
    }
  } finally {
    await session.release();
  }
  return {
    native: input.nativeReport,
    web: report,
    inferenceFrames: input.vectors.length,
    inferenceMaxAbs: worst,
    inferenceFailures: failures,
    nativeVsRecordedMaxAbs: input.nativeVsRecordedMaxAbs,
  };
}

export async function microduckInferenceReference(
  vectors: Array<{ observation: number[]; action: number[] }>,
) {
  const manifest = await loadMicroduckMujocoManifest();
  const files = await fetchSimulationAssets(manifest);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
  const session = await ort.InferenceSession.create(
    files['alpha-walking.onnx'],
    { executionProviders: ['wasm'] },
  );
  let maxAbs = 0,
    failures = 0;
  try {
    for (const v of vectors) {
      const input = new ort.Tensor(
        'float32',
        new Float32Array(v.observation),
        [1, 61],
      );
      const out = await session.run({ [session.inputNames[0]]: input });
      const a = out[session.outputNames[0]].data as Float32Array;
      for (let i = 0; i < a.length; i++) {
        const error = Math.abs(a[i] - v.action[i]);
        maxAbs = Math.max(maxAbs, error);
        if (error > 1e-5 + 1e-4 * Math.abs(v.action[i])) failures++;
      }
      input.dispose();
      Object.values(out).forEach((t) => t.dispose());
    }
  } finally {
    await session.release();
  }
  return { frames: vectors.length, maxAbs, failures };
}

export async function jumperWalkingReference() {
  const { loadJumperWalkingManifest } =
    await import('@botlab/simulators-jumper');
  const { createJumperWalkingController } =
    await import('../../libs/simulators/jumper/src/lib/walking-controller');
  const mj = await loadMujoco({
    locateFile: (name) => (name.endsWith('.wasm') ? wasmUrl : name),
  });
  const manifest = await loadJumperWalkingManifest(),
    files = await fetchSimulationAssets(manifest);
  const world = new MujocoWorld(mj, manifest, files),
    controller = await createJumperWalkingController(manifest, files);
  const samples = [];
  const begin = performance.now();
  try {
    for (let tick = 0; tick < 12000; tick++) {
      const t = tick * 0.005;
      const out = await controller.infer(world.feedback(), {
        forward: t >= 5 && t < 15 ? 0.24 : 0,
        yaw: 0,
      });
      controller.accept(out);
      world.setControllerGains(out.kp, out.kd);
      world.setControllerTargets(out.targets);
      for (let i = 0; i < 5; i++) world.step();
      controller.validateFeedback(world.feedback());
      if (tick % 200 === 199) {
        const f = world.frame('walking', 0, 'running');
        samples.push({
          t: f.timeSeconds,
          p: f.rootPosition,
          q: f.rootQuaternion,
        });
      }
    }
  } finally {
    await controller.dispose();
    world.dispose();
  }
  return { samples, wallSeconds: (performance.now() - begin) / 1000 };
}
