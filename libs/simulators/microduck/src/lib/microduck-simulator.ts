import type { CompiledBehaviorArtifact, Target } from '@botlab/model';
import {
  createSimulatorSnapshot,
  defineSimulatorIntegration,
  defineSimulatorIntegrations,
  type SimulatorBridge,
  type SimulatorSnapshot,
} from '@botlab/simulators-core';

export const microDuckOfficialSimulatorIntegration =
  defineSimulatorIntegration({
    id: 'microduck-official-sim',
    name: 'MicroDuck demo simulator bridge',
    status: 'available',
    dependencyStrategy: 'manual-bridge',
  });

export const microDuckSimulatorIntegrations = defineSimulatorIntegrations([
  microDuckOfficialSimulatorIntegration,
]);

export interface MicroDuckSimulatorBridgeOptions {
  now?: () => string;
}

export function createMicroDuckSimulatorBridge(
  options: MicroDuckSimulatorBridgeOptions = {}
): SimulatorBridge {
  let snapshot = createMicroDuckSnapshot({
    state: 'idle',
    commandCount: 0,
    messages: ['MicroDuck simulator bridge waiting for a target.'],
  });

  return {
    integration: microDuckOfficialSimulatorIntegration,
    boot(target: Target) {
      const integrationId = target.profile?.simulator?.integrationId;

      if (target.kind !== 'simulator' || integrationId !== snapshot.simulatorId) {
        snapshot = createMicroDuckSnapshot({
          targetId: target.id,
          state: 'error',
          commandCount: 0,
          messages: [
            `${target.name} is not connected to the MicroDuck simulator bridge.`,
          ],
        });

        return snapshot;
      }

      snapshot = createMicroDuckSnapshot({
        targetId: target.id,
        state: 'ready',
        commandCount: 0,
        messages: [`MicroDuck simulator ready for ${target.name}.`],
      });

      return snapshot;
    },
    simulate(artifact: CompiledBehaviorArtifact) {
      if (snapshot.state !== 'ready' || snapshot.targetId !== artifact.targetId) {
        throw new Error('Boot the MicroDuck simulator target before simulating.');
      }

      const commandCount = artifact.commands.length;
      const timestamp = options.now?.() ?? new Date().toISOString();

      snapshot = createMicroDuckSnapshot({
        targetId: artifact.targetId,
        state: 'ready',
        commandCount,
        artifactId: artifact.id,
        messages: [
          `MicroDuck simulator checked ${commandCount} command(s) at ${timestamp}.`,
          ...artifact.commands.map(
            (command) =>
              `${command.commandId} -> ${JSON.stringify(command.inputs)}`
          ),
        ],
      });

      return {
        simulatorId: snapshot.simulatorId,
        artifactId: artifact.id,
        status: 'passed' as const,
        commandCount,
        commands: [...artifact.commands],
        snapshot,
        messages: [...snapshot.messages],
      };
    },
    reset() {
      snapshot = createMicroDuckSnapshot({
        targetId: snapshot.targetId,
        state: snapshot.targetId ? 'ready' : 'idle',
        commandCount: 0,
        messages: ['MicroDuck simulator bridge reset.'],
      });

      return snapshot;
    },
    dispose() {
      snapshot = createMicroDuckSnapshot({
        targetId: snapshot.targetId,
        state: 'disposed',
        commandCount: snapshot.commandCount,
        artifactId: snapshot.artifactId,
        messages: ['MicroDuck simulator bridge disposed.'],
      });

      return snapshot;
    },
    snapshot() {
      return createSimulatorSnapshot(snapshot);
    },
  };
}

function createMicroDuckSnapshot(
  snapshot: Omit<SimulatorSnapshot, 'simulatorId'>
): SimulatorSnapshot {
  return createSimulatorSnapshot({
    simulatorId: microDuckOfficialSimulatorIntegration.id,
    ...snapshot,
  });
}
