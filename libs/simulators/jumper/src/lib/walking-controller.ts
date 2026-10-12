import * as ort from 'onnxruntime-web/wasm';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import type {
  ControllerFactory,
  ControllerOutput,
} from '@botlab/simulators-mujoco';
interface Fsm {
  set_state(
    q: Float32Array,
    qd: Float32Array,
    tau: Float32Array,
    quat: Float32Array,
    gyro: Float32Array,
    now: number,
  ): void;
  setAxis(axis: string, value: number): void;
  padFrame(now: number): void;
  set_command(x: number, y: number, yaw: number, now: number): void;
  tick(now: number): string | undefined;
  observation(): Float32Array;
  resume(a: Float32Array): void;
  positions(): Float32Array;
  kp(): Float32Array;
  kd(): Float32Array;
  free(): void;
}
export const createJumperWalkingController: ControllerFactory = async (
  manifest,
  files,
) => {
  if (
    manifest.controller?.id !== 'jumper-locomotion' ||
    manifest.controller.decimation !== 5 ||
    manifest.joints.length !== 22
  )
    throw new Error('Unsupported Jumper controller.');
  const config = JSON.parse(
    new TextDecoder().decode(files['controller-config.json']),
  );
  const url = URL.createObjectURL(
    new Blob([files['controller.js'].slice().buffer], {
      type: 'text/javascript',
    }),
  );
  let binding: {
    default(options: unknown): Promise<void>;
    WebFsm: new (...args: unknown[]) => Fsm;
  };
  try {
    binding = await import(/* @vite-ignore */ url);
  } finally {
    URL.revokeObjectURL(url);
  }
  await binding.default({
    module_or_path: files['controller.wasm'].slice().buffer,
  });
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
  const session = await ort.InferenceSession.create(files['locomotion.onnx'], {
    executionProviders: ['wasm'],
  });
  let fsm: Fsm | undefined,
    version = 0,
    awaiting = false;
  function reset() {
    version++;
    fsm?.free();
    fsm = undefined;
  }
  const empty: ControllerOutput = { targets: [], state: [] };
  return {
    validateFeedback(f) {
      const [w, x, y, z] = f.quaternion;
      if (
        f.rootPosition[2] < 0.065 ||
        1 - 2 * (x * x + y * y) < Math.cos(0.873) ||
        ![w, x, y, z].every(Number.isFinite)
      )
        throw new Error('Jumper left the validated walking envelope.');
    },
    validateVelocity(v) {
      if (v.forward < 0 || v.forward > 0.24 || v.yaw !== 0)
        throw new Error(
          'Jumper currently supports forward 0–0.24 m/s and zero yaw only.',
        );
    },
    async infer(feedback, velocity) {
      const now = Math.round(feedback.timeSeconds * 1e6),
        token = version;
      fsm ??= new binding.WebFsm(
        config.toml,
        JSON.stringify(config.contracts),
        JSON.stringify(config.robot),
        now,
        JSON.stringify(config.trajectories),
      );
      const current = fsm;
      current.set_state(
        new Float32Array(feedback.positions),
        new Float32Array(feedback.velocities),
        new Float32Array(feedback.efforts),
        new Float32Array(feedback.quaternion),
        new Float32Array(feedback.angularVelocity),
        now,
      );
      // This bundle maps Ly with sign -1 and full travel to ±0.8 m/s. No keyboard/joystick shares ownership.
      current.setAxis('Ly', -velocity.forward / 0.8);
      for (const axis of ['Lx', 'Rx', 'Ry', 'LT', 'RT'])
        current.setAxis(axis, 0);
      current.padFrame(now);
      current.set_command(0, 0, 0, now);
      const mode = current.tick(now);
      if (mode) {
        if (mode !== 'locomotion')
          throw new Error(`Unexposed Jumper mode: ${mode}`);
        const tensor = new ort.Tensor(
          'float32',
          current.observation().slice(),
          [1, 415],
        );
        awaiting = true;
        try {
          const out = await session.run({ [session.inputNames[0]]: tensor });
          try {
            if (token !== version) return empty;
            const action = out[session.outputNames[0]];
            if (
              action.type !== 'float32' ||
              action.dims.join(',') !== '1,20' ||
              !Array.from(action.data as Float32Array).every(Number.isFinite)
            )
              throw new Error('Invalid Jumper action.');
            current.resume(action.data as Float32Array);
          } finally {
            Object.values(out).forEach((t) => t.dispose());
          }
        } finally {
          awaiting = false;
          tensor.dispose();
        }
      }
      return {
        targets: Array.from(current.positions()),
        kp: Array.from(current.kp()),
        kd: Array.from(current.kd()),
        state: [],
      };
    },
    accept() {},
    reset,
    invalidate() {
      if (awaiting) reset();
    },
    async dispose() {
      reset();
      await session.release();
    },
  };
};
