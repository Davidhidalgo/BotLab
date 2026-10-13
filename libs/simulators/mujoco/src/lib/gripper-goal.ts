import type { GripperAction, GripperTarget } from '@botlab/model';
import type { SimulationCommandResult } from '@botlab/simulators-core';
import type { ControllerFeedback } from './controller';
import { RestGoal } from './rest-goal';
/** Arrival requires every carried-arm joint and a stable balancing window. */
export class GripperGoal {
  private rest: RestGoal | undefined;
  constructor(
    private action: GripperAction,
    private target: GripperTarget,
    private indices: number[],
    private start: number,
  ) {
    if (
      !indices.length ||
      indices.length !== target.joints.length ||
      indices.some((i) => i < 0)
    )
      throw new Error('Gripper joints are unavailable.');
  }
  update(
    f: ControllerFeedback,
    ready: boolean,
  ): SimulationCommandResult | undefined {
    if (f.timeSeconds - this.start >= 10)
      throw new Error(
        'La pinza no alcanzó la postura antes del tiempo máximo.',
      );
    const errors = this.indices.map((index, i) =>
      Math.abs(f.positions[index] - this.target.joints[i].radians),
    );
    if (
      !errors.every(Number.isFinite) ||
      this.indices.some((index) => !Number.isFinite(f.velocities[index]))
    )
      throw new Error('No se puede observar la pinza.');
    const maxJointErrorRadians = Math.max(...errors);
    if (
      !ready ||
      maxJointErrorRadians > 0.07 ||
      this.indices.some((index) => Math.abs(f.velocities[index]) > 0.1)
    ) {
      this.rest = undefined;
      return;
    }
    this.rest ??= new RestGoal(f.timeSeconds);
    const result = this.rest.update(f);
    if (!result) return;
    return {
      ...result,
      gripper: {
        action: this.action,
        side: this.target.side,
        position: this.target.position,
        maxJointErrorRadians,
      },
    };
  }
}
