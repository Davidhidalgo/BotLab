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

export interface MicroDuckOfficialSimulatorSourceAxes {
  jaw?: number;
  orbitX?: number;
  orbitY?: number;
  ride?: number;
}

export interface MicroDuckOfficialSimulatorSource {
  id: string;
  connected: boolean;
  command: Float32Array;
  axes: MicroDuckOfficialSimulatorSourceAxes;
  pressed: Record<string, boolean>;
  onAction: (name: string, meta?: Record<string, unknown>) => void;
  isActive(): boolean;
  init?(): void;
  dispose?(): void;
  poll?(dt: number): void;
}

export interface MicroDuckBotLabOfficialSource
  extends MicroDuckOfficialSimulatorSource {
  load(controlSource: MicroDuckSimulatorControlSource): void;
  clear(): void;
}

export interface MicroDuckBotLabOfficialSourceOptions {
  id?: string;
  getVelocityLimits: () => readonly [number, number, number];
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

export function createMicroDuckBotLabOfficialSource(
  options: MicroDuckBotLabOfficialSourceOptions
): MicroDuckBotLabOfficialSource {
  const command = new Float32Array(3);
  const axes: MicroDuckOfficialSimulatorSourceAxes = {
    jaw: 0,
    orbitX: 0,
    orbitY: 0,
    ride: 0,
  };
  const pressed: Record<string, boolean> = {};
  let frames: MicroDuckSimulatorControlFrame[] = [];
  let cursor = 0;
  let active = false;

  function applyFrame(frame: MicroDuckSimulatorControlFrame) {
    resetCommand(command);
    resetPressed(pressed);

    if (frame.type === 'differential-drive') {
      const [forwardLimit, backwardLimit, angularLimit] =
        options.getVelocityLimits();
      const forwardPower = clampUnit((frame.leftPower + frame.rightPower) / 2);
      const turnPower = clampUnit((frame.rightPower - frame.leftPower) / 2);

      command[0] =
        forwardPower >= 0
          ? forwardPower * forwardLimit
          : forwardPower * Math.abs(backwardLimit);
      command[1] = 0;
      command[2] = turnPower * angularLimit;
      pressed['forward'] = command[0] > 0;
      pressed['back'] = command[0] < 0;
      pressed['turnLeft'] = command[2] > 0;
      pressed['turnRight'] = command[2] < 0;
      active = command.some((value) => Math.abs(value) > 0);
      return;
    }

    pressed[`led:${frame.pattern}`] = true;
    axes.jaw = frame.brightness > 0 ? Math.min(frame.brightness / 100, 1) : 0;
    active = false;
  }

  function clear() {
    frames = [];
    cursor = 0;
    active = false;
    resetCommand(command);
    resetPressed(pressed);
    axes.jaw = 0;
    axes.orbitX = 0;
    axes.orbitY = 0;
    axes.ride = 0;
  }

  return {
    id: options.id ?? 'botlab',
    connected: true,
    command,
    axes,
    pressed,
    onAction: () => undefined,
    load(controlSource) {
      frames = [...controlSource.frames];
      cursor = 0;
      active = false;
      resetCommand(command);
      resetPressed(pressed);
    },
    clear,
    isActive() {
      return active;
    },
    init() {
      this.connected = true;
    },
    dispose() {
      this.connected = false;
      clear();
    },
    poll() {
      const frame = frames[cursor];

      if (!frame) {
        active = false;
        resetCommand(command);
        return;
      }

      applyFrame(frame);
      cursor += 1;
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

function clampUnit(value: number) {
  return Math.max(-1, Math.min(1, value));
}

function resetCommand(command: Float32Array) {
  command[0] = 0;
  command[1] = 0;
  command[2] = 0;
}

function resetPressed(pressed: Record<string, boolean>) {
  for (const key of Object.keys(pressed)) {
    delete pressed[key];
  }
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
