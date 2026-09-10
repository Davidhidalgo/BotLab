import type { BehaviorArtifact } from '@botlab/model';

export type BlocksWorkspaceStatus =
  | 'empty'
  | 'loaded'
  | 'dirty'
  | 'invalid'
  | 'read-only';

export type BlocksEditorEngine = 'mock' | 'scratch-blocks' | 'turbowarp';

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
  createEmptyWorkspace(behaviorId: string): BlocksWorkspaceArtifact;
  loadWorkspace(artifact: BlocksWorkspaceArtifact): BlocksWorkspaceSession;
  exportWorkspace(session: BlocksWorkspaceSession): BlocksWorkspaceArtifact;
  validateWorkspace(artifact: BlocksWorkspaceArtifact): BlocksWorkspaceValidationResult;
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
  if (artifact.format === 'botlab-json' || artifact.format === 'turbowarp-json') {
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
  };
}

export const sampleBlocksWorkspaceArtifact = importBlocksWorkspace({
  id: 'sample-blocks-workspace',
  behaviorId: 'sample-behavior',
  label: 'Sample workspace',
  content: '{"blocks":[{"type":"event_on_start"},{"type":"skill_dispatch"}]}',
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
      errors: valid ? [] : [`Workspace ${artifact.id} is not valid Scratch XML.`],
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
      errors: [`Workspace ${artifact.id} JSON content must include a blocks array.`],
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
