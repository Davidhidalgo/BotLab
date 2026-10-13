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

it('requires contact-free flight and height gain before confirming a jump landing', () => {
  const goal = new SkillGoal('jump', feedback(0));
  goal.update(feedback(0.1, 0.4, 0.18), true, 0);
  goal.update(feedback(0.18, 0.6, 0.23), true, 0);
  goal.update(feedback(0.3, 0.4, 0.12), true, 4);
  let result;
  for (let i = 16; i < 65; i++)
    result = goal.update(feedback(i * 0.02, 0.1), false, 4) ?? result;
  expect(result?.skill?.flight).toEqual({
    contactFreeSeconds: 0.07999999999999999,
    maxHeightGainMeters: 0.114,
  });
  const grounded = new SkillGoal('jump', feedback(0));
  grounded.update(feedback(0.1, 0.5, 0.2), true, 4);
  expect(() => grounded.update(feedback(1, 0.5, 0.12), false, 4)).toThrow(
    /despegue/,
  );
  expect(() =>
    new SkillGoal('jump', feedback(0)).update(feedback(0.1, 0.3), true),
  ).toThrow(/contactos/);
});
