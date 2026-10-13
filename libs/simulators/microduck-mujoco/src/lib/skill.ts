import type { SimulationSkill } from '@botlab/simulators-core';
/** Policy ticks advance only when their output is accepted by the worker. */
export class MicroduckSkillClock {
  active: SimulationSkill | undefined;
  tick = 0;
  begin(skill: SimulationSkill) {
    if (!['kick-left', 'kick-right', 'ground-pick'].includes(skill))
      throw new Error('Unsupported skill.');
    this.active = skill;
    this.tick = 0;
  }
  accept() {
    if (!this.active) return;
    this.tick++;
    if (this.tick >= (this.active === 'ground-pick' ? 140 : 25))
      this.active = undefined;
  }
  cancel() {
    this.active = undefined;
    this.tick = 0;
  }
  phase() {
    return (2 * Math.PI * this.tick * 0.02) / 4;
  }
}
