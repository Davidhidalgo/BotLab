import { it, expect } from 'vitest';
import { walkingObservation } from './observations';
it('uses body-frame gravity and the pinned 61D ordering with separate command units', () => {
  const obs = walkingObservation(
    {
      rootPosition: [0, 0, 0.12],
      quaternion: [Math.SQRT1_2, 0, Math.SQRT1_2, 0],
      angularVelocity: [1, 2, 3],
      positions: Array(14).fill(0.5),
      velocities: Array(14).fill(0.2),
      efforts: Array(14).fill(0),
      timeSeconds: 0,
    },
    Array(14).fill(0.1),
    Array(14).fill(0.3),
    { forward: 0.25, yaw: 1 },
  );
  expect(obs.length).toBe(61);
  expect(Array.from(obs.slice(0, 5))).toEqual([1, 2, 3, 1, -0]);
  expect(obs[5]).toBeCloseTo(0);
  expect(obs[6]).toBeCloseTo(0.4);
  expect(obs[20]).toBeCloseTo(0.2);
  expect(obs[34]).toBeCloseTo(0.3);
  expect(Array.from(obs.slice(48, 51))).toEqual([0.25, 0, 1]);
  expect(Array.from(obs.slice(51))).toEqual(Array(10).fill(0));
});
