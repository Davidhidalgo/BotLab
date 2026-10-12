import * as ort from 'onnxruntime-web/wasm';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import type { ControllerFactory } from '@botlab/simulators-mujoco';
import { walkingObservation } from './observations';

export const createWalkingController: ControllerFactory = async (
  manifest,
  files,
) => {
  const contract = manifest.controller;
  if (
    !contract ||
    contract.id !== 'microduck-alpha-walking' ||
    contract.decimation !== 4 ||
    contract.observationSize !== 61 ||
    contract.actionSize !== 14 ||
    manifest.actuation !== 'position'
  )
    throw new Error('Unsupported MicroDuck policy contract.');
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
  const session = await ort.InferenceSession.create(files[contract.model], {
    executionProviders: ['wasm'],
  });
  if (session.inputNames.length !== 1 || session.outputNames.length !== 1) {
    await session.release();
    throw new Error('Unexpected ONNX tensor interface.');
  }
  // Upstream constants use Float32Array, including the default pose rounding.
  const home = Array.from(new Float32Array(manifest.joints.map((j) => j.home)));
  let previous = Array<number>(14).fill(0);
  return {
    validateFeedback(feedback) {
      const [w, x, y, z] = feedback.quaternion;
      if (
        feedback.rootPosition[2] < 0.065 ||
        1 - 2 * (x * x + y * y) < 0.5 ||
        ![w, x, y, z].every(Number.isFinite)
      )
        throw new Error(
          'MicroDuck fell outside the validated walking envelope.',
        );
    },
    validateVelocity(velocity) {
      if (
        velocity.forward < -0.2 ||
        velocity.forward > 0.25 ||
        Math.abs(velocity.yaw) > 1
      )
        throw new Error('MicroDuck velocity outside its validated range.');
    },
    async infer(feedback, velocity) {
      const obs = walkingObservation(feedback, home, previous, velocity);
      const input = new ort.Tensor('float32', obs, [1, 61]);
      const outputs = await session.run({ [session.inputNames[0]]: input });
      try {
        const tensor = outputs[session.outputNames[0]];
        const action = Array.from(tensor.data as Float32Array);
        if (
          tensor.type !== 'float32' ||
          tensor.dims.join(',') !== '1,14' ||
          !action.every(Number.isFinite)
        )
          throw new Error('Invalid walking action tensor.');
        return { targets: action.map((v, i) => home[i] + v), state: action };
      } finally {
        input.dispose();
        for (const output of Object.values(outputs)) output.dispose();
      }
    },
    accept(output) {
      previous = [...output.state];
    },
    reset() {
      previous = Array<number>(14).fill(0);
    },
    dispose: () => session.release(),
  };
};
