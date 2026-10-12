import { describe, expect, it } from 'vitest';
import { SimulationClock } from './simulation-clock';

describe('simulation wall clock', () => {
  it('absorbs timer jitter without changing physics intervals or accumulating drift', () => {
    const clock = new SimulationClock(5);
    clock.reset(0);
    let steps = 0;
    for (let now = 0; now <= 999; now += 3) {
      const due = clock.dueSteps(now);
      for (let i = 0; i < due; i++) {
        clock.advanced();
        steps++;
      }
    }
    expect(steps).toBe(200);
    expect(clock.delay(999)).toBe(1);
    expect(clock.dueSteps(999)).toBe(0);
    expect(clock.dueSteps(1000)).toBe(1);
  });

  it('caps a long suspension at four intervals and discards the old backlog', () => {
    const clock = new SimulationClock(5);
    clock.reset(0);
    expect(clock.dueSteps(60_000)).toBe(4);
    for (let i = 0; i < 4; i++) clock.advanced();
    expect(clock.dueSteps(60_000)).toBe(0);
    expect(clock.delay(60_000)).toBe(5);
  });

  it('counts only intervals actually executed and starts fresh after a pause', () => {
    const clock = new SimulationClock(20);
    clock.reset(0);
    expect(clock.dueSteps(60)).toBe(4);
    clock.advanced();
    expect(clock.dueSteps(60)).toBe(3);
    clock.reset(10_000);
    expect(clock.dueSteps(10_000)).toBe(1);
    clock.advanced();
    expect(clock.delay(10_000.1)).toBe(20);
  });
});
