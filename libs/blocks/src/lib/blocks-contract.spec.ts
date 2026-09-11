import {
  createBlocksEditorProvider,
  createMockBlocksEditorProvider,
  createTurboWarpBlocksEditorProvider,
  exportBlocksWorkspace,
  importBlocksWorkspace,
  sampleBlocksWorkspaceArtifact,
  sampleTurboWarpWorkspaceArtifact,
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

  it('loads TurboWarp workspaces through the TurboWarp provider', () => {
    const provider = createTurboWarpBlocksEditorProvider();
    const session = provider.loadWorkspace(sampleTurboWarpWorkspaceArtifact);

    expect(provider.name).toBe('TurboWarp Blocks');
    expect(provider.supportsNativeMount).toBe(false);
    expect(session.artifact).toMatchObject({
      engine: 'turbowarp',
      format: 'scratch-xml',
      status: 'loaded',
    });
    expect(provider.validateWorkspace(session.artifact)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('reports that TurboWarp mounting needs a bridge when none is configured', () => {
    const provider = createBlocksEditorProvider('turbowarp');
    const result = provider.mountWorkspace({
      element: document.createElement('div'),
      artifact: sampleTurboWarpWorkspaceArtifact,
    });

    expect(result).toEqual({
      mounted: false,
      reason:
        'TurboWarp bridge is not configured. Provide a bridge that mounts scratch-gui or scratch-blocks.',
    });
  });

  it('delegates TurboWarp mounting to an injected bridge', () => {
    const provider = createTurboWarpBlocksEditorProvider({
      mount(request) {
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
    });

    const result = provider.mountWorkspace({
      element: document.createElement('div'),
      artifact: sampleTurboWarpWorkspaceArtifact,
    });

    expect(result.mounted).toBe(true);
    if (result.mounted) {
      expect(result.handle.exportWorkspace().status).toBe('dirty');
    }
  });
});
