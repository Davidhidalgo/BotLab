import { describe, it, expect } from 'vitest';
import { MotionGoal } from './motion-goal';
import type { ControllerFeedback } from './controller';
const feedback = (
  timeSeconds: number,
  x = 0,
  y = 0,
  yaw = 0,
): ControllerFeedback => ({
  timeSeconds,
  rootPosition: [x, y, 0.12],
  quaternion: [Math.cos(yaw / 2), 0, 0, Math.sin(yaw / 2)],
  positions: [],
  velocities: [],
  efforts: [],
  angularVelocity: [],
});
describe('measured movement goals', () => {
  it('ignores lateral sway and waits for measured forward progress and settling', () => {
    const goal = new MotionGoal(
      {
        kind: 'distance',
        distanceMeters: 0.5,
        speed: 0.24,
        timeoutSeconds: 30,
      },
      0,
    );
    goal.update(feedback(1));
    for (let t = 2; t < 6; t++)
      expect(goal.update(feedback(t, 0, t % 2))).toBeUndefined();
    expect(goal.intent().forward).toBeGreaterThan(0);
    expect(goal.update(feedback(6, 0.496))).toBeUndefined();
    expect(goal.intent()).toEqual({ forward: 0, yaw: 0 });
    expect(goal.update(feedback(7, 0.51))).toMatchObject({
      targetDistanceMeters: 0.5,
      forwardDisplacementMeters: 0.51,
    });
  });
  it('measures a full turn through the ±π boundary and preserves direction', () => {
    const goal = new MotionGoal(
      {
        kind: 'turn',
        angleRadians: -2 * Math.PI,
        speed: 1,
        timeoutSeconds: 30,
      },
      0,
    );
    goal.update(feedback(1, 0, 0, 2));
    for (let i = 1; i <= 8; i++)
      goal.update(feedback(1 + i, 0, 0, 2 - (i * Math.PI) / 4));
    expect(goal.update(feedback(10, 0, 0, 2 - 2 * Math.PI))).toMatchObject({
      yawRadians: -2 * Math.PI,
      targetYawRadians: -2 * Math.PI,
    });
  });
  it('does not report completion on timeout, stalled motion or excessive overshoot', () => {
    const make = () =>
      new MotionGoal(
        {
          kind: 'distance',
          distanceMeters: 1,
          speed: 0.24,
          timeoutSeconds: 30,
        },
        0,
      );
    const stall = make();
    stall.update(feedback(1));
    expect(() => stall.update(feedback(12))).toThrow(/no avanza/);
    expect(() => make().update(feedback(30))).toThrow(/a tiempo/);
    const overshoot = make();
    overshoot.update(feedback(1));
    overshoot.update(feedback(2, 1.2));
    expect(() => overshoot.update(feedback(3, 1.2))).toThrow(/sobrepasado/);
  });
  it('rejects nonfinite or out-of-range goals', () => {
    for (const distanceMeters of [-1, NaN, Infinity, 21])
      expect(
        () =>
          new MotionGoal(
            {
              kind: 'distance',
              distanceMeters,
              speed: 0.24,
              timeoutSeconds: 30,
            },
            0,
          ),
      ).toThrow(/no válido/);
  });
});
