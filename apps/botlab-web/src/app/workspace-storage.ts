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

export const workspaceStorageKey = 'botlab.workspace.v1';
export const maxWorkspaceFileBytes = 2 * 1024 * 1024;
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
  targetId?: 'stackchan-planned' | 'microduck-sim' | 'microduck-usb';
  simulatorBackend?: 'browser' | 'native';
  lastExecution?: SavedExecution;
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
      !['stackchan-planned', 'microduck-sim', 'microduck-usb'].includes(
        String(data.targetId),
      )
    )
      throw new Error('Invalid project target.');
    result.targetId = data.targetId as WorkspaceDocument['targetId'];
  }
  if (data.simulatorBackend !== undefined) {
    if (
      data.simulatorBackend !== 'browser' &&
      data.simulatorBackend !== 'native'
    )
      throw new Error('Invalid simulator.');
    result.simulatorBackend = data.simulatorBackend;
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
