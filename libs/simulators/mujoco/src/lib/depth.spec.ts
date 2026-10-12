import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { MujocoDepthSensor, depthDirections } from './depth';
import type { SimulationDepthSensor } from '@botlab/simulators-core';
let mj: MainModule;
beforeAll(async () => {
  mj = await loadMujoco();
});
const config: SimulationDepthSensor = {
  id: 'tof',
  site: 'tof',
  rows: 1,
  columns: 1,
  horizontalFovRadians: Math.PI / 4,
  verticalFovRadians: Math.PI / 4,
  maxRangeMeters: 4,
  frequencyHz: 15,
};
function fixture(geoms = '', sensorGeom = '') {
  const model = mj.MjModel.from_xml_string(
    `<mujoco><option gravity="0 0 0"/><worldbody>${geoms}<body name="sensor"><freejoint/><inertial pos="0 0 0" mass="1" diaginertia="1 1 1"/><site name="tof"/>${sensorGeom}</body></worldbody></mujoco>`,
  );
  const data = new mj.MjData(model);
  const sensor = new MujocoDepthSensor(mj, model, config);
  return {
    model,
    data,
    sensor,
    dispose() {
      sensor.dispose();
      sensor.dispose();
      data.delete();
      model.delete();
    },
  };
}
const wall = '<geom type="box" pos="2 0 0" size=".1 10 10"/>';
describe('geometric ToF with the real MuJoCo WASM engine', () => {
  it('measures nearest surfaces, range limits and no return without zero distances', () => {
    const f = fixture(wall + '<geom type="box" pos="1 0 0" size=".1 .2 .2"/>');
    try {
      expect(f.sensor.sample(f.data).distancesMeters[0]).toBeCloseTo(0.9, 8);
      f.data.qpos[1] = 1;
      f.data.time = 0.1;
      expect(f.sensor.sample(f.data).distancesMeters[0]).toBeCloseTo(1.9, 8);
      f.data.qpos[0] = -3;
      f.data.time = 0.2;
      expect(f.sensor.sample(f.data).statuses).toEqual(['no-return']);
      expect(f.sensor.sample(f.data).distancesMeters).toEqual([null]);
      f.data.qpos[1] = 20;
      f.data.time = 0.3;
      expect(f.sensor.sample(f.data).statuses).toEqual(['no-return']);
    } finally {
      f.dispose();
    }
  });
  it('follows translation and rotation and retains self intersections', () => {
    const f = fixture(wall);
    try {
      f.data.qpos[0] = 0.5;
      expect(f.sensor.sample(f.data).distancesMeters[0]).toBeCloseTo(1.4, 8);
      f.data.qpos[3] = Math.SQRT1_2;
      f.data.qpos[6] = Math.SQRT1_2;
      f.data.time = 0.1;
      expect(f.sensor.sample(f.data).statuses).toEqual(['no-return']);
      expect(f.sensor.sample(f.data).sensorPosition[0]).toBe(0.5);
    } finally {
      f.dispose();
    }
    const self = fixture(wall, '<geom type="sphere" size=".05" pos=".2 0 0"/>');
    try {
      expect(self.sensor.sample(self.data).distancesMeters[0]).toBeCloseTo(
        0.15,
        8,
      );
    } finally {
      self.dispose();
    }
  });
  it('uses simulated time, freezes between samples, resets and releases resources', () => {
    const f = fixture(wall);
    try {
      const first = f.sensor.sample(f.data);
      f.data.time = 0.06;
      f.data.qpos[0] = 0.5;
      expect(f.sensor.sample(f.data)).toBe(first);
      f.data.time = 0.07;
      expect(f.sensor.sample(f.data).sequence).toBe(1);
      expect(f.sensor.sample(f.data).distancesMeters[0]).toBeCloseTo(1.4);
      f.sensor.reset();
      f.data.time = 0;
      expect(f.sensor.sample(f.data).sequence).toBe(0);
      f.sensor.dispose();
      expect(() => f.sensor.sample(f.data)).toThrow('disposed');
    } finally {
      f.dispose();
    }
  });
  it('leaves the running dynamics exactly unchanged', () => {
    const f = fixture(wall);
    const reference = new mj.MjData(f.model);
    try {
      f.data.qvel[0] = reference.qvel[0] = 0.1;
      for (let i = 0; i < 200; i++) {
        mj.mj_step(f.model, f.data);
        mj.mj_step(f.model, reference);
        f.sensor.sample(f.data);
        expect(Array.from(f.data.qpos)).toEqual(Array.from(reference.qpos));
        expect(Array.from(f.data.qvel)).toEqual(Array.from(reference.qvel));
        expect(Array.from(f.data.qacc_warmstart)).toEqual(
          Array.from(reference.qacc_warmstart),
        );
      }
    } finally {
      reference.delete();
      f.dispose();
    }
  });
  it('orders normalized zone centres from top-left and rejects invalid configuration', () => {
    const dirs = depthDirections({ ...config, rows: 8, columns: 8 });
    expect(dirs).toHaveLength(64);
    expect(dirs[0][1]).toBeGreaterThan(0);
    expect(dirs[0][2]).toBeGreaterThan(0);
    expect(dirs[63][1]).toBeLessThan(0);
    expect(dirs[63][2]).toBeLessThan(0);
    for (const d of dirs) expect(Math.hypot(...d)).toBeCloseTo(1, 12);
    expect(() => depthDirections({ ...config, rows: 0 })).toThrow(
      'Invalid depth sensor configuration.',
    );
    expect(() => depthDirections({ ...config, frequencyHz: Infinity })).toThrow(
      'Invalid depth sensor configuration.',
    );
    const f = fixture();
    try {
      expect(
        () =>
          new MujocoDepthSensor(mj, f.model, { ...config, site: 'missing' }),
      ).toThrow('Missing');
    } finally {
      f.dispose();
    }
  });
});
