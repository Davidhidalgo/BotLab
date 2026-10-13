import { expect, it } from 'vitest';
import { MicroduckPostureTracker } from './posture';
const feedback = (timeSeconds: number, height: number, angular = 0) => ({
  timeSeconds,
  rootPosition: [0, 0, height],
  quaternion: [1, 0, 0, 0],
  angularVelocity: [angular, 0, 0],
  positions: [],
  velocities: [],
  efforts: [],
});
it('requires a stable window in the requested height range, not just a low pose', () => {
  const p = new MicroduckPostureTracker();
  p.begin('sit');
  for (let i = 0; i < 40; i++) p.observe(feedback(i * 0.02, 0.06, 0.2));
  expect(p.state).toBe('transitioning');
  for (let i = 40; i < 80; i++) p.observe(feedback(i * 0.02, 0.06));
  expect(p.state).toBe('sit');
  p.begin('stand');
  for (let i = 80; i < 120; i++) p.observe(feedback(i * 0.02, 0.06));
  expect(p.state).toBe('transitioning');
  for (let i = 120; i < 160; i++) p.observe(feedback(i * 0.02, 0.116));
  expect(p.state).toBe('stand');
  p.begin('sit');
  p.observe(feedback(4, 0.06));
  for (let i = 0; i < 100; i++) p.observe(feedback(4, 0.06));
  expect(p.state).toBe('transitioning');
  p.reset();
  expect(p.state).toBe('stand');
});
