import {
  createMockBlocksEditorProvider,
  exportBlocksWorkspace,
  importBlocksWorkspace,
  sampleBlocksWorkspaceArtifact,
} from './blocks-contract';

describe('blocksContract', () => {
  it('loads and exports a valid sample workspace artifact', () => {
    const provider = createMockBlocksEditorProvider();
    const session = provider.loadWorkspace(sampleBlocksWorkspaceArtifact);

    expect(session.status).toBe('loaded');
    expect(provider.validateWorkspace(session.artifact)).toEqual({
      valid: true,
      errors: [],
    });
    expect(exportBlocksWorkspace(session.artifact)).toContain('event_on_start');
  });

  it('creates empty workspaces through the mock provider', () => {
    const provider = createMockBlocksEditorProvider();
    const artifact = provider.createEmptyWorkspace('behavior-a');

    expect(artifact).toMatchObject({
      id: 'behavior-a-empty-workspace',
      behaviorId: 'behavior-a',
      engine: 'mock',
      status: 'empty',
      format: 'botlab-json',
    });
  });

  it('marks malformed JSON workspaces as invalid', () => {
    const artifact = importBlocksWorkspace({
      id: 'bad-workspace',
      behaviorId: 'behavior-a',
      label: 'Bad workspace',
      content: '{"steps":[]}',
    });

    expect(artifact.status).toBe('invalid');
    expect(artifact.validationErrors).toEqual([
      'Workspace bad-workspace JSON content must include a blocks array.',
    ]);
  });

  it('detects Scratch XML workspace content', () => {
    const artifact = importBlocksWorkspace({
      id: 'xml-workspace',
      behaviorId: 'behavior-a',
      label: 'XML workspace',
      content: '<xml><block type="event_on_start" /></xml>',
      engine: 'scratch-blocks',
    });

    expect(artifact.format).toBe('scratch-xml');
    expect(artifact.status).toBe('loaded');
    expect(exportBlocksWorkspace(artifact)).toContain('<xml>');
  });
});
