/** Pinned operator_controller/2: Ly -> vx; Rx outer half -> yaw, sign -1. */
export function jumperWalkingAxes(velocity: { forward: number; yaw: number }) {
  if (
    !Number.isFinite(velocity.forward) ||
    !Number.isFinite(velocity.yaw) ||
    velocity.forward < 0 ||
    velocity.forward > 0.24 ||
    (velocity.yaw !== 0 &&
      (Math.abs(velocity.yaw) !== 1 || velocity.forward !== 0))
  )
    throw new Error(
      'Jumper supports forward 0–0.24 m/s or an in-place turn at ±1 rad/s.',
    );
  return {
    Ly: -velocity.forward / 0.8,
    // Do not scale yaw linearly over the whole stick: its inner half is posture.
    Rx:
      velocity.yaw === 0
        ? 0
        : -Math.sign(velocity.yaw) * (0.5 + Math.abs(velocity.yaw) / 8),
  };
}
