import { createProgramIdentity, type ExecutionResult } from '@botlab/model';
import {
  importBlocksWorkspace,
  type BlocksWorkspaceArtifact,
} from '@botlab/blocks';
import {
  parseMicroDuckSimulatorControlMessage,
  type MicroDuckExecutionUpdate,
  type MicroDuckSimulatorControlSource,
} from '@botlab/simulators-microduck';
import type { BotLabLocale } from './i18n';
import { isMujocoTarget, type MujocoTargetId } from './mujoco-targets';
import {
  decodeMujocoExecution,
  type SavedMujocoExecution,
} from './mujoco-execution-storage';
import {
  parseHuggingFaceModel,
  type HuggingFaceModel,
} from './huggingface-models';

export const workspaceStorageKey = 'botlab.workspace.v1';
export const maxWorkspaceFileBytes = 2 * 1024 * 1024;
export type WorkspaceTargetId =
  | 'stackchan-planned'
  | 'microduck-sim'
  | 'microduck-usb'
  | MujocoTargetId;
export type SimulatorBackend = 'browser' | 'native' | 'mujoco';
export const workspaceDestinations = {
  'stackchan-planned': {
    targetId: 'stackchan-planned',
    simulatorBackend: 'browser',
  },
  'microduck-sim:browser': {
    targetId: 'microduck-sim',
    simulatorBackend: 'browser',
  },
  'microduck-sim:native': {
    targetId: 'microduck-sim',
    simulatorBackend: 'native',
  },
  'microduck-usb': { targetId: 'microduck-usb', simulatorBackend: 'browser' },
  'jumper-web-joint-probe': {
    targetId: 'jumper-web-joint-probe',
    simulatorBackend: 'mujoco',
  },
  'jumper-web-walking': {
    targetId: 'jumper-web-walking',
    simulatorBackend: 'mujoco',
  },
  'microduck-mujoco-web': {
    targetId: 'microduck-mujoco-web',
    simulatorBackend: 'mujoco',
  },
} as const;
export type WorkspaceDestination = keyof typeof workspaceDestinations;
export function workspaceDestination(
  targetId: WorkspaceTargetId,
  backend: SimulatorBackend,
): WorkspaceDestination {
  return targetId === 'microduck-sim'
    ? `microduck-sim:${backend === 'native' ? 'native' : 'browser'}`
    : targetId;
}
export interface WorkspaceSlot {
  workspace: BlocksWorkspaceArtifact;
  lastExecution?: SavedExecution;
  mujocoExecution?: SavedMujocoExecution;
}
export type TargetWorkspaces = Partial<
  Record<WorkspaceDestination, WorkspaceSlot>
>;
export interface SavedExecution {
  outcome?: ExecutionResult;
  source: MicroDuckSimulatorControlSource;
  executionId: string;
  status: MicroDuckExecutionUpdate['status'] | 'interrupted';
  events: {
    status: MicroDuckExecutionUpdate['status'];
    frameIndex?: number;
    at: string;
  }[];
}
export interface WorkspaceDocument {
  schemaVersion: 1;
  workspace: BlocksWorkspaceArtifact;
  locale: BotLabLocale;
  targetId?: WorkspaceTargetId;
  simulatorBackend?: SimulatorBackend;
  huggingFaceModels?: HuggingFaceModel[];
  lastExecution?: SavedExecution;
  mujocoExecution?: SavedMujocoExecution;
  targetWorkspaces?: TargetWorkspaces;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function decodeWorkspaceDocument(text: string): WorkspaceDocument {
  if (new Blob([text]).size > maxWorkspaceFileBytes)
    throw new Error('Workspace file too large.');
  const data: unknown = JSON.parse(text);
  if (!record(data) || data.schemaVersion !== 1 || !record(data.workspace))
    throw new Error('Unsupported workspace document.');
  const workspace = data.workspace;
  if (
    workspace.kind !== 'blocks' ||
    workspace.engine !== 'scratch-blocks' ||
    workspace.format !== 'scratch-xml' ||
    typeof workspace.content !== 'string' ||
    typeof workspace.id !== 'string' ||
    !workspace.id ||
    typeof workspace.behaviorId !== 'string' ||
    !workspace.behaviorId ||
    typeof workspace.label !== 'string'
  ) {
    throw new Error('Invalid workspace artifact.');
  }
  const xml = new DOMParser().parseFromString(workspace.content, 'text/xml');
  if (
    xml.querySelector('parsererror') ||
    xml.documentElement.localName !== 'xml' ||
    xml.doctype
  )
    throw new Error('Invalid workspace XML.');
  const result: WorkspaceDocument = {
    schemaVersion: 1,
    locale: data.locale === 'en' || data.locale === 'es' ? data.locale : 'ca',
    workspace: importBlocksWorkspace({
      id: workspace.id,
      behaviorId: workspace.behaviorId,
      label: workspace.label,
      content: workspace.content,
      engine: 'scratch-blocks',
      format: 'scratch-xml',
    }),
  };
  const run = data.lastExecution;
  if (data.targetId !== undefined) {
    if (
      ![
        'stackchan-planned',
        'microduck-sim',
        'microduck-usb',
        'jumper-web-joint-probe',
        'jumper-web-walking',
        'microduck-mujoco-web',
      ].includes(String(data.targetId))
    )
      throw new Error('Invalid project target.');
    result.targetId = data.targetId as WorkspaceDocument['targetId'];
  }
  if (data.simulatorBackend !== undefined) {
    if (
      data.simulatorBackend !== 'browser' &&
      data.simulatorBackend !== 'native' &&
      data.simulatorBackend !== 'mujoco'
    )
      throw new Error('Invalid simulator.');
    result.simulatorBackend = data.simulatorBackend;
  }
  if (isMujocoTarget(result.targetId ?? '')) {
    if (result.simulatorBackend !== 'mujoco')
      throw new Error('Invalid MuJoCo destination.');
  } else if (result.simulatorBackend === 'mujoco')
    throw new Error('Invalid MuJoCo destination.');
  if (data.mujocoExecution !== undefined)
    result.mujocoExecution = decodeMujocoExecution(
      data.mujocoExecution,
      result.workspace,
      result.targetId,
    );
  if (data.targetWorkspaces !== undefined) {
    if (!record(data.targetWorkspaces))
      throw new Error('Invalid target workspaces.');
    result.targetWorkspaces = {};
    for (const [key, slot] of Object.entries(data.targetWorkspaces)) {
      if (
        !Object.prototype.hasOwnProperty.call(workspaceDestinations, key) ||
        !record(slot) ||
        slot.targetWorkspaces !== undefined
      )
        throw new Error('Invalid target workspace.');
      const destination = key as WorkspaceDestination;
      const checked = decodeWorkspaceDocument(
        JSON.stringify({
          schemaVersion: 1,
          locale: result.locale,
          ...workspaceDestinations[destination],
          workspace: slot.workspace,
          lastExecution: slot.lastExecution,
          mujocoExecution: slot.mujocoExecution,
        }),
      );
      result.targetWorkspaces[destination] = {
        workspace: checked.workspace,
        lastExecution: checked.lastExecution,
        mujocoExecution: checked.mujocoExecution,
      };
    }
  }
  if (data.huggingFaceModels !== undefined) {
    if (
      !Array.isArray(data.huggingFaceModels) ||
      data.huggingFaceModels.length > 30
    )
      throw new Error('Invalid Hugging Face model list.');
    const names = new Set<string>();
    result.huggingFaceModels = data.huggingFaceModels.map((model: unknown) => {
      if (
        !record(model) ||
        typeof model.url !== 'string' ||
        typeof model.name !== 'string' ||
        typeof model.duration !== 'number'
      )
        throw new Error('Invalid Hugging Face model.');
      const checked = parseHuggingFaceModel(
        model.url,
        model.name,
        model.duration,
      );
      if (
        model.repo !== checked.repo ||
        model.revision !== checked.revision ||
        model.filename !== checked.filename ||
        names.has(checked.name)
      )
        throw new Error('Invalid Hugging Face model.');
      names.add(checked.name);
      return checked;
    });
  }
  if (run !== undefined) {
    if (
      !record(run) ||
      typeof run.executionId !== 'string' ||
      !run.executionId ||
      ![
        'accepted',
        'running',
        'completed',
        'stopped',
        'failed',
        'interrupted',
      ].includes(String(run.status)) ||
      !Array.isArray(run.events) ||
      run.events.length > 64
    )
      throw new Error('Invalid saved execution.');
    const message = parseMicroDuckSimulatorControlMessage({
      type: 'botlab.microduck.control-source.v1',
      version: 1,
      simulatorId: 'microduck-official-sim',
      source: run.source,
    });
    if (!message) throw new Error('Invalid saved execution plan.');
    const events: SavedExecution['events'] = run.events.map((event) => {
      if (
        !record(event) ||
        !['accepted', 'running', 'completed', 'stopped', 'failed'].includes(
          String(event.status),
        ) ||
        typeof event.at !== 'string' ||
        !Number.isFinite(Date.parse(event.at)) ||
        (event.frameIndex !== undefined &&
          (typeof event.frameIndex !== 'number' ||
            !Number.isInteger(event.frameIndex) ||
            event.frameIndex < 0 ||
            event.frameIndex >= message.source.frames.length))
      )
        throw new Error('Invalid saved execution event.');
      return {
        status: event.status as MicroDuckExecutionUpdate['status'],
        frameIndex: event.frameIndex as number | undefined,
        at: event.at,
      };
    });
    const savedStatus =
      run.status === 'running' || run.status === 'accepted'
        ? 'interrupted'
        : run.status;
    result.lastExecution = {
      source: message.source,
      outcome: {
        executionId: run.executionId,
        program:
          message.source.program ??
          createProgramIdentity(
            message.source.artifactId,
            message.source.targetId,
            message.source.frames,
          ),
        status:
          savedStatus === 'interrupted' || savedStatus === 'stopped'
            ? 'cancelled'
            : (savedStatus as ExecutionResult['status']),
        evidence: savedStatus === 'completed' ? 'simulator' : 'none',
      },
      executionId: run.executionId,
      events,
      status:
        run.status === 'running' || run.status === 'accepted'
          ? 'interrupted'
          : (run.status as SavedExecution['status']),
    };
  }
  return result;
}

export function readWorkspaceDocument(): {
  document?: WorkspaceDocument;
  error: boolean;
} {
  try {
    const value = localStorage.getItem(workspaceStorageKey);
    return {
      document: value ? decodeWorkspaceDocument(value) : undefined,
      error: false,
    };
  } catch {
    return { error: true };
  }
}

export function encodeWorkspaceDocument(document: WorkspaceDocument) {
  const text = JSON.stringify(document, null, 2);
  if (new Blob([text]).size > maxWorkspaceFileBytes)
    throw new Error('Workspace file too large.');
  return text;
}

export function saveWorkspaceDocument(document: WorkspaceDocument) {
  try {
    const text = encodeWorkspaceDocument(document);
    decodeWorkspaceDocument(text);
    localStorage.setItem(workspaceStorageKey, text);
    return true;
  } catch {
    return false;
  }
}
