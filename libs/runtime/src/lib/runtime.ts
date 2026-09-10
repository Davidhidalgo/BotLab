import type {
  BotLabAdapter,
  Capability,
  IntrospectionSnapshot,
  SimulatorIntegration,
  Target,
} from '@botlab/model';

export interface RuntimeConfig {
  adapters: BotLabAdapter[];
  simulators: SimulatorIntegration[];
}

export interface BotLabRuntime {
  listTargets(): Target[];
  listCapabilities(): Capability[];
  listSimulatorIntegrations(): SimulatorIntegration[];
  inspectTarget(targetId: string): IntrospectionSnapshot;
}

export function createBotLabRuntime(config: RuntimeConfig): BotLabRuntime {
  return {
    listTargets() {
      return config.adapters.flatMap((adapter) => adapter.targets);
    },
    listCapabilities() {
      return config.adapters.flatMap((adapter) => adapter.capabilities);
    },
    listSimulatorIntegrations() {
      return config.simulators;
    },
    inspectTarget(targetId) {
      const target = config.adapters
        .flatMap((adapter) => adapter.targets)
        .find((candidate) => candidate.id === targetId);

      return {
        targetId,
        health: target?.status === 'available' ? 'nominal' : 'unknown',
        messages: target
          ? [`${target.name} is registered through ${target.adapterId}.`]
          : ['Target is not registered in this runtime session.'],
      };
    },
  };
}
