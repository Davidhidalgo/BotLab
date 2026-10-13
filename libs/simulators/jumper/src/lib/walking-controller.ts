import type { GripperAction } from '@botlab/model';
import { JumperGripper } from './gripper';
import {
  jumperPerformances,
  isJumperPerformance,
  type JumperPerformance,
} from './performances';
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
  const performanceSessions = new Map<
    string,
    { session: ort.InferenceSession; observations: number; actions: number }
  >();
  try {
    for (const meta of Object.values(jumperPerformances)) {
      if (!files[meta.file]) continue;
      const loaded = await ort.InferenceSession.create(files[meta.file], {
        executionProviders: ['wasm'],
      });
      performanceSessions.set(meta.mode, {
        session: loaded,
        observations: meta.observations,
        actions: meta.actions,
      });
      if (loaded.inputNames.length !== 1 || loaded.outputNames.length !== 1)
        throw new Error('Unexpected performance policy interface.');
    }
    if (files['claw_left.onnx']) {
      const clawSession = await ort.InferenceSession.create(
        files['claw_left.onnx'],
        { executionProviders: ['wasm'] },
      );
      for (const mode of ['claw_left', 'claw_right'])
        performanceSessions.set(mode, {
          session: clawSession,
          observations: 407,
          actions: 16,
        });
      if (
        clawSession.inputNames.length !== 1 ||
        clawSession.outputNames.length !== 1
      )
        throw new Error('Unexpected claw policy interface.');
    }
  } catch (error) {
    await session.release();
    for (const loaded of new Set(
      Array.from(performanceSessions.values(), (v) => v.session),
    ))
      await loaded.release();
    throw error;
  }
  let active:
    | { name: JumperPerformance; sent: boolean; entered: boolean }
    | undefined;
  const gripper = new JumperGripper();
  let gripperMoving = false;
  let needsReset = false;
  let bodyPitch = 0;
  let fsm: Fsm | undefined,
    version = 0,
    awaiting = false;
  function reset(preservePose = false) {
    if (!preservePose) bodyPitch = 0;
    version++;
    active = undefined;
    gripper.reset();
    gripperMoving = false;
    needsReset = false;
    fsm?.free();
    fsm = undefined;
  }
  const empty: ControllerOutput = { targets: [], state: [] };
  return {
    ...(performanceSessions.has('claw_left')
      ? {
          setGripper(action: GripperAction) {
            if (needsReset)
              throw new Error(
                'Reinicia Jumper después de interrumpir una habilidad.',
              );
            if (bodyPitch !== 0 || active)
              throw new Error(
                'Nivela el cuerpo y termina la habilidad antes de usar la pinza.',
              );
            const target = gripper.target(action);
            gripperMoving = true;
            return target;
          },
          isGripperReady: () => fsm?.mode() === gripper.desiredMode,
          completeGripper() {
            gripperMoving = false;
            gripper.complete();
          },
          cancelGripper() {
            if (gripperMoving) {
              gripperMoving = false;
              needsReset = true;
            }
          },
        }
      : {}),
    setBodyPitch(angle) {
      if (gripper.side)
        throw new Error('Recoge la pinza antes de inclinar el cuerpo.');
      if (needsReset)
        throw new Error(
          'Reinicia Jumper después de interrumpir una habilidad.',
        );
      if (!Number.isFinite(angle) || Math.abs(angle) > Math.PI / 9)
        throw new Error('Unsupported body pitch.');
      bodyPitch = angle;
    },
    ...(performanceSessions.size
      ? {
          setSkill(skill: import('@botlab/simulators-core').SimulationSkill) {
            if (gripper.side)
              throw new Error(
                'Recoge la pinza antes de iniciar una habilidad.',
              );
            if (needsReset)
              throw new Error(
                'Reinicia Jumper después de interrumpir una habilidad.',
              );
            if (bodyPitch !== 0)
              throw new Error(
                'Nivela el cuerpo de Jumper antes de iniciar la habilidad.',
              );
            if (
              !isJumperPerformance(skill) ||
              !performanceSessions.has(jumperPerformances[skill].mode)
            )
              throw new Error('Unsupported Jumper skill.');
            active = { name: skill, sent: false, entered: false };
          },
          isSkillRunning: () => active !== undefined,
          cancelSkill() {
            if (active) {
              active = undefined;
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
      if (gripper.side && (v.forward !== 0 || v.yaw !== 0))
        throw new Error('Recoge la pinza antes de caminar o girar.');
      if (needsReset)
        throw new Error(
          'Reinicia Jumper después de interrumpir una habilidad.',
        );
      jumperWalkingAxes(v);
    },
    async infer(feedback, velocity) {
      if (needsReset)
        throw new Error(
          'Reinicia Jumper después de interrumpir una habilidad.',
        );
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
      if (gripper.side)
        current.setAxis(
          gripper.side === 'left' ? 'LT' : 'RT',
          gripper.closed ? 1 : 0,
        );
      for (const { key, down } of gripper.keys()) current.setKey(key, down);
      const requested = active ? jumperPerformances[active.name] : undefined;
      current.setKey('key_left_ctrl', requested?.ctrl ?? false);
      for (const key of ['key_space', 'key_1', 'key_2', 'key_3', 'key_4'])
        current.setKey(key, !!active && !active.sent && requested?.key === key);
      if (active) active.sent = true;
      current.padFrame(now);
      current.set_command(0, 0, 0, now);
      const mode = current.tick(now);
      if (active && current.mode() === requested?.mode) active.entered = true;
      const performanceDone =
        active?.entered && current.mode() === 'locomotion';
      if (mode) {
        const loaded =
          mode === 'locomotion'
            ? { session, observations: 415, actions: 20 }
            : performanceSessions.get(mode);
        if (!loaded) throw new Error(`Unexposed Jumper mode: ${mode}`);
        const selected = loaded.session;
        const tensor = new ort.Tensor(
          'float32',
          current.observation().slice(),
          [1, loaded.observations],
        );
        awaiting = true;
        try {
          const out = await selected.run({ [selected.inputNames[0]]: tensor });
          try {
            if (token !== version) return empty;
            const action = out[selected.outputNames[0]];
            if (
              action.type !== 'float32' ||
              action.dims.join(',') !== `1,${loaded.actions}` ||
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
        state: [performanceDone ? 1 : 0],
      };
    },
    accept(output) {
      if (output.state[0] === 1) active = undefined;
    },
    reset,
    invalidate() {
      if (awaiting) {
        // Repeated pause/stop requests must not clear an interrupted-skill latch.
        const interrupted =
          needsReset || !!active || !!gripper.side || gripperMoving;
        reset(true);
        if (interrupted) needsReset = true;
      }
    },
    async dispose() {
      reset();
      await session.release();
      for (const loaded of new Set(
        Array.from(performanceSessions.values(), (v) => v.session),
      ))
        await loaded.release();
    },
  };
};
