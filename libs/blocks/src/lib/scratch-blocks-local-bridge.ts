import type * as ScratchBlocksModule from 'scratch-blocks';
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

export function createLocalScratchBlocksEditorBridge(): ScratchBlocksEditorBridge {
  return {
    async mount(request) {
      return mountLocalScratchBlocksWorkspace(
        request,
        await loadScratchBlocks()
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
  scratchBlocks: ScratchBlocksApi
): BlocksEditorMountResult {
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
      toolbox: createBotLabToolbox(),
      zoom: {
        controls: true,
        startScale: 0.85,
        wheel: true,
      },
    });

    loadWorkspaceXml(request.artifact.content, workspace, scratchBlocks);

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
        exportWorkspace() {
          return {
            ...request.artifact,
            content: exportWorkspaceXml(workspace, scratchBlocks),
            status: 'dirty',
          };
        },
        dispose() {
          workspace.dispose();
        },
      },
    };
  } catch (error) {
    request.element.replaceChildren();

    return {
      mounted: false,
      reason: `Scratch Blocks no se ha podido montar: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

function registerBotLabBlocks(scratchBlocks: ScratchBlocksApi) {
  scratchBlocks.ScratchMsgs.setLocale('en');

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
      message0: 'fijar LEDs MicroDuck %1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'PATTERN',
          options: [
            ['sonrisa', 'smile'],
            ['parpadeo', 'blink'],
            ['solido', 'solid'],
            ['apagar', 'off'],
          ],
        },
      ],
      style: 'more',
      extensions: ['shape_statement'],
      tooltip: 'Controla los LEDs del robot MicroDuck.',
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

function createBotLabToolbox() {
  return {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category',
        name: 'Eventos',
        categorystyle: 'event_category',
        contents: [{ kind: 'block', type: 'event_whenflagclicked' }],
      },
      {
        kind: 'category',
        name: 'BotLab',
        categorystyle: 'botlab_category',
        contents: [{ kind: 'block', type: 'botlab_microduck_set_leds' }],
      },
      {
        kind: 'category',
        name: 'Control',
        categorystyle: 'control_category',
        contents: [{ kind: 'block', type: 'control_wait' }],
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
    throw new Error('el artefacto no contiene XML de Scratch Blocks.');
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
