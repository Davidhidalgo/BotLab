import * as ort from 'onnxruntime-web/wasm';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import type {
  ControllerFactory,
  ControllerOutput,
} from '@botlab/simulators-mujoco';
import { jumperWalkingAxes } from './walking-input';
interface Fsm {
  set_state(
    q: Float32Array,
    qd: Float32Array,
    tau: Float32Array,
    quat: Float32Array,
    gyro: Float32Array,
    now: number,
  ): void;
  setKey(key: string, down: boolean): boolean;
  mode(): string;
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
  let jumpSession: ort.InferenceSession | undefined;
  try {
    if (files['jump.onnx'])
      jumpSession = await ort.InferenceSession.create(files['jump.onnx'], {
        executionProviders: ['wasm'],
      });
  } catch (error) {
    await session.release();
    throw error;
  }
  let jump: { sent: boolean; entered: boolean } | undefined;
  let needsReset = false;
  let bodyPitch = 0;
  let fsm: Fsm | undefined,
    version = 0,
    awaiting = false;
  function reset(preservePose = false) {
    if (!preservePose) bodyPitch = 0;
    version++;
    jump = undefined;
    needsReset = false;
    fsm?.free();
    fsm = undefined;
  }
  const empty: ControllerOutput = { targets: [], state: [] };
  return {
    setBodyPitch(angle) {
      if (needsReset)
        throw new Error('Reinicia Jumper después de interrumpir un salto.');
      if (!Number.isFinite(angle) || Math.abs(angle) > Math.PI / 9)
        throw new Error('Unsupported body pitch.');
      bodyPitch = angle;
    },
    ...(jumpSession
      ? {
          setSkill(skill: import('@botlab/simulators-core').SimulationSkill) {
            if (needsReset)
              throw new Error(
                'Reinicia Jumper después de interrumpir un salto.',
              );
            if (bodyPitch !== 0)
              throw new Error('Nivela el cuerpo de Jumper antes de saltar.');
            if (skill !== 'jump') throw new Error('Unsupported Jumper skill.');
            jump = { sent: false, entered: false };
          },
          isSkillRunning: () => jump !== undefined,
          cancelSkill() {
            if (jump) {
              jump = undefined;
              needsReset = true;
            }
          },
        }
      : {}),
    turnProfile: 'constant',
    turnStopFraction: 0.1,
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
      if (needsReset)
        throw new Error('Reinicia Jumper después de interrumpir un salto.');
      jumperWalkingAxes(v);
    },
    async infer(feedback, velocity) {
      if (needsReset)
        throw new Error('Reinicia Jumper después de interrumpir un salto.');
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
      const axes = jumperWalkingAxes(velocity);
      current.setAxis('Ly', axes.Ly);
      current.setAxis('Rx', axes.Rx);
      for (const axis of ['Lx', 'LT', 'RT']) current.setAxis(axis, 0);
      current.setAxis('Ry', -bodyPitch / (Math.PI / 9));
      current.setKey('key_space', !!jump && !jump.sent);
      if (jump) jump.sent = true;
      current.padFrame(now);
      current.set_command(0, 0, 0, now);
      const mode = current.tick(now);
      if (jump && current.mode() === 'jump') jump.entered = true;
      const jumpDone = jump?.entered && current.mode() === 'locomotion';
      if (mode) {
        if (mode !== 'locomotion' && !(mode === 'jump' && jumpSession))
          throw new Error(`Unexposed Jumper mode: ${mode}`);
        const selected = mode === 'jump' ? jumpSession! : session;
        const tensor = new ort.Tensor(
          'float32',
          current.observation().slice(),
          [1, mode === 'jump' ? 167 : 415],
        );
        awaiting = true;
        try {
          const out = await selected.run({ [selected.inputNames[0]]: tensor });
          try {
            if (token !== version) return empty;
            const action = out[selected.outputNames[0]];
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
        state: [jumpDone ? 1 : 0],
      };
    },
    accept(output) {
      if (output.state[0] === 1) jump = undefined;
    },
    reset,
    invalidate() {
      if (awaiting) {
        // Repeated pause/stop requests must not clear an interrupted-skill latch.
        const interrupted = needsReset || !!jump;
        reset(true);
        if (interrupted) needsReset = true;
      }
    },
    async dispose() {
      reset();
      await session.release();
      await jumpSession?.release();
    },
  };
};
