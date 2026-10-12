import type {
  SimulationCommandResult,
  SimulationFrame,
  SimulationCommand,
  SimulationManifest,
  RenderGeometry,
} from '@botlab/simulators-core';

export interface WorkerRequest {
  sessionId: string;
  generation: number;
  id: number;
  operation: 'load' | 'start' | 'pause' | 'step' | 'reset' | 'stop' | 'command';
  manifest?: SimulationManifest;
  command?: SimulationCommand;
}
export interface WorkerResponse {
  sessionId: string;
  generation: number;
  id?: number;
  error?: string;
  frame?: SimulationFrame;
  geometry?: RenderGeometry[];
  result?: SimulationCommandResult;
}
