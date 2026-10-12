import type { JointServo, ServoCurve } from '@botlab/simulators-core';

/** Mirrors Jumper's pinned ServoCurveActuator law, including per-substep heat. */
export function servoEffort(
  joint: JointServo,
  position: number,
  velocity: number,
  target: number,
  heat: number,
  dt: number,
  curve?: ServoCurve,
) {
  let limit = joint.effortLimit;
  if (curve) {
    const rpm = (Math.abs(velocity) * 60) / (2 * Math.PI);
    const speedLimit =
      rpm >= curve.cutoffRpm
        ? 0
        : curve.plateau *
          Math.exp(-Math.max(0, rpm - curve.cornerRpm) / curve.decayRpm);
    limit = Math.min(
      limit,
      speedLimit,
      heat >= 1 ? curve.continuous : curve.plateau,
    );
  }
  const effort = Math.max(
    -limit,
    Math.min(limit, joint.kp * (target - position) - joint.kd * velocity),
  );
  if (curve) {
    const tau =
      curve.peakSeconds /
      Math.log(1 / (1 - (curve.continuous / curve.plateau) ** 2));
    heat = Math.max(
      0,
      heat + (((effort / curve.continuous) ** 2 - heat) * dt) / tau,
    );
  }
  return { effort, heat };
}
