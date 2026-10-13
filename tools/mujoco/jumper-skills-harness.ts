/* oxlint-disable @nx/enforce-module-boundaries -- Probe official bundle modes without exposing product capabilities. */
import loadMujoco from '@mujoco/mujoco';
import wasmUrl from '@mujoco/mujoco/mujoco.wasm?url';
import * as ort from 'onnxruntime-web/wasm';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { MujocoWorld } from '../../libs/simulators/mujoco/src/lib/world';
import { fetchSimulationAssets } from '../../libs/simulators/mujoco/src/lib/assets';
import { loadJumperWalkingManifest } from '@botlab/simulators-jumper';
export async function probeJumperSkills(names?: string[], complete = false) {
  const mj = await loadMujoco({
    locateFile: (name) => (name.endsWith('.wasm') ? wasmUrl : name),
  });
  const manifest = await loadJumperWalkingManifest();
  const files = await fetchSimulationAssets(manifest);
  const config = JSON.parse(
    new TextDecoder().decode(files['controller-config.json']),
  );
  const url = URL.createObjectURL(
    new Blob([files['controller.js'].slice().buffer], {
      type: 'text/javascript',
    }),
  );
  const binding = await import(/* @vite-ignore */ url);
  URL.revokeObjectURL(url);
  await binding.default({
    module_or_path: files['controller.wasm'].slice().buffer,
  });
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
  const modes = await (
    await fetch('/simulation-assets/jumper-walking/probes/modes.json')
  ).json();
  const sessions = new Map<string, ort.InferenceSession>();
  const results = [];
  try {
    for (const [name, key, ctrl] of [
      ['jump', 'key_space', false],
      ['jump-cold', 'key_space', false],
      ['claw_left', 'key_v', false],
      ['claw_right', 'key_b', false],
      ['gesture_hello', 'key_1', false],
      ['gesture_bow', 'key_2', false],
      ['gesture_paw', 'key_3', false],
      ['gesture_salute', 'key_4', false],
      ['dance_brazilian', 'key_2', true],
      ['dance_crab', 'key_1', true],
      ['dance_maze', 'key_3', true],
      ['dance_dream_wings', 'key_4', true],
      ['pitch-positive', '', false],
      ['pitch-negative', '', false],
    ] as const) {
      if (names && !names.includes(name)) continue;
      const clawCycle = complete && name.startsWith('claw');
      const activationTick = name === 'jump-cold' ? 0 : 100;
      const duration = config.contracts[name]?.reference?.duration;
      const totalTicks = clawCycle
        ? 1800
        : complete && duration
          ? activationTick + Math.ceil((duration + 4) / 0.005)
          : 900;
      const world = new MujocoWorld(mj, manifest, files);
      const fsm = new binding.WebFsm(
        config.toml,
        JSON.stringify(config.contracts),
        JSON.stringify(config.robot),
        0,
        JSON.stringify(config.trajectories),
      );
      const counts: Record<string, number> = {};
      let minHeight = Infinity,
        maxTilt = 0,
        maxHeight = 0;
      let failure;
      let contactFreeSeconds = 0,
        maxContactFreeSeconds = 0;
      const phases = [];
      try {
        for (let tick = 0; tick < totalTicks; tick++) {
          const f = world.feedback(),
            now = Math.round(f.timeSeconds * 1e6);
          fsm.set_state(
            new Float32Array(f.positions),
            new Float32Array(f.velocities),
            new Float32Array(f.efforts),
            new Float32Array(f.quaternion),
            new Float32Array(f.angularVelocity),
            now,
          );
          for (const axis of ['Ly', 'Lx', 'Ry', 'Rx', 'LT', 'RT'])
            fsm.setAxis(axis, 0);
          if (tick >= 100 && tick < 600 && name.startsWith('pitch'))
            fsm.setAxis('Ry', name === 'pitch-positive' ? -0.3 : 0.3);
          if (clawCycle)
            fsm.setAxis(
              name === 'claw_left' ? 'LT' : 'RT',
              tick >= 400 && tick < 800 ? 1 : 0,
            );
          if (clawCycle && tick === 1200) fsm.setKey(key, true);
          if (clawCycle && tick === 1201) fsm.setKey(key, false);
          if (tick === activationTick) {
            if (ctrl) fsm.setKey('key_left_ctrl', true);
            if (key) fsm.setKey(key, true);
          }
          if (tick === 101 && key) fsm.setKey(key, false);
          if (!complete && tick === 599 && name.startsWith('gesture'))
            fsm.setKey('key_left_ctrl', true);
          if (!complete && tick === 600) {
            if (name.startsWith('gesture')) fsm.setKey('key_left_ctrl', false);
            if (ctrl) fsm.setKey('key_left_ctrl', false);
            else if (name.startsWith('claw')) fsm.setKey(key, true);
          }
          if (tick === 601 && key) fsm.setKey(key, false);
          fsm.padFrame(now);
          fsm.set_command(0, 0, 0, now);
          const mode = fsm.tick(now);
          if (mode) {
            const meta = modes[mode];
            if (!meta) throw new Error('Unknown mode ' + mode);
            let session = sessions.get(meta.path);
            if (!session) {
              const data = await (
                await fetch(
                  '/simulation-assets/jumper-walking/probes/' + meta.path,
                )
              ).arrayBuffer();
              const digest = Array.from(
                new Uint8Array(await crypto.subtle.digest('SHA-256', data)),
              )
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('');
              if (digest !== meta.sha256) throw new Error('Policy mismatch');
              session = await ort.InferenceSession.create(data, {
                executionProviders: ['wasm'],
              });
              sessions.set(meta.path, session);
            }
            const obs = fsm.observation().slice();
            const input = new ort.Tensor('float32', obs, [1, meta.observation]);
            const out = await session.run({ [session.inputNames[0]]: input });
            fsm.resume(out[session.outputNames[0]].data as Float32Array);
            input.dispose();
            Object.values(out).forEach((o) => o.dispose());
          }
          counts[fsm.mode()] = (counts[fsm.mode()] ?? 0) + 1;
          world.setControllerGains(Array.from(fsm.kp()), Array.from(fsm.kd()));
          world.setControllerTargets(Array.from(fsm.positions()));
          for (let j = 0; j < 5; j++) world.step();
          const after = world.feedback();
          const tilt = Math.acos(
            Math.max(
              -1,
              Math.min(
                1,
                1 - 2 * (after.quaternion[1] ** 2 + after.quaternion[2] ** 2),
              ),
            ),
          );
          if (world.contactCount() === 0) {
            contactFreeSeconds += world.timestep * 5;
            maxContactFreeSeconds = Math.max(
              maxContactFreeSeconds,
              contactFreeSeconds,
            );
          } else contactFreeSeconds = 0;
          minHeight = Math.min(minHeight, after.rootPosition[2]);
          maxHeight = Math.max(maxHeight, after.rootPosition[2]);
          maxTilt = Math.max(maxTilt, tilt);
          if (
            (clawCycle
              ? [99, 399, 799, 1199, 1799]
              : [99, totalTicks - 301, totalTicks - 1]
            ).includes(tick)
          )
            phases.push({ tick, mode: fsm.mode(), feedback: after });
          if (after.rootPosition[2] < 0.06 || tilt > 0.873)
            throw new Error('Outside validated envelope');
        }
        if (complete && (!counts[name] || fsm.mode() !== 'locomotion'))
          throw new Error(
            'Expected mode did not complete and return to locomotion.',
          );
      } catch (error) {
        failure = String(error);
      } finally {
        results.push({
          name,
          complete,
          referenceDurationSeconds: duration,
          simulatedSeconds: world.feedback().timeSeconds,
          minHeight,
          maxHeight,
          maxTilt,
          counts,
          maxContactFreeSeconds,
          phases,
          failure,
        });
        world.dispose();
        fsm.free();
      }
    }
    return results;
  } finally {
    for (const session of sessions.values()) await session.release();
  }
}
