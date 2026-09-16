import { createMicroDuckDistanceTracker } from './microduck-distance';

describe('measured walk distance', () => {
  it('uses horizontal displacement rather than accumulated sway', () => {
    let position = [10, -3];
    const track = createMicroDuckDistanceTracker(5, () => position);
    expect(track(0.02).distanceMeters).toBe(0);
    for (let i = 0; i < 8; i++) {
      position = [10 + (i % 2 ? 0.01 : 0), -3];
      expect(track(1).done).toBe(false);
    }
    position = [13, 1];
    expect(track(1)).toMatchObject({ distanceMeters: 5, done: true });
  });

  it.each([NaN, Infinity, -1])('rejects invalid distance %s', (target) => {
    expect(
      createMicroDuckDistanceTracker(target, () => [0, 0])(0.02).error,
    ).toBe('invalid-frame');
  });

  it('times out even when the robot keeps making insufficient progress', () => {
    let x = 0;
    const track = createMicroDuckDistanceTracker(5, () => [x, 0]);
    let result = track(1);
    for (let i = 0; i < 100; i++) {
      x += 0.02;
      result = track(1);
    }
    expect(result.error).toBe('motion-timeout');
  });

  it('reports failing telemetry as an execution error', () => {
    const track = createMicroDuckDistanceTracker(1, () => {
      throw new Error('Disconnected');
    });
    expect(track(0.02).error).toBe('telemetry-unavailable');
  });
});
