import { sampleTurboWarpWorkspaceArtifact } from './blocks-contract';
import { createLocalTurboWarpEditorBridge } from './turbowarp-local-bridge';

describe('createLocalTurboWarpEditorBridge', () => {
  afterEach(() => {
    window.ScratchBlocks = undefined;
  });

  it('reports when the local TurboWarp bundle is not loaded', () => {
    const bridge = createLocalTurboWarpEditorBridge();
    const result = bridge.mount({
      element: document.createElement('div'),
      artifact: sampleTurboWarpWorkspaceArtifact,
    });

    expect(result).toEqual({
      mounted: false,
      reason:
        'TurboWarp scratch-blocks is installed locally, but no browser-ready ScratchBlocks bundle has been loaded yet.',
    });
  });

  it('mounts through a browser-loaded ScratchBlocks API', () => {
    const dispose = vi.fn();
    const onArtifactChange = vi.fn();
    window.ScratchBlocks = {
      inject: vi.fn(() => ({ dispose })),
    };

    const bridge = createLocalTurboWarpEditorBridge();
    const result = bridge.mount({
      element: document.createElement('div'),
      artifact: sampleTurboWarpWorkspaceArtifact,
      onArtifactChange,
    });

    expect(result.mounted).toBe(true);
    expect(window.ScratchBlocks.inject).toHaveBeenCalled();
    expect(onArtifactChange).toHaveBeenCalledWith({
      ...sampleTurboWarpWorkspaceArtifact,
      status: 'loaded',
    });

    if (result.mounted) {
      expect(result.handle.exportWorkspace().status).toBe('dirty');
      result.handle.dispose();
    }

    expect(dispose).toHaveBeenCalled();
  });
});
