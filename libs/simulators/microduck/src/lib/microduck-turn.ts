// Self-contained for embedding in the official simulator receiver.
export function createMicroDuckTurnTracker(target: number, readHeading?: () => number) {
  let previous: number | undefined;
  let rotation = 0;
  let elapsed = 0;
  let lastProgressAt = 0;
  let bestError = Math.abs(target);
  let reached = false;
  let settling = false;
  let settleElapsed = 0;
  let quietElapsed = 0;
  let direction = 1;
  return (dt: number) => {
    if (!Number.isFinite(target) || Math.abs(target) > 360 || !Number.isFinite(dt) || dt < 0) {
      return { turnedDegrees: 0, done: false, powerScale: 0, error: 'invalid-frame' };
    }
    if (target === 0) return { turnedDegrees: 0, done: true, powerScale: 0 };
    let heading;
    try { heading = readHeading?.(); } catch { heading = undefined; }
    if (heading === undefined || !Number.isFinite(heading)) {
      return { turnedDegrees: Math.max(0, rotation * Math.sign(target)), done: false, powerScale: 0, error: 'telemetry-unavailable' };
    }
    const delta = previous === undefined ? 0 : Math.atan2(Math.sin(heading - previous), Math.cos(heading - previous));
    if (Math.abs(delta) > Math.max(0.7, dt * 8)) {
      return { turnedDegrees: Math.max(0, rotation * Math.sign(target)), done: false, powerScale: 0, error: 'position-reset' };
    }
    previous = heading;
    // MuJoCo yaw is positive left; BotLab angles are positive right.
    rotation -= delta * 180 / Math.PI;
    const turnedDegrees = Math.max(0, rotation * Math.sign(target));
    const remaining = Math.abs(target) - rotation * Math.sign(target);
    const rate = dt > 0 ? Math.abs(delta * 180 / Math.PI / dt) : Infinity;
    elapsed += dt;
    const crossed = !reached && remaining <= 0;
    reached ||= crossed;
    if (Math.abs(remaining) < bestError - 1) {
      bestError = Math.abs(remaining);
      lastProgressAt = elapsed;
    }
    const error = elapsed - lastProgressAt >= 10 ? 'motion-stalled'
      : elapsed > Math.max(30, Math.abs(target) / 3) ? 'motion-timeout' : undefined;
    if (error) return { turnedDegrees, crossed, done: false, powerScale: 0, error };
    if (!settling && remaining * direction <= 0) {
      settling = true;
      settleElapsed = 0;
      quietElapsed = 0;
    }
    if (settling) {
      settleElapsed += dt;
      quietElapsed = rate < 5 ? quietElapsed + dt : 0;
      // Crossing can be torso twist rather than a completed footstep. Hold zero
      // motion until the pose settles, then correct any remaining angular error.
      if (settleElapsed >= 0.75 && quietElapsed >= 0.25) {
        if (reached && Math.abs(remaining) <= 5) return { turnedDegrees, crossed, done: true, powerScale: 0 };
        direction = Math.sign(remaining);
        settling = false;
      } else {
        return { turnedDegrees, crossed, done: false, powerScale: 0 };
      }
    }
    // The calibrated Feet limit is 2: 75% keeps stepping near the target.
    // Negative scale corrects overshoot by turning against the authored direction.
    return { turnedDegrees, crossed, done: false, powerScale: direction * Math.max(0.75, Math.min(1, Math.abs(remaining) / 45)) };
  };
}
