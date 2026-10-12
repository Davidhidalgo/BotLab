/** Browser-independent contracts. All distances/times/angles use m/s/rad. */
export type SimulationEvidenceLevel =
  | 'command-validation'
  | 'kinematic-preview'
  | 'physics'
  | 'closed-loop-policy';

export interface SimulationAsset {
  path: string;
  url: string;
  sha256: string;
  bytes: number;
  source: string;
}

export interface JointServo {
  name: string;
  min: number;
  max: number;
  home: number;
  kp: number;
  kd: number;
  effortLimit: number;
}

export interface ServoCurve {
  plateau: number;
  cornerRpm: number;
  decayRpm: number;
  cutoffRpm: number;
  continuous: number;
  peakSeconds: number;
}

export interface SimulationManifest {
  schemaVersion: 1;
  id: string;
  robotId: string;
  revision: string;
  mujocoVersion: string;
  scene: string;
  assets: SimulationAsset[];
  joints: JointServo[];
  servoCurve?: ServoCurve;
  actuation?: 'motor' | 'position';
  initialKeyframe?: string;
  rootBody?: string;
  gyroSensor?: string;
  controller?: {
    id: string;
    model: string;
    decimation: number;
    observationSize: number;
    actionSize: number;
  };
  evidenceLevel: SimulationEvidenceLevel;
  variant: string;
  limitations: string[];
}

export interface RenderGeometry {
  id: number;
  type: number;
  size: number[];
  rgba: number[];
  mesh?: { vertices: number[]; indices: number[] };
}

export interface SimulationFrame {
  sessionId: string;
  generation: number;
  tick: number;
  timeSeconds: number;
  state: 'ready' | 'running' | 'paused' | 'error';
  rootPosition: number[];
  rootQuaternion: number[];
  positions: number[];
  velocities: number[];
  efforts: number[];
  targets: number[];
  /** Packed world positions and row-major rotation matrices, Z up. */
  geomPositions: number[];
  geomRotations: number[];
}

export interface SimulationJointCommand {
  joint: string;
  positionRadians: number;
  toleranceRadians: number;
  timeoutSeconds: number;
}

export interface SimulationCommandResult {
  status: 'completed';
  evidence: 'simulator';
  level: 'physics' | 'closed-loop-policy';
  finalErrorRadians?: number;
  displacementMeters?: number;
  /** Unwrapped for measured goals; shortest signed heading change for timed velocity. */
  yawRadians?: number;
  targetDistanceMeters?: number;
  forwardDisplacementMeters?: number;
  targetYawRadians?: number;
  timeSeconds: number;
}

export interface SimulationVelocityCommand {
  kind: 'velocity';
  forward: number;
  yaw: number;
  durationSeconds: number;
}
/** Goal tracking runs in the physics worker, never on render-frame cadence. */
export type SimulationMotionGoal =
  | {
      kind: 'distance';
      distanceMeters: number;
      speed: number;
      timeoutSeconds: number;
    }
  | {
      kind: 'turn';
      angleRadians: number;
      speed: number;
      timeoutSeconds: number;
    };
export type SimulationCommand =
  | SimulationJointCommand
  | SimulationVelocityCommand
  | SimulationMotionGoal;

export interface SimulationSession {
  readonly sessionId: string;
  load(manifest: SimulationManifest): Promise<{
    geometry: RenderGeometry[];
    frame: SimulationFrame;
  }>;
  start(): Promise<SimulationFrame>;
  pause(): Promise<SimulationFrame>;
  step(): Promise<SimulationFrame>;
  reset(): Promise<SimulationFrame>;
  stop(): Promise<SimulationFrame>;
  command(
    command: SimulationCommand,
    signal?: AbortSignal,
  ): Promise<SimulationCommandResult>;
  subscribe(listener: (frame: SimulationFrame) => void): () => void;
  dispose(): void;
}
