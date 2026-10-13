import { it, expect } from 'vitest';
import { GripperGoal } from './gripper-goal';
const target = {
  side: 'left' as const,
  position: 'closed' as const,
  joints: [{ name: 'finger', radians: 0.1 }],
};
const f = (timeSeconds: number, position = 0.1) => ({
  timeSeconds,
  positions: [position],
  velocities: [0],
  efforts: [0],
  rootPosition: [0, 0, 0.1],
  quaternion: [1, 0, 0, 0],
  angularVelocity: [0, 0, 0],
});
it('requires measured arrival and a fresh stable window, with bounded failure', () => {
  const g = new GripperGoal('close', target, [0], 0);
  expect(g.update(f(1), false)).toBeUndefined();
  g.update(f(2), true);
  expect(g.update(f(2.9, 0.3), true)).toBeUndefined();
  g.update(f(3), true);
  expect(g.update(f(3.9), true)?.gripper).toMatchObject({
    action: 'close',
    position: 'closed',
    maxJointErrorRadians: 0,
  });
  expect(() =>
    new GripperGoal('close', target, [0], 0).update(f(10), true),
  ).toThrow(/tiempo/);
  expect(() =>
    new GripperGoal('close', target, [0], 0).update(f(1, NaN), true),
  ).toThrow(/observar/);
});
