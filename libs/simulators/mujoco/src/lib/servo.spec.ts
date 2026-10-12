import { it, expect } from 'vitest';
import { servoEffort } from './servo';
const joint = {
  name: 'test',
  min: -2,
  max: 2,
  home: 0,
  kp: 10,
  kd: 0.5,
  effortLimit: 1.7464,
};
const curve = {
  plateau: 1.7464,
  cornerRpm: 293.5,
  decayRpm: 240.5,
  cutoffRpm: 611,
  continuous: 1.2,
  peakSeconds: 0.3,
};
it('applies symmetric effort, speed cutoff and thermal derating per physics substep', () => {
  expect(servoEffort(joint, 0, 0, 1, 0, 0.001, curve).effort).toBe(1.7464);
  expect(servoEffort(joint, 0, 0, -1, 0, 0.001, curve).effort).toBe(-1.7464);
  expect(servoEffort(joint, 0, 0, 1, 1, 0.001, curve).effort).toBe(1.2);
  expect(
    servoEffort(
      joint,
      0,
      (curve.cutoffRpm * 2 * Math.PI) / 60 + 1,
      1,
      0,
      0.001,
      curve,
    ).effort,
  ).toBeCloseTo(0);
  let heat = 0;
  for (let i = 0; i < 301; i++)
    heat = servoEffort(joint, 0, 0, 1, heat, 0.001, curve).heat;
  expect(heat).toBeGreaterThanOrEqual(1);
});
