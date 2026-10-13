import { expect, it } from 'vitest';
import { RestGoal } from './rest-goal';
const f = (timeSeconds: number, x = 0, angular = 0) => ({
  timeSeconds,
  rootPosition: [x, 0, 0.12],
  quaternion: [1, 0, 0, 0],
  angularVelocity: [0, 0, angular],
  positions: [],
  velocities: [],
  efforts: [],
});
it('requires an observed low-drift window and rejects ongoing motion', () => {
  const goal = new RestGoal(0);
  for (let i = 0; i < 40; i++)
    expect(goal.update(f(i * 0.02, i * 0.002))).toBeUndefined();
  let result;
  for (let i = 40; i < 90; i++)
    result = goal.update(f(i * 0.02, 0.08)) ?? result;
  expect(result?.rest?.driftMeters).toBeLessThanOrEqual(0.01);
  expect(result?.rest?.durationSeconds).toBeGreaterThanOrEqual(0.8);
  const spin = new RestGoal(0);
  for (let i = 0; i < 50; i++)
    expect(spin.update(f(i * 0.02, 0, 0.2))).toBeUndefined();
  expect(() => spin.update(f(5))).toThrow(/tiempo máximo/);
  expect(() => new RestGoal(0).update(f(NaN))).toThrow(/observar/);
});
