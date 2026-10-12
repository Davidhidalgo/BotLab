import type {
  SimulationCommandResult,
  SimulationMotionGoal,
} from '@botlab/simulators-core';
import type { ControllerFeedback } from './controller';

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const heading = (f: ControllerFeedback) => {
  const [w, x, y, z] = f.quaternion;
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
};
/** Tracks signed progress, excluding body sway and heading wraparound. */
export class MotionGoal {
  private origin?: number[];
  private originYaw = 0;
  private previousYaw = 0;
  private rotation = 0;
  private settledSince?: number;
  private progressAt = 0;
  private progressTime: number;
  private velocity = { forward: 0, yaw: 0 };
  private readonly tolerance: number;
  constructor(
    readonly command: SimulationMotionGoal,
    private readonly start: number,
  ) {
    const value =
      command.kind === 'distance'
        ? command.distanceMeters
        : command.angleRadians;
    if (
      ![value, command.speed, command.timeoutSeconds, start].every(
        Number.isFinite,
      ) ||
      command.speed <= 0 ||
      command.timeoutSeconds <= 0 ||
      command.timeoutSeconds > 600 ||
      (command.kind === 'distance'
        ? value < 0 || value > 20
        : Math.abs(value) > 2 * Math.PI)
    )
      throw new Error('Objetivo de movimiento no válido.');
    this.tolerance = command.kind === 'distance' ? 0.025 : (5 * Math.PI) / 180;
    this.progressTime = start;
  }
  intent() {
    return this.velocity;
  }
  update(f: ControllerFeedback): SimulationCommandResult | undefined {
    const now = f.timeSeconds;
    if (![...f.rootPosition, ...f.quaternion, now].every(Number.isFinite))
      throw new Error('No se puede medir el movimiento.');
    if (now - this.start >= this.command.timeoutSeconds)
      throw new Error(
        'No se ha alcanzado el objetivo a tiempo. Prueba una distancia o un giro menor.',
      );
    // Let the balance controller settle before measuring the educational action.
    if (now - this.start < 1) return;
    const currentYaw = heading(f);
    if (!this.origin) {
      this.origin = [...f.rootPosition];
      this.originYaw = this.previousYaw = currentYaw;
      this.progressTime = now;
    }
    this.rotation += wrap(currentYaw - this.previousYaw);
    this.previousYaw = currentYaw;
    const dx = f.rootPosition[0] - this.origin[0],
      dy = f.rootPosition[1] - this.origin[1];
    const forward =
      dx * Math.cos(this.originYaw) + dy * Math.sin(this.originYaw);
    const distance = this.command.kind === 'distance';
    const target = distance
      ? this.command.distanceMeters
      : this.command.angleRadians;
    const measured = distance ? forward : this.rotation;
    const error = target - measured;
    // Stop inside a tighter band, then verify the final result after coasting.
    const close =
      Math.abs(error) <=
      this.tolerance *
        (this.settledSince === undefined ? (distance ? 0.2 : 0.45) : 1);
    if (close || (distance && error < 0)) {
      this.velocity = { forward: 0, yaw: 0 };
      this.settledSince ??= now;
      if (now - this.settledSince >= 0.8) {
        if (Math.abs(error) > this.tolerance)
          throw new Error(
            'El robot ha sobrepasado la distancia. Reinicia y prueba un avance más corto.',
          );
        return {
          status: 'completed',
          evidence: 'simulator',
          level: 'closed-loop-policy',
          timeSeconds: now,
          displacementMeters: Math.hypot(dx, dy),
          yawRadians: this.rotation,
          ...(distance
            ? {
                targetDistanceMeters: target,
                forwardDisplacementMeters: forward,
              }
            : { targetYawRadians: target }),
        };
      }
    } else {
      this.settledSince = undefined;
      this.velocity = distance
        ? {
            // Low forward intents can leave the learned policy stationary.
            forward: this.command.speed,
            yaw: 0,
          }
        : {
            forward: 0,
            yaw:
              Math.sign(error) *
              Math.min(
                this.command.speed,
                Math.max(0.65, Math.abs(error) * 1.5),
              ),
          };
    }
    if (Math.abs(measured - this.progressAt) >= (distance ? 0.01 : 0.05)) {
      this.progressAt = measured;
      this.progressTime = now;
    } else if (
      this.settledSince === undefined &&
      now - this.progressTime > 10
    ) {
      throw new Error(
        'El robot no avanza hacia el objetivo. Detén y reinicia la simulación.',
      );
    }
    return undefined;
  }
}
