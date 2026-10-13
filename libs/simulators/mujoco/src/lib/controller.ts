import type {
  SimulationManifest,
  SimulationSkill,
} from '@botlab/simulators-core';

/** A controller only sees copied feedback. The host commits its output after cancellation checks. */
export interface ControllerFeedback {
  rootPosition: number[];
  positions: number[];
  velocities: number[];
  efforts: number[];
  quaternion: number[];
  angularVelocity: number[];
  timeSeconds: number;
}
export interface ControllerOutput {
  targets: number[];
  state: number[];
  kp?: number[];
  kd?: number[];
}
export interface SimulationController {
  setSkill?(skill: SimulationSkill): void;
  isSkillRunning?(): boolean;
  cancelSkill?(): void;
  /** Optional robot-specific head channel, distinct from body turning. */
  setPosture?(posture: 'sit' | 'stand'): void;
  getPosture?(): 'sit' | 'stand' | 'transitioning';
  setHeadYaw?(angleRadians: number): void;
  /** Robot-specific approach speed; measured stopping and tolerances stay shared. */
  turnProfile?: 'constant' | 'tapered';
  /** Fraction of angular tolerance at which braking begins; default 0.45. */
  turnStopFraction?: number;
  validateFeedback(feedback: ControllerFeedback): void;
  validateVelocity(velocity: { forward: number; yaw: number }): void;
  infer(
    feedback: ControllerFeedback,
    velocity: { forward: number; yaw: number },
  ): Promise<ControllerOutput>;
  accept(output: ControllerOutput): void;
  reset(): void;
  /** Invalidate any outstanding asynchronous inference without publishing targets. */
  invalidate?(): void;
  dispose(): Promise<void>;
}
export type ControllerFactory = (
  manifest: SimulationManifest,
  files: Record<string, Uint8Array>,
) => Promise<SimulationController>;
