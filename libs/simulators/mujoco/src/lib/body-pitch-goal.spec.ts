import { it, expect } from 'vitest';
import { BodyPitchGoal } from './body-pitch-goal';
const feedback = (timeSeconds: number, pitch: number, rate = 0) => ({
  timeSeconds,
  positions: [],
  velocities: [],
  efforts: [],
  rootPosition: [0, 0, 0.1],
  quaternion: [Math.cos(pitch / 2), 0, Math.sin(pitch / 2), 0],
  angularVelocity: [0, rate, 0],
});
it('requires observed orientation and a quiet window, with a finite timeout', () => {
  const goal = new BodyPitchGoal(-0.1, 0);
  expect(goal.update(feedback(0, 0))).toBeUndefined();
  expect(goal.update(feedback(0.2, -0.1, 0.2))).toBeUndefined();
  expect(goal.update(feedback(0.3, -0.1))).toBeUndefined();
  expect(goal.update(feedback(0.71, -0.11))).toMatchObject({
    bodyPitch: { targetRadians: -0.1, observedRadians: expect.closeTo(-0.11) },
  });
  expect(() => new BodyPitchGoal(-0.1, 0).update(feedback(8, 0))).toThrow(
    /tiempo/,
  );
  expect(() => new BodyPitchGoal(0.2, 0)).toThrow(/Unsupported/);
});
