import type { ControllerFeedback } from '@botlab/simulators-mujoco';

/** The pinned alpha walker: gyro, projected gravity, q-home, qd, previous action, 13 command slots. */
export function walkingObservation(
  feedback: ControllerFeedback,
  home: readonly number[],
  lastAction: readonly number[],
  velocity: { forward: number; yaw: number },
  head: readonly number[] = [0, 0, 0, 0],
): Float32Array {
  if (home.length !== 14 || lastAction.length !== 14 || head.length !== 4)
    throw new Error('MicroDuck alpha requires 14 joints.');
  const [w, x, y, z] = feedback.quaternion;
  const gravity = [
    2 * (w * y - x * z),
    -2 * (y * z + w * x),
    -(1 - 2 * (x * x + y * y)),
  ];
  const obs = new Float32Array([
    ...feedback.angularVelocity,
    ...gravity,
    ...feedback.positions.map((q, i) => q - home[i]),
    ...feedback.velocities,
    ...lastAction,
    velocity.forward,
    0,
    velocity.yaw,
    ...head,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);
  if (obs.length !== 61 || !obs.every(Number.isFinite))
    throw new Error('Invalid alpha walking feedback.');
  return obs;
}
