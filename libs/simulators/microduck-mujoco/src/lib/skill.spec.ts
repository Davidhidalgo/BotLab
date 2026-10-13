import { describe, it, expect } from 'vitest';
import { MicroduckSkillClock } from './skill';
describe('MicroDuck one-shot policy clock', () => {
  it('keeps kick previous-action continuity for exactly 25 accepted ticks', () => {
    const clock = new MicroduckSkillClock();
    clock.begin('kick-left');
    for (let i = 0; i < 24; i++) clock.accept();
    expect(clock.active).toBe('kick-left');
    clock.accept();
    expect(clock.active).toBeUndefined();
  });
  it('encodes ground-pick phase and cancels without carrying ticks to the next skill', () => {
    const clock = new MicroduckSkillClock();
    clock.begin('ground-pick');
    for (let i = 0; i < 100; i++) clock.accept();
    expect(clock.phase()).toBeCloseTo(Math.PI);
    for (let i = 0; i < 40; i++) clock.accept();
    expect(clock.active).toBeUndefined();
    clock.begin('kick-right');
    clock.accept();
    clock.cancel();
    expect(clock.active).toBeUndefined();
    clock.begin('kick-left');
    expect(clock.tick).toBe(0);
  });
});
