import type { BehaviorArtifact } from '@botlab/model';
import type { BlocksLocale } from './block-messages';

export type BlocksWorkspaceStatus =
  | 'empty'
  | 'loaded'
  | 'dirty'
  | 'invalid'
  | 'read-only';

export type BlocksEditorEngine = 'mock' | 'scratch-blocks';

export interface BlocksEditorMountHandle {
  exportWorkspace(): BlocksWorkspaceArtifact;
  highlightBlock?(blockId?: string): void;
  togglePalette?(): void;
  setLocale?(locale: BlocksLocale): void;
  setAvailableBlockTypes?(types: readonly string[]): void;
  dispose(): void;
}

export interface BlocksEditorMountRequest {
  element: HTMLElement;
  artifact: BlocksWorkspaceArtifact;
  locale?: BlocksLocale;
  availableBlockTypes?: readonly string[];
  onArtifactChange?: (artifact: BlocksWorkspaceArtifact) => void;
}

export type BlocksEditorMountResult =
  | {
      mounted: true;
      handle: BlocksEditorMountHandle;
    }
  | {
      mounted: false;
      reason: string;
    };
export type BlocksEditorMountResponse =
  | BlocksEditorMountResult
  | Promise<BlocksEditorMountResult>;

export interface BlocksWorkspaceArtifact extends BehaviorArtifact {
  engine: BlocksEditorEngine;
  status: BlocksWorkspaceStatus;
  validationErrors: string[];
}

export interface BlocksWorkspaceValidationResult {
  valid: boolean;
  errors: string[];
}

export interface BlocksWorkspaceSession {
  artifact: BlocksWorkspaceArtifact;
  status: BlocksWorkspaceStatus;
}

export interface BlocksEditorProvider {
  id: BlocksEditorEngine;
  name: string;
  supportsNativeMount: boolean;
  createEmptyWorkspace(behaviorId: string): BlocksWorkspaceArtifact;
  loadWorkspace(artifact: BlocksWorkspaceArtifact): BlocksWorkspaceSession;
  exportWorkspace(session: BlocksWorkspaceSession): BlocksWorkspaceArtifact;
  validateWorkspace(
    artifact: BlocksWorkspaceArtifact,
  ): BlocksWorkspaceValidationResult;
  mountWorkspace(request: BlocksEditorMountRequest): BlocksEditorMountResponse;
}

export function createBlocksWorkspaceArtifact(
  artifact: Omit<
    BlocksWorkspaceArtifact,
    'kind' | 'createdAt' | 'validationErrors'
  > & {
    createdAt?: string;
    validationErrors?: string[];
  },
): BlocksWorkspaceArtifact {
  return {
    ...artifact,
    kind: 'blocks',
    createdAt: artifact.createdAt ?? new Date(0).toISOString(),
    validationErrors: artifact.validationErrors ?? [],
  };
}

export function exportBlocksWorkspace(
  artifact: BlocksWorkspaceArtifact,
): string {
  if (
    artifact.format === 'botlab-json' ||
    artifact.format === 'turbowarp-json'
  ) {
    return JSON.stringify(
      {
        id: artifact.id,
        behaviorId: artifact.behaviorId,
        engine: artifact.engine,
        status: artifact.status,
        content: safeJsonParse(artifact.content),
      },
      null,
      2,
    );
  }

  return artifact.content;
}

export function importBlocksWorkspace(params: {
  id: string;
  behaviorId: string;
  label: string;
  content: string;
  engine?: BlocksEditorEngine;
  format?: BlocksWorkspaceArtifact['format'];
  readOnly?: boolean;
}): BlocksWorkspaceArtifact {
  const format = params.format ?? detectWorkspaceFormat(params.content);
  const status = params.readOnly ? 'read-only' : 'loaded';
  const artifact = createBlocksWorkspaceArtifact({
    id: params.id,
    behaviorId: params.behaviorId,
    label: params.label,
    content: params.content,
    format,
    engine: params.engine ?? 'mock',
    status,
  });
  const validation = validateWorkspaceContent(artifact);

  return {
    ...artifact,
    status: validation.valid ? status : 'invalid',
    validationErrors: validation.errors,
  };
}

export function createMockBlocksEditorProvider(): BlocksEditorProvider {
  return {
    id: 'mock',
    name: 'Mock Blocks Provider',
    supportsNativeMount: false,
    createEmptyWorkspace(behaviorId) {
      return createBlocksWorkspaceArtifact({
        id: `${behaviorId}-empty-workspace`,
        behaviorId,
        label: 'Empty workspace',
        format: 'botlab-json',
        engine: 'mock',
        status: 'empty',
        content: '{"blocks":[]}',
      });
    },
    loadWorkspace(artifact) {
      const validation = validateWorkspaceContent(artifact);

      return {
        artifact: {
          ...artifact,
          status: validation.valid ? artifact.status : 'invalid',
          validationErrors: validation.errors,
        },
        status: validation.valid ? artifact.status : 'invalid',
      };
    },
    exportWorkspace(session) {
      return {
        ...session.artifact,
        status: session.status,
      };
    },
    validateWorkspace: validateWorkspaceContent,
    mountWorkspace(request) {
      return {
        mounted: true,
        handle: {
          exportWorkspace() {
            return {
              ...request.artifact,
              status: 'dirty',
            };
          },
          dispose() {
            return undefined;
          },
        },
      };
    },
  };
}

export interface ScratchBlocksEditorBridge {
  mount(request: BlocksEditorMountRequest): BlocksEditorMountResponse;
}

export function createScratchBlocksEditorProvider(
  bridge?: ScratchBlocksEditorBridge,
): BlocksEditorProvider {
  return {
    id: 'scratch-blocks',
    name: 'Scratch Blocks',
    supportsNativeMount: Boolean(bridge),
    createEmptyWorkspace(behaviorId) {
      return createBlocksWorkspaceArtifact({
        id: `${behaviorId}-scratch-blocks-workspace`,
        behaviorId,
        label: 'Scratch Blocks workspace',
        format: 'scratch-xml',
        engine: 'scratch-blocks',
        status: 'empty',
        content:
          '<xml xmlns="https://developers.google.com/blockly/xml"></xml>',
      });
    },
    loadWorkspace(artifact) {
      const validation = validateWorkspaceContent(artifact);

      return {
        artifact: {
          ...artifact,
          engine: 'scratch-blocks',
          format: 'scratch-xml',
          status: validation.valid ? artifact.status : 'invalid',
          validationErrors: validation.errors,
        },
        status: validation.valid ? artifact.status : 'invalid',
      };
    },
    exportWorkspace(session) {
      return {
        ...session.artifact,
        engine: 'scratch-blocks',
        format: 'scratch-xml',
        status: session.status,
      };
    },
    validateWorkspace(artifact) {
      return validateWorkspaceContent({
        ...artifact,
        engine: 'scratch-blocks',
        format: 'scratch-xml',
      });
    },
    mountWorkspace(request) {
      if (!bridge) {
        return {
          mounted: false,
          reason:
            'Scratch Blocks bridge is not configured. Provide a bridge that mounts the local scratch-blocks package.',
        };
      }

      return bridge.mount({
        ...request,
        artifact: {
          ...request.artifact,
          engine: 'scratch-blocks',
          format: 'scratch-xml',
        },
      });
    },
  };
}

export function createBlocksEditorProvider(
  engine: BlocksEditorEngine,
): BlocksEditorProvider {
  if (engine === 'scratch-blocks') {
    return createScratchBlocksEditorProvider();
  }

  return createMockBlocksEditorProvider();
}

export const sampleBlocksWorkspaceArtifact = importBlocksWorkspace({
  id: 'sample-blocks-workspace',
  behaviorId: 'sample-behavior',
  label: 'Sample workspace',
  content: '{"blocks":[{"type":"event_on_start"},{"type":"skill_dispatch"}]}',
});

export const sampleScratchBlocksWorkspaceArtifact = importBlocksWorkspace({
  id: 'sample-scratch-blocks-workspace',
  behaviorId: 'microduck-led-demo',
  label: 'Sample Scratch Blocks workspace',
  content:
    '<xml xmlns="https://developers.google.com/blockly/xml"><block type="event_whenflagclicked" id="botlab-start" x="32" y="32"><next><block type="botlab_microduck_set_leds" id="botlab-leds"><next><block type="botlab_microduck_walk_distance" id="botlab-walk"><field name="DISTANCE">5</field></block></next></block></next></block></xml>',
  engine: 'scratch-blocks',
  format: 'scratch-xml',
});

function detectWorkspaceFormat(
  content: string,
): BlocksWorkspaceArtifact['format'] {
  const trimmed = content.trim();

  if (trimmed.startsWith('<')) {
    return 'scratch-xml';
  }

  return 'botlab-json';
}

function validateWorkspaceContent(
  artifact: BlocksWorkspaceArtifact,
): BlocksWorkspaceValidationResult {
  if (!artifact.content.trim()) {
    return {
      valid: false,
      errors: [`Workspace ${artifact.id} has empty content.`],
    };
  }

  if (artifact.format === 'scratch-xml') {
    const valid = artifact.content.trim().startsWith('<xml');

    return {
      valid,
      errors: valid
        ? []
        : [`Workspace ${artifact.id} is not valid Scratch XML.`],
    };
  }

  const parsed = safeJsonParse(artifact.content);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      valid: false,
      errors: [`Workspace ${artifact.id} is not valid JSON workspace content.`],
    };
  }

  if (!Array.isArray((parsed as { blocks?: unknown }).blocks)) {
    return {
      valid: false,
      errors: [
        `Workspace ${artifact.id} JSON content must include a blocks array.`,
      ],
    };
  }

  return {
    valid: true,
    errors: [],
  };
}

function safeJsonParse(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}
