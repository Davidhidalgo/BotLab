import { walkingSkillTimeouts, validateWalkingSkill } from '@botlab/model';
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
  private flightStart: number | undefined;
  private contactFreeSeconds = 0;
  private maxHeightGainMeters = 0;
  constructor(
    private name: SimulationSkill,
    private start: ControllerFeedback,
  ) {
    validateWalkingSkill(name);
  }
  update(
    feedback: ControllerFeedback,
    running: boolean,
    contacts?: number,
  ): SimulationCommandResult | undefined {
    if (
      feedback.positions.length !== this.start.positions.length ||
      !feedback.positions.every(Number.isFinite)
    )
      throw new Error('No se puede observar la habilidad.');
    const duration = feedback.timeSeconds - this.start.timeSeconds;
    if (duration >= walkingSkillTimeouts[this.name])
      throw new Error('La habilidad no terminó antes del tiempo máximo.');
    this.maxJointChange = Math.max(
      this.maxJointChange,
      ...feedback.positions.map((v, i) =>
        Math.abs(v - this.start.positions[i]),
      ),
    );
    if (this.name === 'jump') {
      if (contacts === undefined || !Number.isInteger(contacts) || contacts < 0)
        throw new Error('No se pueden observar los contactos del salto.');
      this.maxHeightGainMeters = Math.max(
        this.maxHeightGainMeters,
        feedback.rootPosition[2] - this.start.rootPosition[2],
      );
      if (contacts === 0) {
        this.flightStart ??= feedback.timeSeconds;
        this.contactFreeSeconds = Math.max(
          this.contactFreeSeconds,
          feedback.timeSeconds - this.flightStart,
        );
      } else this.flightStart = undefined;
    }
    if (running) return;
    if (
      this.name === 'jump' &&
      (this.contactFreeSeconds < 0.04 || this.maxHeightGainMeters < 0.03)
    )
      throw new Error('No se ha observado el despegue del salto.');
    if (this.maxJointChange < 0.15)
      throw new Error('La habilidad no produjo el movimiento esperado.');
    this.rest ??= new RestGoal(feedback.timeSeconds);
    if (
      this.name === 'jump' &&
      (feedback.rootPosition[2] < 0.095 || contacts === 0)
    )
      return;
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
          ...(this.name === 'jump'
            ? {
                flight: {
                  contactFreeSeconds: this.contactFreeSeconds,
                  maxHeightGainMeters: this.maxHeightGainMeters,
                },
              }
            : {}),
        },
      };
    return;
  }
}
