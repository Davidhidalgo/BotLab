import { evaluateFrontProximity } from '@botlab/simulators-core';
import { MujocoDepthSensor } from './depth';
import type { MainModule, MjModel, MjData } from '@mujoco/mujoco';
import type {
  RenderGeometry,
  SimulationFrame,
  SimulationManifest,
} from '@botlab/simulators-core';
import { validateManifest } from './assets';
import { servoEffort } from './servo';
import type { ControllerFeedback } from './controller';

export class MujocoWorld {
  private model: MjModel;
  private data: MjData;
  private mapping: Array<{ q: number; v: number; actuator: number }> = [];
  private heat: number[] = [];
  private gains: Array<{ kp: number; kd: number }> = [];
  private depth?: MujocoDepthSensor;
  private tick = 0;
  private disposed = false;
  readonly targets: number[];
  readonly timestep: number;

  constructor(
    private mj: MainModule,
    readonly manifest: SimulationManifest,
    files: Record<string, Uint8Array>,
  ) {
    validateManifest(manifest);
    const vfs = new mj.MjVFS();
    let model: MjModel | undefined;
    let data: MjData | undefined;
    try {
      for (const asset of manifest.assets) {
        const bytes = files[asset.path];
        if (!bytes) throw new Error(`Missing verified resource: ${asset.path}`);
        vfs.addBuffer(asset.path, bytes);
      }
      model = mj.MjModel.from_xml_path(manifest.scene, vfs);
      data = new mj.MjData(model);
      this.model = model;
      this.data = data;
      this.timestep = model.opt.timestep;
      if (!(this.timestep > 0 && this.timestep <= 0.02))
        throw new Error('Unsupported physics timestep.');
      for (const joint of manifest.joints) {
        const id = mj.mj_name2id(
          model,
          mj.mjtObj.mjOBJ_JOINT.value,
          joint.name,
        );
        const actuator = mj.mj_name2id(
          model,
          mj.mjtObj.mjOBJ_ACTUATOR.value,
          joint.name,
        );
        if (
          id < 0 ||
          actuator < 0 ||
          model.jnt_type[id] !== mj.mjtJoint.mjJNT_HINGE.value ||
          model.actuator_trnid[actuator * 2] !== id
        )
          throw new Error(`Missing or incompatible hinge/motor: ${joint.name}`);
        this.mapping.push({
          q: model.jnt_qposadr[id],
          v: model.jnt_dofadr[id],
          actuator,
        });
      }
      this.targets = manifest.joints.map((j) => j.home);
      if (manifest.depthSensor)
        this.depth = new MujocoDepthSensor(mj, model, manifest.depthSensor);
      this.reset();
    } catch (error) {
      this.depth?.dispose();
      data?.delete();
      model?.delete();
      throw error;
    } finally {
      vfs.delete();
    }
  }

  reset() {
    this.assertActive();
    const key = this.manifest.initialKeyframe;
    if (key) {
      const id = this.mj.mj_name2id(
        this.model,
        this.mj.mjtObj.mjOBJ_KEY.value,
        key,
      );
      if (id < 0) throw new Error('Initial keyframe is missing.');
      this.mj.mj_resetDataKeyframe(this.model, this.data, id);
    } else this.mj.mj_resetData(this.model, this.data);
    for (const [index, mapping] of this.mapping.entries()) {
      this.data.qpos[mapping.q] = this.manifest.joints[index].home;
      this.targets[index] = this.manifest.joints[index].home;
    }
    this.heat = this.targets.map(() => 0);
    this.gains = this.manifest.joints.map(({ kp, kd }) => ({ kp, kd }));
    this.tick = 0;
    this.depth?.reset();
    this.mj.mj_forward(this.model, this.data);
  }

  proximity(thresholdMeters: number) {
    this.assertActive();
    return evaluateFrontProximity(
      this.depth?.sample(this.data, true),
      this.data.time,
      thresholdMeters,
    );
  }
  hold() {
    this.assertActive();
    this.mapping.forEach((m, i) => {
      this.targets[i] = this.data.qpos[m.q];
    });
    this.data.ctrl.fill(0);
  }

  setTarget(name: string, radians: number) {
    this.assertActive();
    const index = this.manifest.joints.findIndex((j) => j.name === name);
    const joint = this.manifest.joints[index];
    if (
      !joint ||
      !Number.isFinite(radians) ||
      radians < joint.min ||
      radians > joint.max
    )
      throw new Error('Joint position is outside the declared limits.');
    this.targets[index] = radians;
    return index;
  }

  step() {
    this.assertActive();
    this.mapping.forEach((m, i) => {
      if (this.manifest.actuation === 'position') {
        this.data.ctrl[m.actuator] = this.targets[i];
        return;
      }
      const result = servoEffort(
        { ...this.manifest.joints[i], ...this.gains[i] },
        this.data.qpos[m.q],
        this.data.qvel[m.v],
        this.targets[i],
        this.heat[i],
        this.timestep,
        this.manifest.servoCurve,
      );
      this.data.ctrl[m.actuator] = result.effort;
      this.heat[i] = result.heat;
    });
    this.mj.mj_step(this.model, this.data);
    this.tick++;
    if (
      ![...this.data.qpos, ...this.data.qvel, ...this.data.qacc].every(
        Number.isFinite,
      ) ||
      Math.abs(this.data.time - this.tick * this.timestep) > this.timestep * 0.1
    )
      throw new Error('Physics diverged or reset unexpectedly.');
  }

  frame(
    sessionId: string,
    generation: number,
    state: SimulationFrame['state'],
  ): SimulationFrame {
    this.assertActive();
    return {
      sessionId,
      generation,
      tick: this.tick,
      timeSeconds: this.data.time,
      state,
      depth: this.depth?.sample(this.data),
      rootPosition: this.rootPosition(),
      rootQuaternion: this.rootQuaternion(),
      positions: this.mapping.map((m) => this.data.qpos[m.q]),
      velocities: this.mapping.map((m) => this.data.qvel[m.v]),
      efforts: this.mapping.map((m) => this.data.qfrc_actuator[m.v]),
      targets: [...this.targets],
      geomPositions: Array.from(this.data.geom_xpos),
      geomRotations: Array.from(this.data.geom_xmat),
    };
  }

  private rootId() {
    return this.manifest.rootBody
      ? this.mj.mj_name2id(
          this.model,
          this.mj.mjtObj.mjOBJ_BODY.value,
          this.manifest.rootBody,
        )
      : -1;
  }
  private rootPosition() {
    const id = this.rootId();
    return id < 0
      ? []
      : Array.from(this.data.xpos.slice(id * 3, id * 3 + 3), Number);
  }
  private rootQuaternion() {
    const id = this.rootId();
    return id < 0
      ? []
      : Array.from(this.data.xquat.slice(id * 4, id * 4 + 4), Number);
  }
  feedback(): ControllerFeedback {
    const sensor = this.manifest.gyroSensor
      ? this.mj.mj_name2id(
          this.model,
          this.mj.mjtObj.mjOBJ_SENSOR.value,
          this.manifest.gyroSensor,
        )
      : -1;
    if (sensor < 0 || this.model.sensor_dim[sensor] !== 3 || this.rootId() < 0)
      throw new Error('Controller feedback is unavailable.');
    const adr = this.model.sensor_adr[sensor];
    return {
      rootPosition: this.rootPosition(),
      positions: this.mapping.map((m) => this.data.qpos[m.q]),
      velocities: this.mapping.map((m) => this.data.qvel[m.v]),
      efforts: this.mapping.map((m) => this.data.qfrc_actuator[m.v]),
      quaternion: this.rootQuaternion(),
      angularVelocity: Array.from(this.data.sensordata.slice(adr, adr + 3)),
      timeSeconds: this.data.time,
    };
  }
  setControllerGains(kp?: readonly number[], kd?: readonly number[]) {
    if (!kp && !kd) return;
    if (
      kp?.length !== this.targets.length ||
      kd?.length !== this.targets.length ||
      ![...kp, ...kd].every((v) => Number.isFinite(v) && v >= 0)
    )
      throw new Error('Invalid controller gains.');
    this.gains = kp.map((v, i) => ({ kp: v, kd: kd[i] }));
  }
  setControllerTargets(targets: readonly number[]) {
    if (
      targets.length !== this.targets.length ||
      !targets.every(Number.isFinite)
    )
      throw new Error('Invalid controller output.');
    // Position policies may command beyond joint limits; MJCF actuator ctrl/force limits still apply.
    targets.forEach((value, i) => {
      this.targets[i] = value;
    });
  }

  geometry(): RenderGeometry[] {
    this.assertActive();
    return Array.from({ length: this.model.ngeom }, (_, id) => {
      const meshId = this.model.geom_dataid[id];
      const geometry: RenderGeometry = {
        id,
        type: this.model.geom_type[id],
        size: Array.from(this.model.geom_size.slice(id * 3, id * 3 + 3)),
        rgba: Array.from(this.model.geom_rgba.slice(id * 4, id * 4 + 4)),
      };
      const material = this.model.geom_matid[id];
      if (material >= 0)
        geometry.rgba = Array.from(
          this.model.mat_rgba.slice(material * 4, material * 4 + 4),
        );
      // Render visual geoms and primitive scene geoms; keep collision-only meshes hidden.
      if (this.model.geom_group[id] === 3 || this.model.geom_group[id] === 1)
        geometry.rgba[3] = 0;
      if (geometry.type === this.mj.mjtGeom.mjGEOM_MESH.value && meshId >= 0) {
        const start = this.model.mesh_vertadr[meshId] * 3;
        const face = this.model.mesh_faceadr[meshId] * 3;
        geometry.mesh = {
          vertices: Array.from(
            this.model.mesh_vert.slice(
              start,
              start + this.model.mesh_vertnum[meshId] * 3,
            ),
          ),
          indices: Array.from(
            this.model.mesh_face.slice(
              face,
              face + this.model.mesh_facenum[meshId] * 3,
            ),
          ),
        };
      }
      return geometry;
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.depth?.dispose();
    this.data.delete();
    this.model.delete();
  }

  private assertActive() {
    if (this.disposed) throw new Error('Simulation world is disposed.');
  }
}
