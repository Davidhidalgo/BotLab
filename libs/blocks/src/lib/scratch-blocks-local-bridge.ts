import type * as ScratchBlocksModule from 'scratch-blocks';
import { createBlockMessageResolver, type BlocksLocale, type BlockTranslationOverlay } from './block-messages';
import { microDuckBlockMessages } from './microduck-block-messages';
import type {
  BlocksEditorMountRequest,
  BlocksEditorMountResult,
  ScratchBlocksEditorBridge,
} from './blocks-contract';

type ScratchBlocksApi = typeof ScratchBlocksModule;
type ScratchBlocksWorkspace = ReturnType<ScratchBlocksApi['inject']>;
type ScratchBlockStyle = ScratchBlocksModule.Theme.BlockStyle;

let botLabBlocksRegistered = false;
let scratchBlocksPromise: Promise<ScratchBlocksApi> | undefined;
let botLabScratchBlocksTheme:
  | ReturnType<ScratchBlocksApi['Theme']['defineTheme']>
  | undefined;

const SCRATCH_BLOCKS_MEDIA_PATH = '/vendor/scratch-blocks/media/';

export function createLocalScratchBlocksEditorBridge(translations?: BlockTranslationOverlay): ScratchBlocksEditorBridge {
  const translate = createBlockMessageResolver(microDuckBlockMessages, translations);
  return {
    async mount(request) {
      return mountLocalScratchBlocksWorkspace(
        request,
        await loadScratchBlocks(),
        translate
      );
    },
  };
}

function loadScratchBlocks() {
  scratchBlocksPromise ??= import('scratch-blocks');
  return scratchBlocksPromise;
}

function mountLocalScratchBlocksWorkspace(
  request: BlocksEditorMountRequest,
  scratchBlocks: ScratchBlocksApi,
  translate: ReturnType<typeof createBlockMessageResolver>
): BlocksEditorMountResult {
  let locale = request.locale ?? 'ca';
  let highlightedBlock: string | undefined;
  let disposed = false;
  function applyLocale(value: BlocksLocale) {
    scratchBlocks.ScratchMsgs.setLocale('en');
    scratchBlocks.ScratchMsgs.setLocale(value);
    for (const key of Object.keys(microDuckBlockMessages.messages)) {
      scratchBlocks.Msg[`BOTLAB_MICRODUCK_${key.toUpperCase()}`] = translate(key, value);
    }
  }
  applyLocale(locale);
  registerBotLabBlocks(scratchBlocks);

  request.element.replaceChildren();
  request.element.classList.add('botlab-scratch-blocks-workspace');
  request.element.style.minHeight = '280px';
  request.element.style.height = '100%';

  try {
    const workspace = scratchBlocks.inject(request.element, {
      media: SCRATCH_BLOCKS_MEDIA_PATH,
      readOnly: request.artifact.status === 'read-only',
      scrollbars: true,
      theme: getBotLabScratchBlocksTheme(scratchBlocks),
      toolbox: createBotLabToolbox(scratchBlocks),
      zoom: {
        controls: true,
        startScale: 0.85,
        wheel: true,
      },
    });

    loadWorkspaceXml(request.artifact.content, workspace, scratchBlocks);
    const desktopMetrics = workspace.getMetricsManager();
    const compactMetrics = new scratchBlocks.MetricsManager(workspace);
    let compact = false;
    function resizeWorkspace() {
      const nextCompact = request.element.clientWidth > 0 && request.element.clientWidth <= 600;
      if (nextCompact !== compact) {
        compact = nextCompact;
        workspace.setMetricsManager(compact ? compactMetrics : desktopMetrics);
        const flyout = workspace.getFlyout();
        if (flyout) {
          flyout.autoClose = compact;
          flyout.setVisible(!compact);
        }
        if (compact) workspace.setScale(Math.min(workspace.scale, 0.75));
        scratchBlocks.svgResize(workspace);
        workspace.scrollCenter();
      }
      scratchBlocks.svgResize(workspace);
    }
    const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined
      : new ResizeObserver(resizeWorkspace);
    resizeObserver?.observe(request.element);
    resizeWorkspace();

    workspace.addChangeListener((event) => {
      if (event.isUiEvent || request.artifact.status === 'read-only') {
        return;
      }

      request.onArtifactChange?.({
        ...request.artifact,
        content: exportWorkspaceXml(workspace, scratchBlocks),
        status: 'dirty',
      });
    });

    request.onArtifactChange?.({
      ...request.artifact,
      content: exportWorkspaceXml(workspace, scratchBlocks),
      status: 'loaded',
    });

    return {
      mounted: true,
      handle: {
        setLocale(nextLocale) {
          if (disposed || nextLocale === locale) return;
          const xml = scratchBlocks.Xml.workspaceToDom(workspace);
          const scroll = { x: workspace.scrollX, y: workspace.scrollY };
          const paletteVisible = workspace.getFlyout()?.isVisible();
          const undo = [...workspace.getUndoStack()];
          const redo = [...workspace.getRedoStack()];
          // Rebuild display fields with the same serialized IDs, values and connections.
          scratchBlocks.Events.disable();
          try {
            applyLocale(nextLocale);
            const toolbox = workspace.getToolbox();
            const flyout = workspace.getFlyout();
            const recycling = flyout && 'setRecyclingEnabled' in flyout && typeof flyout.setRecyclingEnabled === 'function'
              ? flyout.setRecyclingEnabled.bind(flyout) : undefined;
            // Scratch caches flyout blocks; changing category names alone leaves old labels.
            recycling?.(false);
            try {
              if (toolbox) {
                workspace.updateToolbox(createBotLabToolbox(scratchBlocks));
                if ('forceRerender' in toolbox && typeof toolbox.forceRerender === 'function') toolbox.forceRerender();
              }
            } finally { recycling?.(true); }
            scratchBlocks.clearWorkspaceAndLoadFromXml(xml, workspace);
            workspace.getUndoStack().splice(0, Infinity, ...undo);
            workspace.getRedoStack().splice(0, Infinity, ...redo);
            workspace.getFlyout()?.setVisible(paletteVisible ?? !compact);
            workspace.scroll(scroll.x, scroll.y);
            workspace.highlightBlock(highlightedBlock && workspace.getBlockById(highlightedBlock) ? highlightedBlock : null);
            locale = nextLocale;
          } finally {
            scratchBlocks.Events.enable();
          }
        },
        togglePalette() {
          const flyout = workspace.getFlyout();
          if (compact && flyout) {
            flyout.setVisible(!flyout.isVisible());
            scratchBlocks.svgResize(workspace);
          }
        },
        highlightBlock(blockId) {
          highlightedBlock = blockId;
          workspace.highlightBlock(blockId && workspace.getBlockById(blockId) ? blockId : null);
        },
        exportWorkspace() {
          return {
            ...request.artifact,
            content: exportWorkspaceXml(workspace, scratchBlocks),
            status: 'dirty',
          };
        },
        dispose() {
          if (disposed) return;
          disposed = true;
          resizeObserver?.disconnect();
          workspace.dispose();
        },
      },
    };
  } catch (error) {
    request.element.replaceChildren();

    return {
      mounted: false,
      reason: `Could not mount Scratch Blocks: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

function registerBotLabBlocks(scratchBlocks: ScratchBlocksApi) {
  if (
    botLabBlocksRegistered ||
    scratchBlocks.Blocks.botlab_microduck_set_leds
  ) {
    botLabBlocksRegistered = true;
    return;
  }

  scratchBlocks.defineBlocksWithJsonArray([
    {
      type: 'botlab_microduck_set_leds',
      message0: '%{BKY_BOTLAB_MICRODUCK_LEDS}',
      args0: [
        {
          type: 'field_dropdown',
          name: 'PATTERN',
          options: [
            ['%{BKY_BOTLAB_MICRODUCK_SMILE}', 'smile'],
            ['%{BKY_BOTLAB_MICRODUCK_BLINK}', 'blink'],
            ['%{BKY_BOTLAB_MICRODUCK_SOLID}', 'solid'],
            ['%{BKY_BOTLAB_MICRODUCK_OFF}', 'off'],
          ],
        },
      ],
      style: 'more',
      extensions: ['shape_statement'],
      tooltip: '%{BKY_BOTLAB_MICRODUCK_LEDSTOOLTIP}',
    },
    {
      type: 'botlab_microduck_walk_distance',
      message0: '%{BKY_BOTLAB_MICRODUCK_WALK}',
      args0: [
        {
          type: 'field_number',
          name: 'DISTANCE',
          value: 5,
          min: 0,
          max: 20,
          precision: 0.1,
        },
      ],
      style: 'motion',
      extensions: ['shape_statement'],
      tooltip:
        '%{BKY_BOTLAB_MICRODUCK_WALKTOOLTIP}',
    },
  ]);

  botLabBlocksRegistered = true;
}

function getBotLabScratchBlocksTheme(scratchBlocks: ScratchBlocksApi) {
  botLabScratchBlocksTheme ??= scratchBlocks.Theme.defineTheme(
    'botlab-scratch-blocks',
    {
      name: 'botlab-scratch-blocks',
      blockStyles: createScratchBlockStyles(scratchBlocks),
      categoryStyles: {
        control_category: {
          colour: '#FFAB19',
        },
        event_category: {
          colour: '#FFBF00',
        },
        botlab_category: {
          colour: '#0F766E',
        },
      },
      componentStyles: {
        workspaceBackgroundColour: '#F8FAFC',
        toolboxBackgroundColour: '#FFFFFF',
        toolboxForegroundColour: '#334155',
        flyoutBackgroundColour: '#FFFFFF',
        flyoutForegroundColour: '#334155',
        scrollbarColour: '#CBD5E1',
        insertionMarkerColour: '#0F766E',
      },
    }
  );

  return botLabScratchBlocksTheme;
}

function createScratchBlockStyles(scratchBlocks: ScratchBlocksApi) {
  return {
    ...normalizeBlocklyBlockStyles(scratchBlocks.Themes.Classic.blockStyles),
    control: createBlockStyle('#FFAB19', '#EC9C13', '#CF8B17'),
    data: createBlockStyle('#FF8C1A', '#FF8000', '#DB6E00'),
    data_lists: createBlockStyle('#FF661A', '#FF5500', '#E64D00'),
    event: createBlockStyle('#FFBF00', '#E6AC00', '#CC9900', 'cap'),
    looks: createBlockStyle('#9966FF', '#855CD6', '#774DCB'),
    more: createBlockStyle('#0F766E', '#0D9488', '#115E59'),
    motion: createBlockStyle('#4C97FF', '#4280D7', '#3373CC'),
    operators: createBlockStyle('#59C059', '#46B946', '#389438'),
    pen: createBlockStyle('#0FBD8C', '#0DA57A', '#0B8E69'),
    sensing: createBlockStyle('#5CB1D6', '#47A8D1', '#2E8EB8'),
    sounds: createBlockStyle('#CF63CF', '#C94FC9', '#BD42BD'),
    textField: createBlockStyle('#FFFFFF', '#FFFFFF', '#FFFFFF'),
  };
}

function normalizeBlocklyBlockStyles(
  blockStyles: Record<string, Partial<ScratchBlockStyle>>
) {
  return Object.fromEntries(
    Object.entries(blockStyles).map(([name, style]) => [
      name,
      createBlockStyle(
        style.colourPrimary ?? '#64748B',
        style.colourSecondary ?? style.colourPrimary ?? '#475569',
        style.colourTertiary ??
          style.colourSecondary ??
          style.colourPrimary ??
          '#334155',
        style.hat ?? ''
      ),
    ])
  );
}

function createBlockStyle(
  colourPrimary: string,
  colourSecondary: string,
  colourTertiary: string,
  hat = ''
) {
  return {
    colourPrimary,
    colourSecondary,
    colourTertiary,
    hat,
  };
}

function createBotLabToolbox(scratchBlocks: ScratchBlocksApi) {
  return {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category',
        name: scratchBlocks.Msg['CATEGORY_EVENTS'],
        categorystyle: 'event_category',
        contents: [{ kind: 'block', type: 'event_whenflagclicked' }],
      },
      {
        kind: 'category',
        name: 'BotLab',
        categorystyle: 'botlab_category',
        contents: [
          { kind: 'block', type: 'botlab_microduck_set_leds' },
          { kind: 'block', type: 'botlab_microduck_walk_distance' },
        ],
      },
      {
        kind: 'category',
        name: scratchBlocks.Msg['CATEGORY_CONTROL'],
        categorystyle: 'control_category',
        contents: [
          {
            kind: 'block',
            type: 'control_wait',
            inputs: {
              DURATION: {
                shadow: { type: 'math_positive_number', fields: { NUM: 1 } },
              },
            },
          },
        ],
      },
    ],
  };
}

function loadWorkspaceXml(
  content: string,
  workspace: ScratchBlocksWorkspace,
  scratchBlocks: ScratchBlocksApi
) {
  const document = new DOMParser().parseFromString(content, 'text/xml');
  const xml = document.documentElement;

  if (xml.nodeName.toLowerCase() !== 'xml') {
    throw new Error('The artifact does not contain Scratch Blocks XML.');
  }

  // Older toolbox entries created wait blocks without an editable number shadow.
  for (const block of Array.from(
    xml.querySelectorAll('block[type="control_wait"]')
  )) {
    let duration = Array.from(block.children).find(
      (child) =>
        child.localName === 'value' && child.getAttribute('name') === 'DURATION'
    );
    if (
      duration &&
      Array.from(duration.children).some(
        (child) => child.localName === 'shadow' || child.localName === 'block'
      )
    )
      continue;

    if (!duration) {
      duration = document.createElementNS(xml.namespaceURI, 'value');
      duration.setAttribute('name', 'DURATION');
      block.appendChild(duration);
    }
    const shadow = document.createElementNS(xml.namespaceURI, 'shadow');
    shadow.setAttribute('type', 'math_positive_number');
    const field = document.createElementNS(xml.namespaceURI, 'field');
    field.setAttribute('name', 'NUM');
    field.textContent = '1';
    shadow.appendChild(field);
    duration.appendChild(shadow);
  }

  scratchBlocks.clearWorkspaceAndLoadFromXml(xml, workspace);
}

function exportWorkspaceXml(
  workspace: ScratchBlocksWorkspace,
  scratchBlocks: ScratchBlocksApi
) {
  return scratchBlocks.Xml.domToText(
    scratchBlocks.Xml.workspaceToDom(workspace)
  );
}
