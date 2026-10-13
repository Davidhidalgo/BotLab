import { describe, it, expect } from 'vitest';
import { evaluateFrontProximity } from './proximity';
import type { SimulationDepthFrame } from './session';
const depth = (): SimulationDepthFrame => ({
  sensorId: 'front',
  sequence: 1,
  capturedAtSeconds: 1,
  rows: 8,
  columns: 8,
  maxRangeMeters: 4,
  distancesMeters: Array(64).fill(1),
  statuses: Array(64).fill('hit'),
  sensorPosition: [0, 0, 0],
  sensorRotation: [],
  processingMilliseconds: 0,
});
describe('front proximity semantics', () => {
  it('uses the nearest central zone and a strict threshold, not peripheral floor hits', () => {
    const d = depth();
    d.distancesMeters[0] = 0.1;
    expect(evaluateFrontProximity(d, 1, 0.3).value).toBe(false);
    d.distancesMeters[27] = 0.3;
    expect(evaluateFrontProximity(d, 1, 0.3).value).toBe(false);
    d.distancesMeters[36] = 0.29;
    expect(evaluateFrontProximity(d, 1, 0.3)).toMatchObject({
      value: true,
      distanceMeters: 0.29,
    });
  });
  it('does not reinterpret absent, invalid or stale readings as free space', () => {
    expect(() => evaluateFrontProximity(undefined, 1, 0.3)).toThrow(
      'no tiene sensor',
    );
    expect(() => evaluateFrontProximity(depth(), 1.2, 0.3)).toThrow('caducada');
    expect(() => evaluateFrontProximity(depth(), 0.5, 0.3)).toThrow('caducada');
    for (const status of ['no-return', 'invalid'] as const) {
      const d = depth();
      d.statuses[27] = status;
      d.distancesMeters[27] = null;
      expect(() => evaluateFrontProximity(d, 1, 0.3)).toThrow(
        'lectura frontal válida',
      );
    }
  });
  it('supports the reduced Jumper grid with its own range', () => {
    const d = {
      ...depth(),
      rows: 7,
      columns: 9,
      maxRangeMeters: 8.8,
      distancesMeters: Array(63).fill(5),
      statuses: Array(63).fill('hit'),
    };
    d.distancesMeters[31] = 0.2;
    expect(evaluateFrontProximity(d, 1, 0.3).value).toBe(true);
  });
});
