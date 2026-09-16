import {
  createMicroDuckProximityTrigger,
  type MicroDuckDepthFrame,
} from './microduck-proximity';

const frame = (seq: number, mm = 400): MicroDuckDepthFrame => ({
  seq,
  rows: 8,
  cols: 8,
  distance_mm: Array(64).fill(mm),
  status: Array(64).fill(5),
});
const create = () =>
  createMicroDuckProximityTrigger({ enterDistanceM: 0.45, exitDistanceM: 0.6 });

describe('native MicroDuck proximity subscription', () => {
  it('requires three distinct consecutive near frames and reports metres', () => {
    const trigger = create();
    expect(trigger.update(frame(1)).entered).toBe(false);
    expect(trigger.update(frame(2)).entered).toBe(false);
    expect(trigger.update(frame(3))).toEqual({
      entered: true,
      armed: false,
      distanceM: 0.4,
    });
  });
  it('fires once while near and rearms only beyond the exit distance', () => {
    const trigger = create();
    for (let i = 1; i <= 3; i++) trigger.update(frame(i));
    expect(trigger.update(frame(4)).entered).toBe(false);
    expect(trigger.update(frame(5, 500)).armed).toBe(false);
    expect(trigger.update(frame(6, 600)).armed).toBe(true);
    trigger.update(frame(7));
    trigger.update(frame(8));
    expect(trigger.update(frame(9)).entered).toBe(true);
  });
  it('does not count duplicated or out-of-order notifications', () => {
    const trigger = create();
    trigger.update(frame(1));
    expect(trigger.update(frame(1)).entered).toBe(false);
    expect(trigger.update(frame(0)).entered).toBe(false);
    expect(trigger.update(frame(2)).entered).toBe(false);
    expect(trigger.update(frame(3)).entered).toBe(true);
  });
  it('requires a fresh confirmation sequence after dropped frames', () => {
    const trigger = create();
    trigger.update(frame(1));
    trigger.update(frame(2));
    expect(trigger.update(frame(4)).entered).toBe(false);
    expect(trigger.update(frame(5)).entered).toBe(false);
    expect(trigger.update(frame(6)).entered).toBe(true);
  });
  it('ignores unavailable/invalid ranges and resets pending confirmation', () => {
    const trigger = create();
    trigger.update(frame(1));
    trigger.update(frame(2));
    const invalid = frame(3);
    invalid.status.fill(255);
    expect(trigger.update(invalid).distanceM).toBeUndefined();
    expect(trigger.update(frame(4)).entered).toBe(false);
    const bad = frame(5);
    bad.distance_mm[27] = NaN;
    bad.distance_mm[28] = -1;
    expect(trigger.update(bad).distanceM).toBeUndefined();
  });
  it('requires correct geometry and uses the central rays rather than the floor', () => {
    const trigger = create();
    expect(trigger.update({ ...frame(1), rows: 4 }).distanceM).toBeUndefined();
    expect(
      trigger.update({ ...frame(2), distance_mm: [] }).distanceM,
    ).toBeUndefined();
    const clear = frame(3, 100);
    for (const i of [27, 28, 35, 36]) {
      clear.distance_mm[i] = 900;
      clear.status[i] = 9;
    }
    expect(trigger.update(clear).distanceM).toBe(0.9);
  });
  it('cancellation prevents activation even after a new near crossing', () => {
    const trigger = create();
    trigger.update(frame(1, 900));
    trigger.cancel();
    for (let i = 2; i < 10; i++)
      expect(trigger.update(frame(i))).toEqual({
        entered: false,
        armed: false,
      });
  });
  it('rejects invalid configuration', () => {
    for (const options of [
      { enterDistanceM: 0, exitDistanceM: 0.6 },
      { enterDistanceM: 0.45, exitDistanceM: 0.4 },
      { enterDistanceM: 0.45, exitDistanceM: Infinity },
      { enterDistanceM: 0.45, exitDistanceM: 0.6, confirmationFrames: 0.5 },
    ])
      expect(() => createMicroDuckProximityTrigger(options)).toThrow();
  });
});
