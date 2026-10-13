import type { ControllerFeedback } from './controller';
import type { SimulationCommandResult } from '@botlab/simulators-core';
/** A zero-motion intent is complete only after a measured stable window. */
export class RestGoal {
  private samples: Array<{ time: number; x: number; y: number; yaw: number }> =
    [];
  constructor(private start: number) {}
  update(f: ControllerFeedback): SimulationCommandResult | undefined {
    if (
      ![
        f.timeSeconds,
        ...f.rootPosition,
        ...f.quaternion,
        ...f.angularVelocity,
      ].every(Number.isFinite)
    )
      throw new Error('No se puede observar la parada.');
    if (f.timeSeconds - this.start >= 5)
      throw new Error(
        'El robot no estabilizó la parada antes del tiempo máximo.',
      );
    const [w, x, y, z] = f.quaternion;
    const yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
    if (f.angularVelocity.some((v) => Math.abs(v) > 0.1)) {
      this.samples = [];
      return;
    }
    this.samples.push({
      time: f.timeSeconds,
      x: f.rootPosition[0],
      y: f.rootPosition[1],
      yaw,
    });
    while (
      this.samples.length > 1 &&
      f.timeSeconds - this.samples[1].time >= 0.8
    )
      this.samples.shift();
    const first = this.samples[0],
      duration = f.timeSeconds - first.time;
    if (duration < 0.8) return;
    const drift = Math.max(
      ...this.samples.map((s) => Math.hypot(s.x - first.x, s.y - first.y)),
    );
    const rotation = Math.max(
      ...this.samples.map((s) =>
        Math.abs(
          Math.atan2(Math.sin(s.yaw - first.yaw), Math.cos(s.yaw - first.yaw)),
        ),
      ),
    );
    if (drift > 0.01 || rotation > 0.05) return;
    return {
      status: 'completed',
      evidence: 'simulator',
      level: 'closed-loop-policy',
      timeSeconds: f.timeSeconds,
      rest: {
        durationSeconds: duration,
        driftMeters: drift,
        rotationRadians: rotation,
      },
    };
  }
}
