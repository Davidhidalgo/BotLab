import type { ControllerFeedback } from './controller';
import type { SimulationCommandResult } from '@botlab/simulators-core';
/** Pitch is measured from the body quaternion, not inferred from command input. */
export class BodyPitchGoal {
  private stableSince: number | undefined;
  constructor(
    private target: number,
    private start: number,
  ) {
    if (![0, -0.1].includes(target)) throw new Error('Unsupported body pitch.');
  }
  update(f: ControllerFeedback): SimulationCommandResult | undefined {
    const [w, x, y, z] = f.quaternion;
    const observed = Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - z * x))));
    if (!Number.isFinite(observed) || !f.angularVelocity.every(Number.isFinite))
      throw new Error('No se puede observar la inclinación.');
    const stable =
      Math.abs(observed - this.target) <= 0.025 &&
      f.angularVelocity.every((v) => Math.abs(v) <= 0.1);
    if (stable) this.stableSince ??= f.timeSeconds;
    else this.stableSince = undefined;
    if (
      this.stableSince !== undefined &&
      f.timeSeconds - this.stableSince >= 0.4
    )
      return {
        status: 'completed',
        evidence: 'simulator',
        level: 'closed-loop-policy',
        timeSeconds: f.timeSeconds,
        bodyPitch: { targetRadians: this.target, observedRadians: observed },
      };
    if (f.timeSeconds - this.start >= 8)
      throw new Error(
        'La inclinación no llegó al objetivo antes del tiempo máximo.',
      );
    return;
  }
}
