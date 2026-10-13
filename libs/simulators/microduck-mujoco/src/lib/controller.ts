import { MicroduckSkillClock } from './skill';
import type { SimulationSkill } from '@botlab/simulators-core';
import { MicroduckPostureTracker } from './posture';
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
  let postureSession: ort.InferenceSession | undefined;
  const skillSessions = new Map<SimulationSkill, ort.InferenceSession>();
  try {
    for (const [skill, name] of [
      ['kick-left', 'ball_kick_left.onnx'],
      ['kick-right', 'ball_kick_right.onnx'],
      ['ground-pick', 'alpha_ground_pick.onnx'],
    ] as const) {
      if (files[name]) {
        const loaded = await ort.InferenceSession.create(files[name], {
          executionProviders: ['wasm'],
        });
        skillSessions.set(skill, loaded);
        if (loaded.inputNames.length !== 1 || loaded.outputNames.length !== 1)
          throw new Error('Unexpected skill tensor interface.');
      }
    }
    if (files['alpha-sitstand.onnx']) {
      postureSession = await ort.InferenceSession.create(
        files['alpha-sitstand.onnx'],
        { executionProviders: ['wasm'] },
      );
      if (
        postureSession.inputNames.length !== 1 ||
        postureSession.outputNames.length !== 1
      )
        throw new Error('Unexpected posture tensor interface.');
    }
  } catch (error) {
    await session.release();
    await postureSession?.release();
    for (const loaded of skillSessions.values()) await loaded.release();
    throw error;
  }
  const posture = new MicroduckPostureTracker();
  let mode: 'walk' | 'posture' = 'walk';
  const skillClock = new MicroduckSkillClock();
  // Upstream constants use Float32Array, including the default pose rounding.
  const home = Array.from(new Float32Array(manifest.joints.map((j) => j.home)));
  let previous = Array<number>(14).fill(0);
  let headTarget = 0,
    headCurrent = 0;
  return {
    ...(skillSessions.size
      ? {
          setSkill(skill: SimulationSkill) {
            if (!skillSessions.has(skill))
              throw new Error('Skill is unavailable.');
            if (posture.state !== 'stand')
              throw new Error(
                'Levanta a MicroDuck antes de iniciar la habilidad.',
              );
            mode = 'walk';
            skillClock.begin(skill);
          },
          isSkillRunning: () => skillClock.active !== undefined,
          cancelSkill() {
            skillClock.cancel();
          },
        }
      : {}),
    ...(postureSession
      ? {
          setPosture(target: 'sit' | 'stand') {
            if (target !== 'sit' && target !== 'stand')
              throw new Error('Unsupported posture.');
            if (posture.state === target) return;
            mode = 'posture';
            previous = Array(14).fill(0);
            posture.begin(target);
          },
          getPosture: () => posture.state,
        }
      : {}),
    setHeadYaw(angleRadians) {
      if (posture.state !== 'stand')
        throw new Error('Levanta a MicroDuck antes de orientar la cabeza.');
      if (![0, -0.3, 0.3].includes(angleRadians))
        throw new Error('Unsupported head orientation.');
      headTarget = angleRadians;
    },
    validateFeedback(feedback) {
      const [w, x, y, z] = feedback.quaternion;
      if (
        feedback.rootPosition[2] < (mode === 'posture' ? 0.045 : 0.065) ||
        1 - 2 * (x * x + y * y) < 0.5 ||
        ![w, x, y, z].every(Number.isFinite)
      )
        throw new Error(
          'MicroDuck fell outside the validated walking envelope.',
        );
      posture.observe(feedback);
    },
    validateVelocity(velocity) {
      if (velocity.forward !== 0 || velocity.yaw !== 0) {
        if (posture.state !== 'stand')
          throw new Error(
            'MicroDuck está sentado o cambiando de postura. Añade levantarse antes de caminar.',
          );
        if (mode !== 'walk') {
          mode = 'walk';
          previous = Array(14).fill(0);
        }
      }
      if (
        velocity.forward < -0.2 ||
        velocity.forward > 0.25 ||
        Math.abs(velocity.yaw) > 1
      )
        throw new Error('MicroDuck velocity outside its validated range.');
    },
    async infer(feedback, velocity) {
      const nextHead = headCurrent + 0.2 * (headTarget - headCurrent);
      const obs = walkingObservation(
        feedback,
        home,
        previous,
        mode === 'posture'
          ? { forward: posture.target === 'sit' ? 1 : 0, yaw: 0 }
          : velocity,
        skillClock.active ? [0, 0, 0, 0] : [0, 0, nextHead, 0],
      );
      if (skillClock.active) obs.fill(0, 48);
      if (skillClock.active === 'ground-pick') {
        obs[48] = Math.cos(skillClock.phase());
        obs[49] = Math.sin(skillClock.phase());
      }
      const input = new ort.Tensor('float32', obs, [1, 61]);
      const selected = skillClock.active
        ? skillSessions.get(skillClock.active)!
        : mode === 'posture'
          ? postureSession!
          : session;
      const outputs = await selected.run({ [selected.inputNames[0]]: input });
      try {
        const tensor = outputs[selected.outputNames[0]];
        const action = Array.from(tensor.data as Float32Array);
        if (
          tensor.type !== 'float32' ||
          tensor.dims.join(',') !== '1,14' ||
          !action.every(Number.isFinite)
        )
          throw new Error('Invalid walking action tensor.');
        return {
          targets: action.map((v, i) => home[i] + v),
          state: [...action, nextHead],
        };
      } finally {
        input.dispose();
        for (const output of Object.values(outputs)) output.dispose();
      }
    },
    accept(output) {
      previous = output.state.slice(0, 14);
      headCurrent = output.state[14];
      skillClock.accept();
    },
    reset() {
      previous = Array<number>(14).fill(0);
      headTarget = headCurrent = 0;
      mode = 'walk';
      skillClock.cancel();
      posture.reset();
    },
    async dispose() {
      await session.release();
      await postureSession?.release();
      for (const loaded of skillSessions.values()) await loaded.release();
    },
  };
};
