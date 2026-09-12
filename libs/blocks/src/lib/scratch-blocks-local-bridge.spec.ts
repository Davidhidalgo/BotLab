import { sampleScratchBlocksWorkspaceArtifact } from './blocks-contract';
import { createLocalScratchBlocksEditorBridge } from './scratch-blocks-local-bridge';

describe('createLocalScratchBlocksEditorBridge', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () =>
        ({
          measureText: () => ({ width: 0 }),
        } as unknown as CanvasRenderingContext2D)
    );
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(new ArrayBuffer(0)))
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
      })
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

  it('observes its container size and disconnects the observer with the workspace', async () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      observe = observe;
      disconnect = disconnect;
    });
    const element = document.createElement('div');
    const result = await createLocalScratchBlocksEditorBridge().mount({ element, artifact: sampleScratchBlocksWorkspaceArtifact });
    expect(result.mounted).toBe(true);
    expect(observe).toHaveBeenCalledWith(element);
    if (result.mounted) result.handle.dispose();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('uses an optional overlay palette in narrow editors and restores the desktop layout', async () => {
    let width = 390;
    let resize = () => {};
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback; }
      observe() {}
      disconnect() {}
    });
    const element = document.createElement('div');
    Object.defineProperty(element, 'clientWidth', { get: () => width });
    const result = await createLocalScratchBlocksEditorBridge().mount({ element, artifact: sampleScratchBlocksWorkspaceArtifact });
    expect(result.mounted).toBe(true);
    if (!result.mounted) return;
    try {
      const scratch = await import('scratch-blocks');
      const workspace = scratch.getMainWorkspace() as InstanceType<typeof scratch.WorkspaceSvg>;
      const flyout = workspace.getFlyout()!;
      const xml = result.handle.exportWorkspace().content;
      expect(flyout.autoClose).toBe(true);
      expect(flyout.isVisible()).toBe(false);
      result.handle.togglePalette?.();
      expect(flyout.isVisible()).toBe(true);
      result.handle.togglePalette?.();
      expect(flyout.isVisible()).toBe(false);
      width = 700;
      resize();
      expect(flyout.autoClose).toBe(false);
      expect(flyout.isVisible()).toBe(true);
      expect(result.handle.exportWorkspace().content).toBe(xml);
    } finally { result.handle.dispose(); }
  });

  it('highlights the active block without changing the workspace', async () => {
    const onArtifactChange = vi.fn();
    const result = await createLocalScratchBlocksEditorBridge().mount({
      element: document.createElement('div'),
      artifact: sampleScratchBlocksWorkspaceArtifact,
      onArtifactChange,
    });
    expect(result.mounted).toBe(true);
    if (!result.mounted) return;
    try {
      const scratch = await import('scratch-blocks');
      const workspace = scratch.getMainWorkspace() as InstanceType<typeof scratch.WorkspaceSvg>;
      const highlight = vi.spyOn(workspace, 'highlightBlock');
      const before = result.handle.exportWorkspace().content;
      result.handle.highlightBlock?.('botlab-walk');
      expect(highlight).toHaveBeenLastCalledWith('botlab-walk');
      result.handle.highlightBlock?.('missing');
      expect(highlight).toHaveBeenLastCalledWith(null);
      result.handle.highlightBlock?.();
      expect(result.handle.exportWorkspace().content).toBe(before);
    } finally { result.handle.dispose(); }
  });

  it('provides an editable default number in the wait toolbox entry', async () => {
    const result = await createLocalScratchBlocksEditorBridge().mount({
      element: document.createElement('div'),
      artifact: sampleScratchBlocksWorkspaceArtifact,
    });
    expect(result.mounted).toBe(true);
    if (!result.mounted) return;
    try {
      const scratch = await import('scratch-blocks');
      const workspace = scratch.getMainWorkspace() as InstanceType<
        typeof scratch.WorkspaceSvg
      >;
      const wait = workspace
        .getFlyout()!
        .getWorkspace()
        .getBlocksByType('control_wait', false)[0];
      const number = wait.getInputTargetBlock('DURATION')!;
      expect(number.isShadow()).toBe(true);
      expect(number.getFieldValue('NUM')).toBe('1');
      expect(number.getField('NUM')!.EDITABLE).toBe(true);
    } finally {
      result.handle.dispose();
    }
  });

  it.each(['', '<value name="DURATION"></value>'])(
    'repairs a missing wait number, persists decimals, and reloads them: %s',
    async (duration) => {
      const bridge = createLocalScratchBlocksEditorBridge();
      const result = await bridge.mount({
        element: document.createElement('div'),
        artifact: {
          ...sampleScratchBlocksWorkspaceArtifact,
          content: `<xml xmlns="https://developers.google.com/blockly/xml"><block type="control_wait" id="wait">${duration}</block></xml>`,
        },
      });
      expect(result.mounted).toBe(true);
      if (!result.mounted) return;
      let artifact;
      try {
        const scratch = await import('scratch-blocks');
        const number = scratch
          .getMainWorkspace()
          .getBlockById('wait')!
          .getInputTargetBlock('DURATION')!;
        expect(number.getFieldValue('NUM')).toBe('1');
        number.setFieldValue('2.5', 'NUM');
        artifact = result.handle.exportWorkspace();
        expect(artifact.content).toContain('>2.5</field>');
      } finally {
        result.handle.dispose();
      }
      const reloaded = await bridge.mount({
        element: document.createElement('div'),
        artifact,
      });
      expect(reloaded.mounted).toBe(true);
      if (reloaded.mounted) {
        expect(reloaded.handle.exportWorkspace().content).toContain(
          '>2.5</field>'
        );
        reloaded.handle.dispose();
      }
    }
  );

  it.each(['shadow', 'block'])(
    'preserves an existing duration %s, including zero',
    async (tag) => {
      const result = await createLocalScratchBlocksEditorBridge().mount({
        element: document.createElement('div'),
        artifact: {
          ...sampleScratchBlocksWorkspaceArtifact,
          content: `<xml xmlns="https://developers.google.com/blockly/xml"><block type="control_wait" id="wait"><value name="DURATION"><${tag} type="math_positive_number" id="duration"><field name="NUM">0</field></${tag}></value></block></xml>`,
        },
      });
      expect(result.mounted).toBe(true);
      if (!result.mounted) return;
      try {
        const xml = new DOMParser().parseFromString(
          result.handle.exportWorkspace().content,
          'text/xml'
        );
        const duration = xml.querySelector('value[name="DURATION"]')!;
        expect(duration.children).toHaveLength(1);
        expect(duration.firstElementChild!.localName).toBe(tag);
        expect(duration.querySelector('field[name="NUM"]')!.textContent).toBe('0');
      } finally {
        result.handle.dispose();
      }
    }
  );
});
