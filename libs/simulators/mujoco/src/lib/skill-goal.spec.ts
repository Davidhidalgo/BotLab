import { it, expect } from 'vitest';
import { SkillGoal } from './skill-goal';
const feedback = (timeSeconds: number, position = 0, height = 0.116) => ({
  timeSeconds,
  positions: [position],
  velocities: [0],
  efforts: [0],
  rootPosition: [0, 0, height],
  quaternion: [1, 0, 0, 0],
  angularVelocity: [0, 0, 0],
});
it('requires a completed policy, visible joint motion and stable upright return', () => {
  const goal = new SkillGoal('kick-left', feedback(0));
  expect(goal.update(feedback(0.5, 0.4), true)).toBeUndefined();
  expect(goal.update(feedback(0.52, 0.1), false)).toBeUndefined();
  let result;
  for (let i = 27; i < 75; i++)
    result = goal.update(feedback(i * 0.02, 0.1), false) ?? result;
  expect(result).toMatchObject({
    skill: { name: 'kick-left', maxJointChangeRadians: 0.4 },
  });
  expect(result?.rest?.durationSeconds).toBeGreaterThanOrEqual(0.8);
  expect(() =>
    new SkillGoal('kick-left', feedback(0)).update(feedback(1), false),
  ).toThrow(/movimiento/);
  expect(() =>
    new SkillGoal('ground-pick', feedback(0)).update(
      feedback(3, 0.4, 0.06),
      false,
    ),
  ).toThrow(/erguida/);
  expect(() =>
    new SkillGoal('kick-left', feedback(0)).update(feedback(10, 0.4), true),
  ).toThrow(/tiempo/);
});
