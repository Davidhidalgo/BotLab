// Numerical preflight only. The separate performance check uses the real editor/worker/renderer.
/* oxlint-disable @nx/enforce-module-boundaries -- Test-only direct physical rollouts need internal world/controller access; this file is loaded only through Vite's dev test route, never imported by production. */
import loadMujoco from '@mujoco/mujoco';
import wasmUrl from '@mujoco/mujoco/mujoco.wasm?url';
import { MujocoWorld } from '../../libs/simulators/mujoco/src/lib/world';
import { fetchSimulationAssets } from '../../libs/simulators/mujoco/src/lib/assets';
import { createJumperWalkingController } from '../../libs/simulators/jumper/src/lib/walking-controller';
import { createWalkingController } from '../../libs/simulators/microduck-mujoco/src/lib/controller';
import { loadJumperWalkingManifest } from '@botlab/simulators-jumper';
import { loadMicroduckMujocoManifest } from '@botlab/simulators-microduck-mujoco';

export async function motionReference(
  robot: 'jumper' | 'microduck',
  steps: Array<{
    label: string;
    forward: number;
    yaw: number;
    durationSeconds: number;
  }>,
) {
  const mj = await loadMujoco({
    locateFile: (name) => (name.endsWith('.wasm') ? wasmUrl : name),
  });
  const manifest = await (robot === 'jumper'
    ? loadJumperWalkingManifest()
    : loadMicroduckMujocoManifest());
  const files = await fetchSimulationAssets(manifest);
  const world = new MujocoWorld(mj, manifest, files);
  const controller = await (
    robot === 'jumper' ? createJumperWalkingController : createWalkingController
  )(manifest, files);
  const results = [];
  try {
    for (let run = 0; run < 3; run++) {
      world.reset();
      controller.reset();
      const latencies: number[] = [],
        samples = [],
        commands = [];
      let minHeight = Infinity,
        maxTilt = 0,
        pathMeters = 0,
        previous = world.feedback().rootPosition;
      let commandIndex = 0,
        error: string | undefined;
      const begin = performance.now();
      try {
        for (const step of steps) {
          controller.validateVelocity(step);
          const from = world.frame('motion', run, 'running');
          const heading = (q: number[]) =>
            Math.atan2(
              2 * (q[0] * q[3] + q[1] * q[2]),
              1 - 2 * (q[2] ** 2 + q[3] ** 2),
            );
          let previousYaw = heading(from.rootQuaternion),
            yawRadians = 0;
          const count = Math.round(
            step.durationSeconds /
              (world.timestep * manifest.controller!.decimation),
          );
          for (let tick = 0; tick < count; tick++) {
            const start = performance.now();
            const out = await controller.infer(world.feedback(), step);
            latencies.push(performance.now() - start);
            controller.accept(out);
            world.setControllerGains(out.kp, out.kd);
            world.setControllerTargets(out.targets);
            for (let i = 0; i < manifest.controller!.decimation; i++) {
              world.step();
              const f = world.feedback();
              controller.validateFeedback(f);
              minHeight = Math.min(minHeight, f.rootPosition[2]);
              maxTilt = Math.max(
                maxTilt,
                Math.acos(
                  Math.max(
                    -1,
                    Math.min(
                      1,
                      1 - 2 * (f.quaternion[1] ** 2 + f.quaternion[2] ** 2),
                    ),
                  ),
                ),
              );
            }
            const f = world.frame('motion', run, 'running');
            const currentYaw = heading(f.rootQuaternion);
            yawRadians += Math.atan2(
              Math.sin(currentYaw - previousYaw),
              Math.cos(currentYaw - previousYaw),
            );
            previousYaw = currentYaw;
            pathMeters += Math.hypot(
              f.rootPosition[0] - previous[0],
              f.rootPosition[1] - previous[1],
            );
            previous = f.rootPosition;
            if (
              tick %
                Math.round(
                  1 / (world.timestep * manifest.controller!.decimation),
                ) ===
              0
            )
              samples.push({
                t: f.timeSeconds,
                p: f.rootPosition,
                q: f.rootQuaternion,
                commandIndex,
              });
          }
          const to = world.frame('motion', run, 'running');
          commands.push({
            ...step,
            start: from.timeSeconds,
            end: to.timeSeconds,
            from: from.rootPosition,
            to: to.rootPosition,
            yawRadians,
            forwardDisplacementMeters:
              (to.rootPosition[0] - from.rootPosition[0]) *
                Math.cos(heading(from.rootQuaternion)) +
              (to.rootPosition[1] - from.rootPosition[1]) *
                Math.sin(heading(from.rootQuaternion)),
            displacementMeters: Math.hypot(
              to.rootPosition[0] - from.rootPosition[0],
              to.rootPosition[1] - from.rootPosition[1],
            ),
          });
          commandIndex++;
        }
      } catch (cause) {
        error = String(cause);
      }
      latencies.sort((a, b) => a - b);
      results.push({
        run,
        error,
        commandIndex,
        simulatedSeconds: world.feedback().timeSeconds,
        wallSeconds: (performance.now() - begin) / 1000,
        minHeight,
        maxTiltRadians: maxTilt,
        pathMeters,
        inferenceP50Ms: latencies[Math.floor(latencies.length * 0.5)],
        inferenceP95Ms: latencies[Math.floor(latencies.length * 0.95)],
        commands,
        samples,
      });
    }
  } finally {
    await controller.dispose();
    world.dispose();
  }
  return {
    manifestId: manifest.id,
    modelRevision: manifest.revision,
    mujocoVersion: manifest.mujocoVersion,
    results,
  };
}

export async function measuredGoalReference(
  robot: 'jumper' | 'microduck',
  commands: import('@botlab/simulators-core').SimulationMotionGoal[],
) {
  const { MotionGoal } =
    await import('../../libs/simulators/mujoco/src/lib/motion-goal');
  const mj = await loadMujoco({
    locateFile: (name) => (name.endsWith('.wasm') ? wasmUrl : name),
  });
  const manifest = await (robot === 'jumper'
    ? loadJumperWalkingManifest()
    : loadMicroduckMujocoManifest());
  const files = await fetchSimulationAssets(manifest);
  const world = new MujocoWorld(mj, manifest, files);
  const controller = await (
    robot === 'jumper' ? createJumperWalkingController : createWalkingController
  )(manifest, files);
  const results = [];
  try {
    for (const command of commands) {
      const goal = new MotionGoal(command, world.feedback().timeSeconds);
      let result;
      let error: string | undefined;
      const start = world.feedback().timeSeconds;
      try {
        controller.validateVelocity(
          command.kind === 'distance'
            ? { forward: command.speed, yaw: 0 }
            : { forward: 0, yaw: command.speed },
        );
        while (!result) {
          const out = await controller.infer(world.feedback(), goal.intent());
          controller.accept(out);
          world.setControllerGains(out.kp, out.kd);
          world.setControllerTargets(out.targets);
          for (let i = 0; i < manifest.controller!.decimation; i++) {
            world.step();
            controller.validateFeedback(world.feedback());
            result = goal.update(world.feedback());
            if (result) break;
          }
        }
      } catch (cause) {
        error = String(cause);
      }
      results.push({
        command,
        result,
        error,
        duration: world.feedback().timeSeconds - start,
        end: world.feedback().rootPosition,
        quaternion: world.feedback().quaternion,
        intent: goal.intent(),
      });
      if (error) break;
    }
    return { robot, manifestId: manifest.id, results };
  } finally {
    await controller.dispose();
    world.dispose();
  }
}
