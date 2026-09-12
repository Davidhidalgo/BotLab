// Self-contained for embedding in the official simulator receiver.
export function createMicroDuckTurnTracker(target: number, readHeading?: () => number) {
  let previous: number | undefined;
  let rotation = 0;
  let elapsed = 0;
  let lastProgressAt = 0;
  let best = 0;
  return (dt: number) => {
    if (!Number.isFinite(target) || Math.abs(target) > 360 || !Number.isFinite(dt) || dt < 0) {
      return { turnedDegrees: 0, done: false, powerScale: 0, error: 'invalid-frame' };
    }
    if (target === 0) return { turnedDegrees: 0, done: true, powerScale: 0 };
    let heading;
    try { heading = readHeading?.(); } catch { heading = undefined; }
    if (heading === undefined || !Number.isFinite(heading)) {
      return { turnedDegrees: best, done: false, powerScale: 0, error: 'telemetry-unavailable' };
    }
    const delta = previous === undefined ? 0 : Math.atan2(Math.sin(heading - previous), Math.cos(heading - previous));
    if (Math.abs(delta) > Math.max(0.7, dt * 8)) {
      return { turnedDegrees: best, done: false, powerScale: 0, error: 'position-reset' };
    }
    previous = heading;
    // MuJoCo yaw is positive left; BotLab angles are positive right.
    rotation -= delta * 180 / Math.PI;
    const turnedDegrees = Math.max(0, rotation * Math.sign(target));
    const remaining = Math.abs(target) - turnedDegrees;
    elapsed += dt;
    if (remaining <= 0) return { turnedDegrees, done: true, powerScale: 0 };
    if (turnedDegrees > best + 1) {
      best = turnedDegrees;
      lastProgressAt = elapsed;
    }
    const error = elapsed - lastProgressAt >= 10 ? 'motion-stalled'
      : elapsed > Math.max(30, Math.abs(target) / 3) ? 'motion-timeout' : undefined;
    // Lower commands fall inside the walking policy's angular dead zone.
    return { turnedDegrees, done: false, powerScale: Math.max(0.5, Math.min(1, remaining / 45)), error };
  };
}
