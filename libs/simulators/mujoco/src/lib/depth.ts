import { validateDepthSensor } from './assets';
import type { MainModule, MjModel, MjData } from '@mujoco/mujoco';
import type {
  SimulationDepthFrame,
  SimulationDepthSensor,
} from '@botlab/simulators-core';

export function depthDirections(sensor: SimulationDepthSensor): number[][] {
  validateDepthSensor(sensor);
  return Array.from({ length: sensor.rows * sensor.columns }, (_, index) => {
    const row = Math.floor(index / sensor.columns),
      col = index % sensor.columns;
    const azimuth =
      (0.5 - (col + 0.5) / sensor.columns) * sensor.horizontalFovRadians;
    const elevation =
      (0.5 - (row + 0.5) / sensor.rows) * sensor.verticalFovRadians;
    return [
      Math.cos(elevation) * Math.cos(azimuth),
      Math.cos(elevation) * Math.sin(azimuth),
      Math.sin(elevation),
    ];
  });
}

/** Own kinematic scratch data: observations never alter controller/solver state. */
export class MujocoDepthSensor {
  private data: MjData;
  private site: number;
  private directions: number[][];
  private lastSlot = -1;
  private last?: SimulationDepthFrame;
  private sequence = 0;
  private disposed = false;
  constructor(
    private mj: MainModule,
    private model: MjModel,
    private config: SimulationDepthSensor,
  ) {
    this.directions = depthDirections(config);
    this.site = mj.mj_name2id(model, mj.mjtObj.mjOBJ_SITE.value, config.site);
    if (this.site < 0)
      throw new Error(`Missing depth sensor site: ${config.site}`);
    this.data = new mj.MjData(model);
  }
  sample(state: MjData): SimulationDepthFrame {
    if (this.disposed) throw new Error('Depth sensor is disposed.');
    const slot = Math.floor(state.time * this.config.frequencyHz + 1e-9);
    if (this.last && slot === this.lastSlot) return this.last;
    const begin = performance.now();
    this.data.qpos.set(state.qpos);
    this.data.mocap_pos.set(state.mocap_pos);
    this.data.mocap_quat.set(state.mocap_quat);
    this.mj.mj_kinematics(this.model, this.data);
    const origin = Array.from(
      this.data.site_xpos.slice(this.site * 3, this.site * 3 + 3),
      Number,
    );
    const rotation = Array.from(
      this.data.site_xmat.slice(this.site * 9, this.site * 9 + 9),
      Number,
    );
    const distancesMeters: (number | null)[] = [];
    const statuses: SimulationDepthFrame['statuses'] = [];
    for (const local of this.directions) {
      const direction = [0, 1, 2].map(
        (row) =>
          rotation[row * 3] * local[0] +
          rotation[row * 3 + 1] * local[1] +
          rotation[row * 3 + 2] * local[2],
      );
      const distance = this.mj.mj_ray(
        this.model,
        this.data,
        origin,
        direction,
        [1, 1, 1, 1, 1, 1],
        true,
        -1,
        null,
        null,
      );
      const status =
        !Number.isFinite(distance) || distance < -1
          ? 'invalid'
          : distance < 0 || distance > this.config.maxRangeMeters
            ? 'no-return'
            : 'hit';
      statuses.push(status);
      distancesMeters.push(status === 'hit' ? distance : null);
    }
    this.lastSlot = slot;
    this.last = {
      sensorId: this.config.id,
      sequence: this.sequence++,
      capturedAtSeconds: state.time,
      rows: this.config.rows,
      columns: this.config.columns,
      maxRangeMeters: this.config.maxRangeMeters,
      distancesMeters,
      statuses,
      sensorPosition: origin,
      sensorRotation: rotation,
      processingMilliseconds: performance.now() - begin,
    };
    return this.last;
  }
  reset() {
    this.lastSlot = -1;
    this.last = undefined;
    this.sequence = 0;
  }
  dispose() {
    if (!this.disposed) {
      this.disposed = true;
      this.data.delete();
    }
  }
}
