import type {
  CompiledBehaviorArtifact,
  CompiledCommand,
  SimulatorIntegration,
  Target,
} from '@botlab/model';

export type BotLabSimulatorIntegration = SimulatorIntegration;

export type SimulatorBridgeState =
  | 'idle'
  | 'booting'
  | 'ready'
  | 'simulating'
  | 'disposed'
  | 'error';

export interface SimulatorSnapshot {
  simulatorId: string;
  targetId?: string;
  state: SimulatorBridgeState;
  commandCount: number;
  artifactId?: string;
  messages: string[];
}

export interface SimulatorRunResult {
  simulatorId: string;
  artifactId: string;
  status: 'passed' | 'failed';
  commandCount: number;
  commands: CompiledCommand[];
  snapshot: SimulatorSnapshot;
  messages: string[];
}

export interface SimulatorBridge {
  readonly integration: SimulatorIntegration;
  boot(target: Target): SimulatorSnapshot | Promise<SimulatorSnapshot>;
  simulate(
    artifact: CompiledBehaviorArtifact,
  ): SimulatorRunResult | Promise<SimulatorRunResult>;
  reset?(): SimulatorSnapshot | Promise<SimulatorSnapshot>;
  dispose?(): SimulatorSnapshot | Promise<SimulatorSnapshot>;
  snapshot?(): SimulatorSnapshot;
}

export function defineSimulatorIntegration(
  integration: SimulatorIntegration,
): SimulatorIntegration {
  return integration;
}

export function defineSimulatorIntegrations(
  integrations: SimulatorIntegration[],
): SimulatorIntegration[] {
  return integrations;
}

export function createSimulatorSnapshot(
  snapshot: SimulatorSnapshot,
): SimulatorSnapshot {
  return {
    ...snapshot,
    messages: [...snapshot.messages],
  };
}
