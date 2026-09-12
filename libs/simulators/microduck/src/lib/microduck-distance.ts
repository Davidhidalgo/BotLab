// Self-contained so the browser bridge can embed the same tracker in its generated module.
export function createMicroDuckDistanceTracker(
  target: number,
  readPosition?: () => readonly number[]
) {
  let origin: number[] | undefined;
  let previous: number[] | undefined;
  let elapsed = 0;
  let lastProgressAt = 0;
  let best = 0;
  return (dt: number) => {
    if (
      !Number.isFinite(target) ||
      target < 0 ||
      !Number.isFinite(dt) ||
      dt < 0
    )
      return { distanceMeters: 0, done: false, error: 'invalid-frame' };
    if (target === 0) return { distanceMeters: 0, done: true };
    let position;
    try {
      position = readPosition?.();
    } catch {
      return {
        distanceMeters: best,
        done: false,
        error: 'telemetry-unavailable',
      };
    }
    if (
      !position ||
      !Number.isFinite(position[0]) ||
      !Number.isFinite(position[1])
    )
      return { distanceMeters: 0, done: false, error: 'telemetry-unavailable' };
    const point = [position[0], position[1]];
    origin ??= point;
    if (
      previous &&
      Math.hypot(point[0] - previous[0], point[1] - previous[1]) >
        Math.max(0.5, dt * 5)
    )
      return { distanceMeters: best, done: false, error: 'position-reset' };
    previous = point;
    elapsed += dt;
    const distanceMeters = Math.hypot(
      point[0] - origin[0],
      point[1] - origin[1]
    );
    if (distanceMeters >= target) return { distanceMeters, done: true };
    if (distanceMeters > best + 0.01) {
      best = distanceMeters;
      lastProgressAt = elapsed;
    }
    const error =
      elapsed - lastProgressAt >= 10
        ? 'motion-stalled'
        : elapsed > Math.max(30, target / 0.05)
        ? 'motion-timeout'
        : undefined;
    return { distanceMeters, done: false, error };
  };
}
