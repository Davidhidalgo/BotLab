import { sampleScratchBlocksWorkspaceArtifact } from './blocks-contract';
import { createLocalScratchBlocksEditorBridge } from './scratch-blocks-local-bridge';

describe('createLocalScratchBlocksEditorBridge', () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () =>
        ({
          measureText: () => ({ width: 0 }),
        }) as unknown as CanvasRenderingContext2D,
    );
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(new ArrayBuffer(0))),
    ) as unknown as typeof fetch;
  });

  it('mounts the official Scratch Blocks workspace locally', async () => {
    const onArtifactChange = vi.fn();
    const element = document.createElement('div');
    const bridge = createLocalScratchBlocksEditorBridge();

    const result = await bridge.mount({
      element,
      artifact: sampleScratchBlocksWorkspaceArtifact,
      onArtifactChange,
    });

    expect(result.mounted).toBe(true);
    expect(element.querySelector('.blocklySvg')).not.toBeNull();
    expect(onArtifactChange).toHaveBeenCalledWith(
      expect.objectContaining({
        engine: 'scratch-blocks',
        format: 'scratch-xml',
        status: 'loaded',
      }),
    );

    if (result.mounted) {
      expect(result.handle.exportWorkspace()).toMatchObject({
        engine: 'scratch-blocks',
        format: 'scratch-xml',
        status: 'dirty',
      });
      result.handle.dispose();
    }
  });

  it('reports invalid XML without mounting an iframe or external editor', async () => {
    const bridge = createLocalScratchBlocksEditorBridge();
    const result = await bridge.mount({
      element: document.createElement('div'),
      artifact: {
        ...sampleScratchBlocksWorkspaceArtifact,
        content: '<not-xml></not-xml>',
      },
    });

    expect(result).toEqual({
      mounted: false,
      reason:
        'Scratch Blocks no se ha podido montar: el artefacto no contiene XML de Scratch Blocks.',
    });
  });
});
