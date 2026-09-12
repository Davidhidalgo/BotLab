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
import type { MicroDuckSimulatorAssetCachePlan } from './microduck-simulator-assets';

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

export interface MicroDuckBotLabPostMessageSourceOptions
  extends MicroDuckBotLabOfficialSourceOptions {
  allowedOrigins?: string[];
  window?: Pick<
    Window,
    'addEventListener' | 'removeEventListener'
  >;
}

export interface MicroDuckSimulatorControlMessage {
  type: typeof MICRODUCK_SIMULATOR_CONTROL_MESSAGE_TYPE;
  version: 1;
  simulatorId: 'microduck-official-sim';
  source: MicroDuckSimulatorControlSource;
}

export interface MicroDuckBotLabPostMessageSourceModuleOptions {
  allowedOrigins?: string[];
  className?: string;
}

export interface MicroDuckOfficialSimulatorPatchOptions
  extends MicroDuckBotLabPostMessageSourceModuleOptions {
  velocityLimitsExpression?: string;
}

export interface MicroDuckOfficialSimulatorPatchInstructions {
  modulePath: string;
  gamePath: string;
  importLine: string;
  sourceFactoryLine: string;
  controllerSourceName: string;
}

export interface MicroDuckOfficialSimulatorGamePatchResult {
  source: string;
  changed: boolean;
  warnings: string[];
}

export const MICRODUCK_SIMULATOR_CONTROL_MESSAGE_TYPE =
  'botlab.microduck.control-source.v1';
export const MICRODUCK_BOTLAB_SOURCE_MODULE_PATH =
  'app/src/game/controls/botlab.js';
export const MICRODUCK_SIMULATOR_GAME_SOURCE_PATH = 'app/src/game/game.js';

export interface MicroDuckOfficialSimulatorController {
  readonly sources?: MicroDuckOfficialSimulatorSource[];
  addSource(source: MicroDuckOfficialSimulatorSource): void;
}

export interface MicroDuckOfficialSimulatorRuntime {
  controller: MicroDuckOfficialSimulatorController;
}

export type MicroDuckOfficialSimulatorRuntimeLoader = () =>
  | MicroDuckOfficialSimulatorRuntime
  | Promise<MicroDuckOfficialSimulatorRuntime>;

export interface MicroDuckOfficialSimulatorConnection {
  runtime: MicroDuckOfficialSimulatorRuntime;
  source: MicroDuckBotLabOfficialSource;
  load(controlSource: MicroDuckSimulatorControlSource): void;
  disconnect(): void;
}

export interface MicroDuckOfficialSimulatorConnectionOptions {
  loadRuntime: MicroDuckOfficialSimulatorRuntimeLoader;
  getVelocityLimits: () => readonly [number, number, number];
  sourceId?: string;
}

export type MicroDuckOfficialSimulatorHostState =
  | 'blocked'
  | 'loading'
  | 'ready'
  | 'running'
  | 'failed'
  | 'disconnected';

export interface MicroDuckOfficialSimulatorHostResult {
  state: MicroDuckOfficialSimulatorHostState;
  messages: string[];
  connection?: MicroDuckOfficialSimulatorConnection;
  controlSource?: MicroDuckSimulatorControlSource;
}

export interface LoadMicroDuckOfficialSimulatorHostOptions
  extends MicroDuckOfficialSimulatorConnectionOptions {
  assetPlan: MicroDuckSimulatorAssetCachePlan;
  artifact?: CompiledBehaviorArtifact;
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

export async function loadMicroDuckOfficialSimulatorHost(
  options: LoadMicroDuckOfficialSimulatorHostOptions
): Promise<MicroDuckOfficialSimulatorHostResult> {
  if (!options.assetPlan.loadable) {
    const blockedAssets = options.assetPlan.entries
      .filter((entry) => entry.status === 'blocked')
      .map((entry) => `${entry.asset.label}: ${entry.status}`);

    return {
      state: 'blocked',
      messages: [
        'MicroDuck official simulator runtime is blocked because at least one required asset is restricted.',
        ...blockedAssets,
      ],
    };
  }

  const advisoryMessages = options.assetPlan.ready
    ? []
    : options.assetPlan.entries
        .filter((entry) => entry.status !== 'ready')
        .map(
          (entry) =>
            `${entry.asset.label}: ${entry.status}. BotLab will not vendor this asset; educational preview loading remains opt-in.`
        );

  if (!options.artifact) {
    return {
      state: 'ready',
      messages: [
        'MicroDuck official simulator assets are ready. Compile and simulate a plan to load BotLab control frames.',
        ...advisoryMessages,
      ],
    };
  }

  const controlSource = createMicroDuckSimulatorControlSource(options.artifact);

  if (controlSource.errors.length > 0) {
    return {
      state: 'failed',
      controlSource,
      messages: controlSource.errors,
    };
  }

  const connection = await connectMicroDuckBotLabSourceToOfficialSimulator(
    options
  );
  connection.load(controlSource);

  return {
    state: 'running',
    connection,
    controlSource,
    messages: [
      `Loaded ${controlSource.frames.length} BotLab control frame(s) into the official simulator source.`,
      ...advisoryMessages,
      ...controlSource.messages,
    ],
  };
}

export async function connectMicroDuckBotLabSourceToOfficialSimulator(
  options: MicroDuckOfficialSimulatorConnectionOptions
): Promise<MicroDuckOfficialSimulatorConnection> {
  const runtime = await options.loadRuntime();
  const sourceId = options.sourceId ?? 'botlab';
  const existingSource = runtime.controller.sources?.find(
    (candidate) => candidate.id === sourceId
  );
  const source = isMicroDuckBotLabOfficialSource(existingSource)
    ? existingSource
    : createMicroDuckBotLabOfficialSource({
        id: sourceId,
        getVelocityLimits: options.getVelocityLimits,
      });

  if (!existingSource) {
    runtime.controller.addSource(source);
  }

  source.init?.();

  return {
    runtime,
    source,
    load(controlSource) {
      source.load(controlSource);
    },
    disconnect() {
      source.dispose?.();
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

export function createMicroDuckBotLabPostMessageSource(
  options: MicroDuckBotLabPostMessageSourceOptions
): MicroDuckBotLabOfficialSource {
  const source = createMicroDuckBotLabOfficialSource(options);
  const targetWindow = options.window ?? globalThis.window;
  const allowedOrigins = new Set(options.allowedOrigins ?? []);

  function onMessage(event: MessageEvent) {
    if (
      allowedOrigins.size > 0 &&
      typeof event.origin === 'string' &&
      !allowedOrigins.has(event.origin)
    ) {
      return;
    }

    const message = parseMicroDuckSimulatorControlMessage(event.data);

    if (!message) {
      return;
    }

    source.load(message.source);
  }

  const originalInit = source.init?.bind(source);
  const originalDispose = source.dispose?.bind(source);

  return {
    ...source,
    init() {
      originalInit?.();
      targetWindow?.addEventListener?.('message', onMessage);
    },
    dispose() {
      targetWindow?.removeEventListener?.('message', onMessage);
      originalDispose?.();
    },
  };
}

export function createMicroDuckSimulatorControlMessage(
  source: MicroDuckSimulatorControlSource
): MicroDuckSimulatorControlMessage {
  return {
    type: MICRODUCK_SIMULATOR_CONTROL_MESSAGE_TYPE,
    version: 1,
    simulatorId: 'microduck-official-sim',
    source,
  };
}

export function postMicroDuckSimulatorControlSource(
  targetWindow: Pick<Window, 'postMessage'>,
  source: MicroDuckSimulatorControlSource,
  targetOrigin: string
) {
  targetWindow.postMessage(
    createMicroDuckSimulatorControlMessage(source),
    targetOrigin
  );
}

export function parseMicroDuckSimulatorControlMessage(
  value: unknown
): MicroDuckSimulatorControlMessage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    value['type'] !== MICRODUCK_SIMULATOR_CONTROL_MESSAGE_TYPE ||
    value['version'] !== 1 ||
    value['simulatorId'] !== 'microduck-official-sim'
  ) {
    return undefined;
  }

  const source = value['source'];

  if (!isMicroDuckSimulatorControlSource(source)) {
    return undefined;
  }

  return {
    type: MICRODUCK_SIMULATOR_CONTROL_MESSAGE_TYPE,
    version: 1,
    simulatorId: 'microduck-official-sim',
    source,
  };
}

export function createMicroDuckBotLabPostMessageSourceModule(
  options: MicroDuckBotLabPostMessageSourceModuleOptions = {}
) {
  const className = options.className ?? 'BotLabSource';
  const allowedOrigins = JSON.stringify(options.allowedOrigins ?? []);

  return `const MESSAGE_TYPE = ${JSON.stringify(
    MICRODUCK_SIMULATOR_CONTROL_MESSAGE_TYPE
  )};
const ALLOWED_ORIGINS = ${allowedOrigins};
const ACTIVE_SOURCES = new Set();
let latestControlSource;

window.addEventListener("message", (event) => {
  const controlSource = parseControlSourceMessage(event);

  if (!controlSource) {
    return;
  }

  latestControlSource = controlSource;

  for (const source of ACTIVE_SOURCES) {
    source.load(controlSource);
  }
});

export class ${className} {
  constructor({ getVelocityLimits } = {}) {
    this.id = "botlab";
    this.connected = true;
    this.command = new Float32Array(3);
    this.axes = { jaw: 0, orbitX: 0, orbitY: 0, ride: 0 };
    this.pressed = {};
    this.onAction = () => {};
    this.getVelocityLimits = getVelocityLimits ?? (() => [2, -1, 3]);
    this.frames = [];
    this.cursor = 0;
    this.active = false;
  }

  init() {
    this.connected = true;
    ACTIVE_SOURCES.add(this);

    if (latestControlSource) {
      this.load(latestControlSource);
    }
  }

  dispose() {
    ACTIVE_SOURCES.delete(this);
    this.connected = false;
    this.clear();
  }

  load(controlSource) {
    this.frames = [...controlSource.frames];
    this.cursor = 0;
    this.active = false;
    this.resetCommand();
    this.resetPressed();
  }

  clear() {
    this.frames = [];
    this.cursor = 0;
    this.active = false;
    this.resetCommand();
    this.resetPressed();
    this.axes.jaw = 0;
    this.axes.orbitX = 0;
    this.axes.orbitY = 0;
    this.axes.ride = 0;
  }

  isActive() {
    return this.active;
  }

  poll() {
    const frame = this.frames[this.cursor];

    if (!frame) {
      this.active = false;
      this.resetCommand();
      return;
    }

    this.applyFrame(frame);
    this.cursor += 1;
  }

  applyFrame(frame) {
    this.resetCommand();
    this.resetPressed();

    if (frame.type === "differential-drive") {
      const [forwardLimit, backwardLimit, angularLimit] =
        this.getVelocityLimits();
      const forwardPower = clampUnit((frame.leftPower + frame.rightPower) / 2);
      const turnPower = clampUnit((frame.rightPower - frame.leftPower) / 2);

      this.command[0] =
        forwardPower >= 0
          ? forwardPower * forwardLimit
          : forwardPower * Math.abs(backwardLimit);
      this.command[1] = 0;
      this.command[2] = turnPower * angularLimit;
      this.pressed.forward = this.command[0] > 0;
      this.pressed.back = this.command[0] < 0;
      this.pressed.turnLeft = this.command[2] > 0;
      this.pressed.turnRight = this.command[2] < 0;
      this.active = this.command.some((value) => Math.abs(value) > 0);
      return;
    }

    if (frame.type === "led-pattern") {
      this.pressed[\`led:\${frame.pattern}\`] = true;
      this.axes.jaw =
        typeof frame.brightness === "number" && frame.brightness > 0
          ? Math.min(frame.brightness / 100, 1)
          : 0;
    }
  }

  resetCommand() {
    this.command[0] = 0;
    this.command[1] = 0;
    this.command[2] = 0;
  }

  resetPressed() {
    for (const key of Object.keys(this.pressed)) {
      delete this.pressed[key];
    }
  }
}

function clampUnit(value) {
  return Math.max(-1, Math.min(1, value));
}

function parseControlSourceMessage(event) {
  if (
    ALLOWED_ORIGINS.length > 0 &&
    typeof event.origin === "string" &&
    !ALLOWED_ORIGINS.includes(event.origin)
  ) {
    return undefined;
  }

  const message = event.data;
  if (
    !message ||
    message.type !== MESSAGE_TYPE ||
    message.version !== 1 ||
    message.simulatorId !== "microduck-official-sim" ||
    !message.source ||
    !Array.isArray(message.source.frames)
  ) {
    return undefined;
  }

  return message.source;
}
`;
}

export function createMicroDuckOfficialSimulatorPatchInstructions(
  options: MicroDuckOfficialSimulatorPatchOptions = {}
): MicroDuckOfficialSimulatorPatchInstructions {
  const className = options.className ?? 'BotLabSource';
  const velocityLimitsExpression =
    options.velocityLimitsExpression ?? 'velLims()';

  return {
    modulePath: MICRODUCK_BOTLAB_SOURCE_MODULE_PATH,
    gamePath: MICRODUCK_SIMULATOR_GAME_SOURCE_PATH,
    importLine: `import { ${className} } from "./controls/botlab.js";`,
    sourceFactoryLine: `const botLabSource = new ${className}({ getVelocityLimits: () => ${velocityLimitsExpression} });`,
    controllerSourceName: 'botLabSource',
  };
}

export function patchMicroDuckOfficialSimulatorGameSource(
  source: string,
  options: MicroDuckOfficialSimulatorPatchOptions = {}
): MicroDuckOfficialSimulatorGamePatchResult {
  const instructions =
    createMicroDuckOfficialSimulatorPatchInstructions(options);
  const warnings: string[] = [];
  let patched = source;

  if (!patched.includes(instructions.importLine)) {
    patched = insertAfterLastImport(patched, instructions.importLine);
  }

  if (!patched.includes(instructions.sourceFactoryLine)) {
    const next = insertBeforeControllerConstruction(
      patched,
      instructions.sourceFactoryLine
    );

    if (next === patched) {
      warnings.push(
        'Could not find the official simulator Controller construction. Add the BotLabSource factory manually near initControls().'
      );
    }

    patched = next;
  }

  if (!controllerSourcesInclude(patched, instructions.controllerSourceName)) {
    const next = insertControllerSource(
      patched,
      instructions.controllerSourceName
    );

    if (next === patched) {
      warnings.push(
        'Could not find a Controller sources array. Add botLabSource to the sources list manually.'
      );
    }

    patched = next;
  }

  return {
    source: patched,
    changed: patched !== source,
    warnings,
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

function isMicroDuckBotLabOfficialSource(
  source: MicroDuckOfficialSimulatorSource | undefined
): source is MicroDuckBotLabOfficialSource {
  return (
    Boolean(source) &&
    typeof (source as MicroDuckBotLabOfficialSource).load === 'function' &&
    typeof (source as MicroDuckBotLabOfficialSource).clear === 'function'
  );
}

function insertAfterLastImport(source: string, importLine: string) {
  const importMatches = [...source.matchAll(/^import\s.+;$/gm)];
  const lastImport = importMatches[importMatches.length - 1];

  if (!lastImport || lastImport.index === undefined) {
    return `${importLine}\n${source}`;
  }

  const insertAt = lastImport.index + lastImport[0].length;

  return `${source.slice(0, insertAt)}\n${importLine}${source.slice(insertAt)}`;
}

function insertBeforeControllerConstruction(
  source: string,
  sourceFactoryLine: string
) {
  const controllerMatch = source.match(
    /^(\s*)(?:controller|const\s+controller|let\s+controller)\s*=\s*new Controller\(\{\s*sources:\s*\[/m
  );

  if (!controllerMatch || controllerMatch.index === undefined) {
    return source;
  }

  const indent = controllerMatch[1] ?? '';

  return `${source.slice(0, controllerMatch.index)}${indent}${sourceFactoryLine}\n${source.slice(
    controllerMatch.index
  )}`;
}

function controllerSourcesInclude(source: string, sourceName: string) {
  const sourcesArray = readControllerSourcesArray(source);

  return sourcesArray?.includes(sourceName) ?? false;
}

function insertControllerSource(source: string, sourceName: string) {
  const sourcesMatch = source.match(/sources:\s*\[/m);

  if (!sourcesMatch || sourcesMatch.index === undefined) {
    return source;
  }

  const insertAt = sourcesMatch.index + sourcesMatch[0].length;

  return `${source.slice(0, insertAt)}${sourceName}, ${source.slice(insertAt)}`;
}

function readControllerSourcesArray(source: string) {
  const sourcesMatch = source.match(/sources:\s*\[/m);

  if (!sourcesMatch || sourcesMatch.index === undefined) {
    return undefined;
  }

  const start = sourcesMatch.index + sourcesMatch[0].length;
  const end = source.indexOf(']', start);

  if (end === -1) {
    return undefined;
  }

  return source.slice(start, end);
}

function isMicroDuckSimulatorControlSource(
  value: unknown
): value is MicroDuckSimulatorControlSource {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value['artifactId'] === 'string' &&
    typeof value['targetId'] === 'string' &&
    Array.isArray(value['frames']) &&
    Array.isArray(value['messages']) &&
    Array.isArray(value['errors']) &&
    value['frames'].every(isMicroDuckSimulatorControlFrame) &&
    value['messages'].every((message) => typeof message === 'string') &&
    value['errors'].every((error) => typeof error === 'string')
  );
}

function isMicroDuckSimulatorControlFrame(
  value: unknown
): value is MicroDuckSimulatorControlFrame {
  if (!isRecord(value)) {
    return false;
  }

  if (
    value['type'] === 'led-pattern' &&
    typeof value['id'] === 'string' &&
    typeof value['targetId'] === 'string' &&
    isMicroDuckLedPattern(value['pattern']) &&
    typeof value['brightness'] === 'number'
  ) {
    return true;
  }

  return (
    value['type'] === 'differential-drive' &&
    typeof value['id'] === 'string' &&
    typeof value['targetId'] === 'string' &&
    typeof value['leftPower'] === 'number' &&
    typeof value['rightPower'] === 'number'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
