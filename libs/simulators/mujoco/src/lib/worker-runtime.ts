import { RestGoal } from './rest-goal';
import loadMujoco from '@mujoco/mujoco';
import wasmUrl from '@mujoco/mujoco/mujoco.wasm?url';
import type {
  SimulationFrame,
  SimulationJointCommand,
  SimulationVelocityCommand,
} from '@botlab/simulators-core';
import { fetchSimulationAssets } from './assets';
import { MujocoWorld } from './world';
import type { WorkerRequest, WorkerResponse } from './protocol';
import type { ControllerFactory, SimulationController } from './controller';
import { SimulationClock } from './simulation-clock';
import { MotionGoal } from './motion-goal';

/** Shared physics, scheduling and cancellation; robot code is supplied by its worker entry. */
export function installSimulationWorker(createController?: ControllerFactory) {
  const scope = globalThis as unknown as {
    onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
    postMessage(message: WorkerResponse): void;
  };
  let world: MujocoWorld | undefined;
  let controller: SimulationController | undefined;
  let sessionId = '',
    generation = 0,
    epoch = 0;
  let state: SimulationFrame['state'] = 'ready';
  let loading = false,
    cycling = false;
  let jointCommand:
    | {
        request: WorkerRequest;
        command: SimulationJointCommand;
        index: number;
        start: number;
        settled: number;
      }
    | undefined;
  let velocityCommand:
    | {
        request: WorkerRequest;
        command: SimulationVelocityCommand;
        start: number;
        origin: number[];
        yaw: number;
      }
    | undefined;
  let postureCommand:
    | { request: WorkerRequest; target: 'sit' | 'stand'; start: number }
    | undefined;
  let restGoal: { request: WorkerRequest; goal: RestGoal } | undefined;
  let motionGoal: { request: WorkerRequest; goal: MotionGoal } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastPublish = 0;
  let clock: SimulationClock;
  function frame() {
    if (!world) throw new Error('Load a simulation first.');
    return world.frame(sessionId, generation, state);
  }
  function reply(request: WorkerRequest, data: Partial<WorkerResponse> = {}) {
    scope.postMessage({
      sessionId: request.sessionId,
      generation: request.generation,
      id: request.id,
      ...data,
    });
  }
  function yaw(f: SimulationFrame) {
    const [w, x, y, z] = f.rootQuaternion;
    return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  }
  function cancelCommand() {
    if (jointCommand)
      reply(jointCommand.request, { error: 'Command cancelled.' });
    if (velocityCommand)
      reply(velocityCommand.request, { error: 'Command cancelled.' });
    if (restGoal) reply(restGoal.request, { error: 'Command cancelled.' });
    restGoal = undefined;
    if (postureCommand)
      reply(postureCommand.request, { error: 'Command cancelled.' });
    postureCommand = undefined;
    if (motionGoal) reply(motionGoal.request, { error: 'Command cancelled.' });
    motionGoal = undefined;
    jointCommand = undefined;
    velocityCommand = undefined;
    world?.hold();
  }
  function halt() {
    clearTimeout(timer);
    timer = undefined;
    epoch++;
    controller?.invalidate?.();
    state = 'paused';
  }
  function inspectCommand() {
    const current = frame();
    if (controller) controller.validateFeedback(world!.feedback());
    if (restGoal) {
      const active = restGoal;
      try {
        const result = active.goal.update(world!.feedback());
        if (result) {
          restGoal = undefined;
          reply(active.request, { result });
        }
      } catch (error) {
        restGoal = undefined;
        halt();
        reply(active.request, {
          error: error instanceof Error ? error.message : String(error),
          frame: frame(),
        });
      }
    }
    if (postureCommand) {
      const active = postureCommand;
      const observed = controller?.getPosture?.();
      if (observed === active.target) {
        postureCommand = undefined;
        reply(active.request, {
          result: {
            status: 'completed',
            evidence: 'simulator',
            level: 'closed-loop-policy',
            timeSeconds: current.timeSeconds,
            posture: {
              target: active.target,
              observed,
              heightMeters: current.rootPosition[2],
            },
          },
        });
      } else if (current.timeSeconds - active.start >= 10) {
        postureCommand = undefined;
        halt();
        reply(active.request, {
          error: 'La postura no se estabilizó antes del tiempo máximo.',
          frame: frame(),
        });
      }
    }
    if (motionGoal) {
      const active = motionGoal;
      try {
        const result = active.goal.update(world!.feedback());
        if (result) {
          motionGoal = undefined;
          reply(active.request, { result });
        }
      } catch (error) {
        motionGoal = undefined;
        world!.hold();
        halt();
        reply(active.request, {
          frame: frame(),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (jointCommand) {
      const error = Math.abs(
        current.positions[jointCommand.index] -
          jointCommand.command.positionRadians,
      );
      const settled =
        error <= jointCommand.command.toleranceRadians &&
        Math.abs(current.velocities[jointCommand.index]) <= 0.05;
      jointCommand.settled = settled
        ? jointCommand.settled + world!.timestep
        : 0;
      if (jointCommand.settled >= 0.1) {
        reply(jointCommand.request, {
          result: {
            status: 'completed',
            evidence: 'simulator',
            level: 'physics',
            finalErrorRadians: error,
            ...(controller && jointCommand.command.joint === 'head_yaw'
              ? {
                  headYaw: {
                    targetRadians: jointCommand.command.positionRadians,
                    observedRadians: current.positions[jointCommand.index],
                  },
                }
              : {}),
            timeSeconds: current.timeSeconds,
          },
        });
        jointCommand = undefined;
      } else if (
        current.timeSeconds - jointCommand.start >=
        jointCommand.command.timeoutSeconds
      ) {
        reply(jointCommand.request, {
          error: `Joint did not settle before timeout (error ${error.toFixed(4)} rad).`,
        });
        jointCommand = undefined;
        world!.hold();
        halt();
      }
    }
    if (
      velocityCommand &&
      current.timeSeconds - velocityCommand.start + 1e-9 >=
        velocityCommand.command.durationSeconds
    ) {
      const active = velocityCommand;
      velocityCommand = undefined;
      reply(active.request, {
        result: {
          status: 'completed',
          evidence: 'simulator',
          level: 'closed-loop-policy',
          timeSeconds: current.timeSeconds,
          displacementMeters: Math.hypot(
            current.rootPosition[0] - active.origin[0],
            current.rootPosition[1] - active.origin[1],
          ),
          yawRadians: Math.atan2(
            Math.sin(yaw(current) - active.yaw),
            Math.cos(yaw(current) - active.yaw),
          ),
        },
      });
      // Subsequent ticks infer with a zero twist, keeping the balance policy active.
    }
  }
  async function advance(token: number) {
    if (!world) return;
    const steps = controller
      ? world.manifest.controller!.decimation
      : Math.max(1, Math.floor(0.008 / world.timestep));
    if (controller) {
      const output = await controller.infer(
        world.feedback(),
        motionGoal?.goal.intent() ??
          velocityCommand?.command ?? { forward: 0, yaw: 0 },
      );
      if (token !== epoch) return;
      controller.accept(output);
      world.setControllerGains(output.kp, output.kd);
      world.setControllerTargets(output.targets);
    }
    for (let step = 0; step < steps && token === epoch; step++) {
      world.step();
      inspectCommand();
    }
  }
  async function cycle() {
    if (!world || state !== 'running' || cycling) return;
    cycling = true;
    const token = epoch,
      begin = performance.now();
    try {
      const due = clock.dueSteps(begin);
      for (let i = 0; i < due; i++) {
        await advance(token);
        if (token !== epoch) return;
        clock.advanced();
        // Yield to commands/cancellation even when inference is expensive.
        if (performance.now() - begin >= 8) break;
      }
      if (performance.now() - lastPublish >= 33) {
        scope.postMessage({ sessionId, generation, frame: frame() });
        lastPublish = performance.now();
      }
    } catch (error) {
      if (token !== epoch) return;
      halt();
      cancelCommand();
      state = 'error';
      scope.postMessage({
        sessionId,
        generation,
        error: String(error),
        frame: frame(),
      });
    } finally {
      cycling = false;
      if (state === 'running') {
        timer = setTimeout(() => void cycle(), clock.delay(performance.now()));
      }
    }
  }
  scope.onmessage = async ({ data: request }) => {
    try {
      if (request.operation === 'load') {
        if (world || loading || !request.manifest)
          throw new Error('This worker owns exactly one session.');
        loading = true;
        sessionId = request.sessionId;
        generation = request.generation;
        const [mj, files] = await Promise.all([
          loadMujoco({
            locateFile: (name: string) =>
              name.endsWith('.wasm') ? wasmUrl : name,
          }),
          fetchSimulationAssets(request.manifest),
        ]);
        world = new MujocoWorld(mj, request.manifest, files);
        if (request.manifest.controller) {
          if (!createController)
            throw new Error(
              'This worker does not support the requested controller.',
            );
          controller = await createController(request.manifest, files);
        }
        clock = new SimulationClock(
          controller
            ? world.timestep * world.manifest.controller!.decimation * 1000
            : Math.max(1, Math.floor(0.008 / world.timestep)) *
                world.timestep *
                1000,
        );
        loading = false;
        reply(request, { geometry: world.geometry(), frame: frame() });
        return;
      }
      if (!world || request.sessionId !== sessionId || loading)
        throw new Error('Session is not ready.');
      if (request.operation === 'reset') {
        if (request.generation !== generation + 1)
          throw new Error('Invalid reset generation.');
        halt();
        cancelCommand();
        generation = request.generation;
        world.reset();
        controller?.reset();
        state = 'ready';
      } else {
        if (request.generation !== generation)
          throw new Error('Stale session generation.');
        switch (request.operation) {
          case 'start':
            if (state === 'error')
              throw new Error('Reset after a physics error.');
            if (state !== 'running') {
              clock.reset(performance.now());
              state = 'running';
              void cycle();
            }
            break;
          case 'pause':
            halt();
            break;
          case 'stop':
            halt();
            cancelCommand();
            break;
          case 'step':
            if (
              state === 'running' ||
              restGoal ||
              postureCommand ||
              jointCommand ||
              velocityCommand ||
              motionGoal ||
              state === 'error' ||
              cycling
            )
              throw new Error('Pause an idle session before stepping.');
            if (controller) {
              cycling = true;
              try {
                await advance(epoch);
              } finally {
                cycling = false;
              }
            } else world.step();
            break;
          case 'command': {
            if (
              restGoal ||
              postureCommand ||
              jointCommand ||
              velocityCommand ||
              motionGoal ||
              state === 'error'
            )
              throw new Error('Session already has a command or needs reset.');
            const c = request.command;
            if (c && 'kind' in c && c.kind === 'observe-posture') {
              if (!controller?.getPosture)
                throw new Error('Posture observation unavailable.');
              halt();
              controller.validateFeedback(world.feedback());
              reply(request, {
                result: {
                  status: 'completed',
                  evidence: 'simulator',
                  level: 'physics',
                  timeSeconds: frame().timeSeconds,
                  postureObservation: {
                    state: controller.getPosture(),
                    capturedAtSeconds: frame().timeSeconds,
                  },
                },
                frame: frame(),
              });
              return;
            }
            if (c && 'kind' in c && c.kind === 'proximity') {
              halt();
              const proximity = world.proximity(c.thresholdMeters);
              reply(request, {
                result: {
                  status: 'completed',
                  evidence: 'simulator',
                  level: 'physics',
                  timeSeconds: frame().timeSeconds,
                  proximity,
                },
                frame: frame(),
              });
              return;
            }
            if (c && 'kind' in c && c.kind === 'rest') {
              if (!controller)
                throw new Error(
                  'Rest observation requires a balancing controller.',
                );
              halt();
              restGoal = { request, goal: new RestGoal(frame().timeSeconds) };
            } else if (c && 'kind' in c && c.kind === 'posture') {
              if (
                !controller?.setPosture ||
                !['sit', 'stand'].includes(c.posture)
              )
                throw new Error('Posture is unavailable for this robot.');
              halt();
              controller.setPosture(c.posture);
              postureCommand = {
                request,
                target: c.posture,
                start: frame().timeSeconds,
              };
            } else if (c && 'kind' in c && c.kind === 'head-yaw') {
              if (
                !controller?.setHeadYaw ||
                ![0, -0.3, 0.3].includes(c.angleRadians)
              )
                throw new Error(
                  'Head orientation is not available for this robot.',
                );
              const index = world.manifest.joints.findIndex(
                (j) => j.name === 'head_yaw',
              );
              if (index < 0) throw new Error('Missing head joint.');
              halt();
              controller.setHeadYaw(c.angleRadians);
              jointCommand = {
                request,
                index,
                command: {
                  joint: 'head_yaw',
                  positionRadians: c.angleRadians,
                  toleranceRadians: 0.07,
                  timeoutSeconds: 8,
                },
                start: frame().timeSeconds,
                settled: 0,
              };
            } else if (
              c &&
              'kind' in c &&
              (c.kind === 'distance' || c.kind === 'turn')
            ) {
              if (!controller)
                throw new Error(
                  'Este robot no dispone de control de movimiento.',
                );
              const goal = new MotionGoal(
                c,
                frame().timeSeconds,
                controller.turnProfile,
                controller.turnStopFraction,
              );
              controller.validateVelocity(
                c.kind === 'distance'
                  ? { forward: c.speed, yaw: 0 }
                  : { forward: 0, yaw: c.speed },
              );
              motionGoal = { request, goal };
            } else if (c && 'kind' in c && c.kind === 'velocity') {
              if (
                !controller ||
                ![c.forward, c.yaw, c.durationSeconds].every(Number.isFinite) ||
                c.durationSeconds < 0 ||
                c.durationSeconds > 30
              )
                throw new Error('Unsupported velocity command.');
              controller.validateVelocity(c);
              const f = frame();
              velocityCommand = {
                request,
                command: c,
                start: f.timeSeconds,
                origin: f.rootPosition,
                yaw: yaw(f),
              };
            } else {
              if (
                controller ||
                !c ||
                !('joint' in c) ||
                !Number.isFinite(c.timeoutSeconds) ||
                c.timeoutSeconds <= 0 ||
                c.timeoutSeconds > 30 ||
                !Number.isFinite(c.toleranceRadians) ||
                c.toleranceRadians <= 0 ||
                c.toleranceRadians > 0.1
              )
                throw new Error('Invalid joint command.');
              jointCommand = {
                request,
                command: c,
                index: world.setTarget(c.joint, c.positionRadians),
                start: frame().timeSeconds,
                settled: 0,
              };
            }
            if (state !== 'running') {
              clock.reset(performance.now());
              state = 'running';
              void cycle();
            }
            return;
          }
        }
      }
      reply(request, { frame: frame() });
    } catch (error) {
      if (request.operation === 'load') {
        loading = false;
        world?.dispose();
        world = undefined;
        await controller?.dispose();
        controller = undefined;
      }
      reply(request, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
