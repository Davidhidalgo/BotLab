import { expect, it } from 'vitest';
import { jumperWalkingAxes } from './walking-input';

it('uses the outer Rx band for signed yaw while preserving forward mapping', () => {
  expect(jumperWalkingAxes({ forward: 0.24, yaw: 0 })).toEqual({
    Ly: -0.3,
    Rx: 0,
  });
  for (const yaw of [-1, 1]) {
    const axes = jumperWalkingAxes({ forward: 0, yaw });
    expect(axes.Rx).toBe(-yaw * 0.625);
    // Reconstruct the command using the pinned operator travel band and range.
    expect(((-Math.sign(axes.Rx) * (Math.abs(axes.Rx) - 0.5)) / 0.5) * 4).toBe(
      yaw,
    );
  }
});

it('rejects mixed motion, unmeasured turn speeds and nonfinite commands', () => {
  for (const velocity of [
    { forward: 0.24, yaw: 1 },
    { forward: 0, yaw: 0.65 },
    { forward: 0, yaw: 2 },
    { forward: -0.1, yaw: 0 },
    { forward: NaN, yaw: 0 },
    { forward: 0, yaw: Infinity },
  ])
    expect(() => jumperWalkingAxes(velocity)).toThrow(/Jumper supports/);
});
