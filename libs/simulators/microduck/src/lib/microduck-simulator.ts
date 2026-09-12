import type {
  CompiledBehaviorArtifact,
  CompiledCommand,
  Target,
} from '@botlab/model';
import {
  createSimulatorSnapshot,
  defineSimulatorIntegration,
  defineSimulatorIntegrations,
  type SimulatorBridge,
  type SimulatorSnapshot,
} from '@botlab/simulators-core';

export const microDuckOfficialSimulatorIntegration = defineSimulatorIntegration(
  {
    id: 'microduck-official-sim',
    name: 'MicroDuck demo simulator bridge',
    status: 'available',
    dependencyStrategy: 'manual-bridge',
  }
);

export const microDuckSimulatorIntegrations = defineSimulatorIntegrations([
  microDuckOfficialSimulatorIntegration,
]);

export interface MicroDuckSimulatorBridgeOptions {
  now?: () => string;
}

export type MicroDuckLedPattern = 'smile' | 'blink' | 'solid' | 'off';

export interface MicroDuckSimulatorLedFrame {
  id: string;
  type: 'led-pattern';
  targetId: string;
  pattern: MicroDuckLedPattern;
  brightness: number;
}

export interface MicroDuckSimulatorDifferentialDriveFrame {
  id: string;
  type: 'differential-drive';
  targetId: string;
  leftPower: number;
  rightPower: number;
}

export type MicroDuckSimulatorControlFrame =
  | MicroDuckSimulatorLedFrame
  | MicroDuckSimulatorDifferentialDriveFrame;

export interface MicroDuckSimulatorControlSource {
  artifactId: string;
  targetId: string;
  frames: MicroDuckSimulatorControlFrame[];
  messages: string[];
  errors: string[];
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

      if (
        target.kind !== 'simulator' ||
        integrationId !== snapshot.simulatorId
      ) {
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
      if (
        snapshot.state !== 'ready' ||
        snapshot.targetId !== artifact.targetId
      ) {
        throw new Error(
          'Boot the MicroDuck simulator target before simulating.'
        );
      }

      const controlSource = createMicroDuckSimulatorControlSource(artifact);

      if (controlSource.errors.length > 0) {
        throw new Error(controlSource.errors.join(' '));
      }

      const commandCount = controlSource.frames.length;
      const timestamp = options.now?.() ?? new Date().toISOString();

      snapshot = createMicroDuckSnapshot({
        targetId: artifact.targetId,
        state: 'ready',
        commandCount,
        artifactId: artifact.id,
        messages: [
          `MicroDuck simulator checked ${commandCount} command(s) at ${timestamp}.`,
          ...controlSource.messages,
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

export function createMicroDuckSimulatorControlSource(
  artifact: CompiledBehaviorArtifact
): MicroDuckSimulatorControlSource {
  const frames: MicroDuckSimulatorControlFrame[] = [];
  const errors: string[] = [];

  for (const command of artifact.commands) {
    const frame = createMicroDuckSimulatorControlFrame(command);

    if (typeof frame === 'string') {
      errors.push(frame);
      continue;
    }

    frames.push(frame);
  }

  return {
    artifactId: artifact.id,
    targetId: artifact.targetId,
    frames,
    errors,
    messages: frames.map(formatControlFrameMessage),
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

function createMicroDuckSimulatorControlFrame(
  command: CompiledCommand
): MicroDuckSimulatorControlFrame | string {
  if (
    command.capabilityId === 'microduck-leds' &&
    (command.commandId === 'set-led-pattern' ||
      command.commandId === 'microduck.set-leds')
  ) {
    const pattern = command.inputs['pattern'];
    const brightness = command.inputs['brightness'];

    if (!isMicroDuckLedPattern(pattern)) {
      return `MicroDuck simulator command ${command.id} needs a valid LED pattern.`;
    }

    if (typeof brightness !== 'number') {
      return `MicroDuck simulator command ${command.id} needs numeric brightness.`;
    }

    return {
      id: command.id,
      type: 'led-pattern',
      targetId: command.targetId,
      pattern,
      brightness,
    };
  }

  if (
    command.capabilityId === 'microduck-motion' &&
    command.commandId === 'drive-differential'
  ) {
    const leftPower = command.inputs['leftPower'];
    const rightPower = command.inputs['rightPower'];

    if (typeof leftPower !== 'number' || typeof rightPower !== 'number') {
      return `MicroDuck simulator command ${command.id} needs numeric differential drive inputs.`;
    }

    return {
      id: command.id,
      type: 'differential-drive',
      targetId: command.targetId,
      leftPower,
      rightPower,
    };
  }

  return `Unsupported MicroDuck simulator command ${command.commandId} for capability ${command.capabilityId}.`;
}

function isMicroDuckLedPattern(value: unknown): value is MicroDuckLedPattern {
  return (
    value === 'smile' ||
    value === 'blink' ||
    value === 'solid' ||
    value === 'off'
  );
}

function formatControlFrameMessage(frame: MicroDuckSimulatorControlFrame) {
  if (frame.type === 'led-pattern') {
    return `${frame.type} -> ${JSON.stringify({
      pattern: frame.pattern,
      brightness: frame.brightness,
    })}`;
  }

  return `${frame.type} -> ${JSON.stringify({
    leftPower: frame.leftPower,
    rightPower: frame.rightPower,
  })}`;
}
