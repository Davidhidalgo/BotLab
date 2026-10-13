import type {
  SimulationSkill,
  SimulationCommandResult,
} from '@botlab/simulators-core';
import type { ControllerFeedback } from './controller';
import { RestGoal } from './rest-goal';
/** A bounded controller skill must visibly move joints and return to measured rest. */
export class SkillGoal {
  private rest: RestGoal | undefined;
  private maxJointChange = 0;
  constructor(
    private name: SimulationSkill,
    private start: ControllerFeedback,
  ) {}
  update(
    feedback: ControllerFeedback,
    running: boolean,
  ): SimulationCommandResult | undefined {
    if (
      feedback.positions.length !== this.start.positions.length ||
      !feedback.positions.every(Number.isFinite)
    )
      throw new Error('No se puede observar la habilidad.');
    const duration = feedback.timeSeconds - this.start.timeSeconds;
    if (duration >= 10)
      throw new Error('La habilidad no terminó antes del tiempo máximo.');
    this.maxJointChange = Math.max(
      this.maxJointChange,
      ...feedback.positions.map((v, i) =>
        Math.abs(v - this.start.positions[i]),
      ),
    );
    if (running) return;
    if (this.maxJointChange < 0.15)
      throw new Error('La habilidad no produjo el movimiento esperado.');
    this.rest ??= new RestGoal(feedback.timeSeconds);
    if (feedback.rootPosition[2] < 0.095)
      throw new Error(
        'La habilidad no devolvió al robot a una postura erguida.',
      );
    const result = this.rest.update(feedback);
    if (result)
      return {
        ...result,
        skill: {
          name: this.name,
          durationSeconds: duration,
          maxJointChangeRadians: this.maxJointChange,
        },
      };
    return;
  }
}
