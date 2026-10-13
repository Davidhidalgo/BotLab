import { sampleScratchBlocksWorkspaceArtifact } from './blocks-contract';
import { createLocalScratchBlocksEditorBridge } from './scratch-blocks-local-bridge';

describe('createLocalScratchBlocksEditorBridge', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () =>
        ({
          measureText: () => ({ width: 0 }),
        }) as unknown as CanvasRenderingContext2D,
    ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
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

  it('offers project models in the skill dropdown and keeps the selected name across locale changes', async () => {
    const result = await createLocalScratchBlocksEditorBridge().mount({
      element: document.createElement('div'),
      artifact: sampleScratchBlocksWorkspaceArtifact,
      importedSkills: ['happy-hop'],
    });
    if (!result.mounted) throw new Error('Editor did not mount');
    try {
      const scratch = await import('scratch-blocks');
      const workspace = scratch.getMainWorkspace() as InstanceType<
        typeof scratch.WorkspaceSvg
      >;
      const block = workspace.newBlock(
        'botlab_microduck_community_skill',
        'skill-choice',
      );
      const field = block.getField('SKILL') as InstanceType<
        typeof scratch.FieldDropdown
      >;
      expect(field.getOptions(false).map((option) => option[1])).toContain(
        'happy-hop',
      );
      block.setFieldValue('happy-hop', 'SKILL');
      result.handle.setImportedSkills?.(['happy-hop', 'tiny-pickup']);
      expect(field.getOptions(false).map((option) => option[1])).toContain(
        'tiny-pickup',
      );
      result.handle.setLocale?.('es');
      expect(
        workspace.getBlockById('skill-choice')?.getFieldValue('SKILL'),
      ).toBe('happy-hop');
      expect(result.handle.exportWorkspace().content).toContain('happy-hop');
    } finally {
      result.handle.dispose();
    }
  });

  it('offers localized StackChan blocks with bounded fields and persists their values', async () => {
    const allowed = [
      'event_whenflagclicked',
      'botlab_stackchan_yaw',
      'botlab_stackchan_center',
      'botlab_stackchan_leds',
      'botlab_stackchan_leds_off',
    ];
    const result = await createLocalScratchBlocksEditorBridge().mount({
      element: document.createElement('div'),
      artifact: sampleScratchBlocksWorkspaceArtifact,
      availableBlockTypes: allowed,
      locale: 'es',
    });
    if (!result.mounted) throw new Error('Editor did not mount');
    try {
      const scratch = await import('scratch-blocks');
      const workspace = scratch.getMainWorkspace() as InstanceType<
        typeof scratch.WorkspaceSvg
      >;
      const flyout = workspace.getFlyout()!.getWorkspace();
      expect(
        flyout
          .getAllBlocks(false)
          .filter((block) => !block.isShadow())
          .map((block) => block.type)
          .sort(),
      ).toEqual([...allowed].sort());
      const yaw = workspace.newBlock('botlab_stackchan_yaw', 'head');
      yaw.setFieldValue(1000, 'ANGLE');
      expect(Number(yaw.getFieldValue('ANGLE'))).toBe(20);
      const led = workspace.newBlock('botlab_stackchan_leds', 'light');
      led.setFieldValue(100, 'BRIGHTNESS');
      expect(Number(led.getFieldValue('BRIGHTNESS'))).toBe(25);
      led.setFieldValue('right', 'SIDE');
      result.handle.setLocale?.('en');
      expect(workspace.getBlockById('light')!.getFieldValue('SIDE')).toBe(
        'right',
      );
      expect(result.handle.exportWorkspace().content).toContain(
        'botlab_stackchan_yaw',
      );
    } finally {
      result.handle.dispose();
    }
  });

  it('updates the available palette without deleting existing blocks and preserves filtering across locales', async () => {
    const element = document.createElement('div');
    const result = await createLocalScratchBlocksEditorBridge().mount({
      element,
      artifact: sampleScratchBlocksWorkspaceArtifact,
    });
    if (!result.mounted) throw new Error('Editor did not mount');
    try {
      const scratch = await import('scratch-blocks');
      const workspace = scratch.getMainWorkspace() as InstanceType<
        typeof scratch.WorkspaceSvg
      >;
      const before = result.handle.exportWorkspace().content;
      const allowed = [
        'event_whenflagclicked',
        'control_wait',
        'control_repeat',
      ];
      result.handle.setAvailableBlockTypes?.(allowed);
      expect(workspace.getBlockById('botlab-walk')!.isEnabled()).toBe(false);
      expect(workspace.getBlockById('botlab-start')!.isEnabled()).toBe(true);
      const types = () =>
        workspace
          .getFlyout()!
          .getWorkspace()
          .getAllBlocks(false)
          .filter((block) => !block.isShadow())
          .map((block) => block.type);
      expect(types().sort()).toEqual([...allowed].sort());
      expect(result.handle.exportWorkspace().content).toBe(before);
      result.handle.setLocale?.('es');
      expect(types().sort()).toEqual([...allowed].sort());
      expect(workspace.getBlockById('botlab-walk')!.isEnabled()).toBe(false);
      result.handle.setAvailableBlockTypes?.([
        ...allowed,
        'botlab_microduck_walk_distance',
      ]);
      expect(workspace.getBlockById('botlab-walk')!.isEnabled()).toBe(true);
      expect(types()).toContain('botlab_microduck_walk_distance');
      expect(workspace.getAllBlocks(false).map((block) => block.id)).toContain(
        'botlab-start',
      );
    } finally {
      result.handle.dispose();
    }
  });

  it('does not persist target disabling and preserves an independent user disable', async () => {
    const result = await createLocalScratchBlocksEditorBridge().mount({
      element: document.createElement('div'),
      artifact: sampleScratchBlocksWorkspaceArtifact,
      availableBlockTypes: ['event_whenflagclicked'],
    });
    if (!result.mounted) throw new Error('Editor did not mount');
    try {
      const scratch = await import('scratch-blocks');
      const workspace = scratch.getMainWorkspace() as InstanceType<
        typeof scratch.WorkspaceSvg
      >;
      const walk = workspace.getBlockById('botlab-walk')!;
      expect(walk.isEnabled()).toBe(false);
      expect(result.handle.exportWorkspace().content).not.toContain('disabled');
      walk.setDisabledReason(true, 'user-test');
      result.handle.setAvailableBlockTypes?.([
        'event_whenflagclicked',
        'botlab_microduck_walk_distance',
      ]);
      expect(walk.isEnabled()).toBe(false);
      expect(walk.hasDisabledReason('user-test')).toBe(true);
    } finally {
      result.handle.dispose();
    }
  });

  it('offers eight visual movement blocks and preserves signed turns across languages', async () => {
    const element = document.createElement('div');
    const result = await createLocalScratchBlocksEditorBridge().mount({
      element,
      artifact: sampleScratchBlocksWorkspaceArtifact,
    });
    expect(result.mounted).toBe(true);
    if (!result.mounted) return;
    try {
      const scratch = await import('scratch-blocks');
      const workspace = scratch.getMainWorkspace() as InstanceType<
        typeof scratch.WorkspaceSvg
      >;
      const palette = workspace.getFlyout()!.getWorkspace();
      for (const type of [
        'walk_steps',
        'back_steps',
        'turn_left',
        'turn_right',
        'turn_around',
        'walk_distance',
        'back_distance',
        'turn_degrees',
      ]) {
        const block = palette.getBlocksByType(
          `botlab_microduck_${type}`,
          false,
        )[0];
        expect(block).toBeDefined();
        expect(block.getField('DIRECTION')!.getValue()).toMatch(
          /^data:image\/svg\+xml,/,
        );
        const image = new DOMParser().parseFromString(
          decodeURIComponent(block.getFieldValue('DIRECTION').split(',')[1]),
          'image/svg+xml',
        );
        const glyph = image.documentElement.firstElementChild!;
        expect(glyph.getAttribute('width')).toBe('25');
        expect(glyph.getAttribute('height')).toBe('25');
        expect(glyph.getAttribute('x')).toBe('9.5');
        expect(glyph.getAttribute('y')).toBe('4.5');
        if (type.endsWith('_steps'))
          expect(block.getFieldValue('STEPS')).toBe('1');
        if (type === 'turn_degrees')
          expect(block.getFieldValue('ANGLE')).toBe('90');
        if (type === 'back_distance')
          expect(block.getFieldValue('DISTANCE')).toBe('1');
      }
      const turn = workspace.newBlock(
        'botlab_microduck_turn_degrees',
        'turn-test',
      );
      turn.initSvg();
      turn.render();
      const rightIcon = turn.getFieldValue('DIRECTION');
      turn.setFieldValue('-90', 'ANGLE');
      const leftIcon = turn.getFieldValue('DIRECTION');
      expect(leftIcon).not.toBe(rightIcon);
      const xml = result.handle.exportWorkspace().content;
      expect(xml).not.toContain('data:image');
      for (const [locale, category, turnText] of [
        ['es', 'Movimiento preciso', 'gira'],
        ['en', 'Precise movement', 'turn'],
        ['ca', 'Moviment precís', 'gira'],
      ] as const) {
        result.handle.setLocale?.(locale);
        expect(element.textContent).toContain(category);
        const translated = workspace.getBlockById('turn-test')!;
        expect(translated.getFieldValue('ANGLE')).toBe('-90');
        expect(translated.getFieldValue('DIRECTION')).toBe(leftIcon);
        expect(translated.toString()).toContain(turnText);
        expect(result.handle.exportWorkspace().content).toBe(xml);
      }
    } finally {
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
        'Could not mount Scratch Blocks: The artifact does not contain Scratch Blocks XML.',
    });
  });

  it('observes its container size and disconnects the observer with the workspace', async () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = observe;
        disconnect = disconnect;
      },
    );
    const element = document.createElement('div');
    const result = await createLocalScratchBlocksEditorBridge().mount({
      element,
      artifact: sampleScratchBlocksWorkspaceArtifact,
    });
    expect(result.mounted).toBe(true);
    expect(observe).toHaveBeenCalledWith(element);
    if (result.mounted) result.handle.dispose();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('uses an optional overlay palette in narrow editors and restores the desktop layout', async () => {
    let width = 390;
    let resize = () => {
      /* Test double intentionally does nothing. */
    };
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {
          /* No real observer in this test. */
        }
        disconnect() {
          /* No real observer in this test. */
        }
      },
    );
    const element = document.createElement('div');
    Object.defineProperty(element, 'clientWidth', { get: () => width });
    const result = await createLocalScratchBlocksEditorBridge().mount({
      element,
      artifact: sampleScratchBlocksWorkspaceArtifact,
    });
    expect(result.mounted).toBe(true);
    if (!result.mounted) return;
    try {
      const scratch = await import('scratch-blocks');
      const workspace = scratch.getMainWorkspace() as InstanceType<
        typeof scratch.WorkspaceSvg
      >;
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
    } finally {
      result.handle.dispose();
    }
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
      const workspace = scratch.getMainWorkspace() as InstanceType<
        typeof scratch.WorkspaceSvg
      >;
      const highlight = vi.spyOn(workspace, 'highlightBlock');
      const before = result.handle.exportWorkspace().content;
      result.handle.highlightBlock?.('botlab-walk');
      expect(highlight).toHaveBeenLastCalledWith('botlab-walk');
      result.handle.highlightBlock?.('missing');
      expect(highlight).toHaveBeenLastCalledWith(null);
      result.handle.highlightBlock?.();
      expect(result.handle.exportWorkspace().content).toBe(before);
    } finally {
      result.handle.dispose();
    }
  });

  it('switches existing blocks, dropdowns and toolbox text without editing or losing undo', async () => {
    const onArtifactChange = vi.fn();
    const element = document.createElement('div');
    const artifact = {
      ...sampleScratchBlocksWorkspaceArtifact,
      content: sampleScratchBlocksWorkspaceArtifact.content.replace(
        '</xml>',
        '<block type="control_wait" id="wait" x="600" y="300"><value name="DURATION"><shadow type="math_positive_number"><field name="NUM">2.5</field></shadow></value></block></xml>',
      ),
    };
    const result = await createLocalScratchBlocksEditorBridge().mount({
      element,
      artifact,
      onArtifactChange,
    });
    expect(result.mounted).toBe(true);
    if (!result.mounted) return;
    try {
      const scratch = await import('scratch-blocks');
      const workspace = scratch.getMainWorkspace() as InstanceType<
        typeof scratch.WorkspaceSvg
      >;
      await new Promise((resolve) => setTimeout(resolve, 20));
      workspace.clearUndo();
      workspace.getBlockById('botlab-walk')!.setFieldValue('7.5', 'DISTANCE');
      await vi.waitFor(() =>
        expect(workspace.getUndoStack().length).toBeGreaterThan(0),
      );
      const xml = result.handle.exportWorkspace().content;
      const undoCount = workspace.getUndoStack().length;
      expect(undoCount).toBeGreaterThan(0);
      result.handle.highlightBlock?.('botlab-walk');
      onArtifactChange.mockClear();
      for (const [locale, walk, wait, smile, events] of [
        ['es', 'avanza', 'esperar', 'sonrisa', 'Eventos'],
        ['en', 'move forward', 'wait', 'smile', 'Events'],
        ['ca', 'avança', 'espera', 'somriure', 'Esdeveniments'],
      ] as const) {
        result.handle.setLocale?.(locale);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(workspace.getBlockById('botlab-walk')!.toString()).toContain(
          walk,
        );
        expect(workspace.getBlockById('wait')!.toString()).toContain(wait);
        expect(
          workspace.getBlockById('botlab-leds')!.getField('PATTERN')!.getText(),
        ).toBe(smile);
        expect(
          workspace.getBlockById('botlab-leds')!.getFieldValue('PATTERN'),
        ).toBe('smile');
        expect(element.textContent).toContain(events);
        const palette = workspace.getFlyout()!.getWorkspace();
        expect(
          palette
            .getBlocksByType('botlab_microduck_walk_distance', false)[0]
            .toString(),
        ).toContain(walk);
        expect(
          palette.getBlocksByType('control_wait', false)[0].toString(),
        ).toContain(wait);
        expect(element.querySelectorAll('.blocklyHighlighted')).toHaveLength(1);
        expect(result.handle.exportWorkspace().content).toBe(xml);
        expect(workspace.getUndoStack()).toHaveLength(undoCount);
        expect(onArtifactChange).not.toHaveBeenCalled();
      }
      workspace.undo(false);
      expect(
        workspace.getBlockById('botlab-walk')!.getFieldValue('DISTANCE'),
      ).toBe('5');
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(workspace.getUndoStack().map((event) => event.toJson())).toEqual(
        [],
      );
      expect(workspace.getRedoStack().length).toBeGreaterThan(0);
      result.handle.setLocale?.('en');
      expect(workspace.getRedoStack().length).toBeGreaterThan(0);
      workspace.undo(true);
      expect(
        workspace.getBlockById('botlab-walk')!.getFieldValue('DISTANCE'),
      ).toBe('7.5');
    } finally {
      result.handle.dispose();
    }
  });

  it('uses local translation overlays for the built-in integration', async () => {
    const result = await createLocalScratchBlocksEditorBridge({
      schemaVersion: 1,
      namespace: 'botlab.microduck',
      revision: '1',
      translations: { ca: { walk: 'avança %1 m' } },
    }).mount({
      element: document.createElement('div'),
      artifact: sampleScratchBlocksWorkspaceArtifact,
      locale: 'ca',
    });
    expect(result.mounted).toBe(true);
    if (!result.mounted) return;
    try {
      const scratch = await import('scratch-blocks');
      expect(
        scratch.getMainWorkspace().getBlockById('botlab-walk')!.toString(),
      ).toContain('avança');
      expect(result.handle.exportWorkspace().content).toContain(
        'botlab_microduck_walk_distance',
      );
    } finally {
      result.handle.dispose();
    }
  });

  it('translates read-only workspaces and ignores locale changes after disposal', async () => {
    const result = await createLocalScratchBlocksEditorBridge().mount({
      element: document.createElement('div'),
      artifact: {
        ...sampleScratchBlocksWorkspaceArtifact,
        status: 'read-only',
      },
    });
    expect(result.mounted).toBe(true);
    if (!result.mounted) return;
    try {
      const scratch = await import('scratch-blocks');
      result.handle.setLocale?.('es');
      expect(
        scratch.getMainWorkspace().getBlockById('botlab-walk')!.toString(),
      ).toContain('avanza');
    } finally {
      result.handle.dispose();
    }
    expect(() => result.handle.setLocale?.('en')).not.toThrow();
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
          '>2.5</field>',
        );
        reloaded.handle.dispose();
      }
    },
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
          'text/xml',
        );
        const duration = xml.querySelector('value[name="DURATION"]')!;
        expect(duration.children).toHaveLength(1);
        expect(duration.firstElementChild!.localName).toBe(tag);
        expect(duration.querySelector('field[name="NUM"]')!.textContent).toBe(
          '0',
        );
      } finally {
        result.handle.dispose();
      }
    },
  );
});
