import type {
  BlockTranslationOverlay,
  RobotBlockArgument,
  RobotBlockCategory,
  RobotBlockIcon,
  RobotBlockSet,
} from '@botlab/model';
import type * as ScratchBlocksModule from 'scratch-blocks';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ArrowUp,
  ArrowDown,
  CornerUpLeft,
  CornerUpRight,
  Undo2,
} from 'lucide-react';
import {
  createBlockMessageResolver,
  type BlocksLocale,
} from './block-messages';
import type {
  BlocksEditorMountRequest,
  BlocksEditorMountResult,
  ScratchBlocksEditorBridge,
} from './blocks-contract';

type ScratchBlocksApi = typeof ScratchBlocksModule;
type ScratchBlocksWorkspace = ReturnType<ScratchBlocksApi['inject']>;
type ScratchBlockStyle = ScratchBlocksModule.Theme.BlockStyle;

let scratchBlocksPromise: Promise<ScratchBlocksApi> | undefined;
let botLabScratchBlocksTheme:
  | ReturnType<ScratchBlocksApi['Theme']['defineTheme']>
  | undefined;

const SCRATCH_BLOCKS_MEDIA_PATH = '/vendor/scratch-blocks/media/';
const incompatibleTargetReason = 'botlab-incompatible-target';

export interface LocalScratchBlocksEditorBridgeOptions {
  /** Robot block sets to register, in toolbox order. */
  blockSets?: readonly RobotBlockSet[];
  /** Local translation overlays, matched to block sets by namespace. */
  translations?: readonly BlockTranslationOverlay[];
}

/** Resolved display text for one block set, keyed by Scratch `Msg` prefix. */
interface LocalizedBlockSet {
  set: RobotBlockSet;
  prefix: string;
  translate: ReturnType<typeof createBlockMessageResolver>;
}

export function createLocalScratchBlocksEditorBridge({
  blockSets = [],
  translations = [],
}: LocalScratchBlocksEditorBridgeOptions = {}): ScratchBlocksEditorBridge {
  const localized = blockSets.map((set) => ({
    set,
    prefix: messagePrefix(set.messages.namespace),
    translate: createBlockMessageResolver(
      set.messages,
      translations.find(
        (overlay) => overlay.namespace === set.messages.namespace,
      ),
    ),
  }));
  return {
    async mount(request) {
      return mountLocalScratchBlocksWorkspace(
        request,
        await loadScratchBlocks(),
        localized,
      );
    },
  };
}

/** `botlab.microduck` → `BOTLAB_MICRODUCK`, the Scratch `Msg` key prefix. */
function messagePrefix(namespace: string) {
  return namespace.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();
}

function loadScratchBlocks() {
  scratchBlocksPromise ??= import('scratch-blocks');
  return scratchBlocksPromise;
}

function mountLocalScratchBlocksWorkspace(
  request: BlocksEditorMountRequest,
  scratchBlocks: ScratchBlocksApi,
  blockSets: readonly LocalizedBlockSet[],
): BlocksEditorMountResult {
  let locale = request.locale ?? 'ca';
  let availableBlockTypes = request.availableBlockTypes;
  let highlightedBlock: string | undefined;
  let disposed = false;
  function applyLocale(value: BlocksLocale) {
    scratchBlocks.ScratchMsgs.setLocale('en');
    scratchBlocks.ScratchMsgs.setLocale(value);
    for (const { set, prefix, translate } of blockSets) {
      for (const key of Object.keys(set.messages.messages)) {
        scratchBlocks.Msg[`${prefix}_${key.toUpperCase()}`] = translate(
          key,
          value,
        );
      }
    }
  }
  applyLocale(locale);
  for (const blockSet of blockSets) registerBlockSet(scratchBlocks, blockSet);

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
      toolbox: createBotLabToolbox(
        scratchBlocks,
        blockSets,
        availableBlockTypes,
      ),
      zoom: {
        controls: true,
        startScale: 0.85,
        wheel: true,
      },
    });

    loadWorkspaceXml(request.artifact.content, workspace, scratchBlocks);
    function updateBlockCompatibility() {
      const warning =
        locale === 'es'
          ? 'Este bloque no es compatible con el robot seleccionado.'
          : locale === 'ca'
            ? 'Aquest bloc no és compatible amb el robot seleccionat.'
            : 'This block is not compatible with the selected robot.';
      scratchBlocks.Events.disable();
      try {
        for (const block of workspace.getAllBlocks(false)) {
          const incompatible =
            !block.isShadow() &&
            availableBlockTypes !== undefined &&
            !availableBlockTypes.includes(block.type);
          block.setDisabledReason(incompatible, incompatibleTargetReason);
          block.setWarningText(
            incompatible ? warning : null,
            incompatibleTargetReason,
          );
        }
      } finally {
        scratchBlocks.Events.enable();
      }
    }
    updateBlockCompatibility();
    const desktopMetrics = workspace.getMetricsManager();
    const compactMetrics = new scratchBlocks.MetricsManager(workspace);
    let compact = false;
    function resizeWorkspace() {
      const nextCompact =
        request.element.clientWidth > 0 && request.element.clientWidth <= 600;
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
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(resizeWorkspace);
    resizeObserver?.observe(request.element);
    resizeWorkspace();

    workspace.addChangeListener((event) => {
      if (event.isUiEvent || request.artifact.status === 'read-only') {
        return;
      }

      updateBlockCompatibility();

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
        setAvailableBlockTypes(types) {
          if (
            disposed ||
            JSON.stringify(types) === JSON.stringify(availableBlockTypes)
          )
            return;
          availableBlockTypes = [...types];
          const flyout = workspace.getFlyout();
          const visible = flyout?.isVisible();
          const recycling =
            flyout &&
            'setRecyclingEnabled' in flyout &&
            typeof flyout.setRecyclingEnabled === 'function'
              ? flyout.setRecyclingEnabled.bind(flyout)
              : undefined;
          scratchBlocks.Events.disable();
          try {
            recycling?.(false);
            workspace.updateToolbox(
              createBotLabToolbox(
                scratchBlocks,
                blockSets,
                availableBlockTypes,
              ),
            );
            const toolbox = workspace.getToolbox();
            if (
              toolbox &&
              'forceRerender' in toolbox &&
              typeof toolbox.forceRerender === 'function'
            )
              toolbox.forceRerender();
            flyout?.setVisible(visible ?? !compact);
            updateBlockCompatibility();
          } finally {
            recycling?.(true);
            scratchBlocks.Events.enable();
          }
        },
        setLocale(nextLocale) {
          if (disposed || nextLocale === locale) return;
          const xml = scratchBlocks.utils.xml.textToDom(
            exportWorkspaceXml(workspace, scratchBlocks),
          );
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
            const recycling =
              flyout &&
              'setRecyclingEnabled' in flyout &&
              typeof flyout.setRecyclingEnabled === 'function'
                ? flyout.setRecyclingEnabled.bind(flyout)
                : undefined;
            // Scratch caches flyout blocks; changing category names alone leaves old labels.
            recycling?.(false);
            try {
              if (toolbox) {
                workspace.updateToolbox(
                  createBotLabToolbox(
                    scratchBlocks,
                    blockSets,
                    availableBlockTypes,
                  ),
                );
                if (
                  'forceRerender' in toolbox &&
                  typeof toolbox.forceRerender === 'function'
                )
                  toolbox.forceRerender();
              }
            } finally {
              recycling?.(true);
            }
            scratchBlocks.clearWorkspaceAndLoadFromXml(xml, workspace);
            workspace.getUndoStack().splice(0, Infinity, ...undo);
            workspace.getRedoStack().splice(0, Infinity, ...redo);
            workspace.getFlyout()?.setVisible(paletteVisible ?? !compact);
            workspace.scroll(scroll.x, scroll.y);
            workspace.highlightBlock(
              highlightedBlock && workspace.getBlockById(highlightedBlock)
                ? highlightedBlock
                : null,
            );
            locale = nextLocale;
            updateBlockCompatibility();
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
          workspace.highlightBlock(
            blockId && workspace.getBlockById(blockId) ? blockId : null,
          );
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

const iconComponents: Record<RobotBlockIcon, typeof ArrowUp> = {
  forward: ArrowUp,
  backward: ArrowDown,
  left: CornerUpLeft,
  right: CornerUpRight,
  around: Undo2,
};
const iconSources = new Map<RobotBlockIcon, string>();

function iconSource(icon: RobotBlockIcon) {
  let source = iconSources.get(icon);
  if (!source) {
    source = `data:image/svg+xml,${encodeURIComponent(
      renderToStaticMarkup(
        createElement(
          'svg',
          {
            xmlns: 'http://www.w3.org/2000/svg',
            width: 33,
            height: 28,
            viewBox: '0 0 33 28',
          },
          createElement(iconComponents[icon], {
            x: 9.5,
            y: 4.5,
            color: 'white',
            size: 25,
            strokeWidth: 2.5,
          }),
        ),
      ),
    )}`;
    iconSources.set(icon, source);
  }
  return source;
}

/** Defines each block of a set once per Scratch Blocks instance. */
function registerBlockSet(
  scratchBlocks: ScratchBlocksApi,
  { set, prefix }: LocalizedBlockSet,
) {
  const pending = set.blocks.filter(
    (block) => !scratchBlocks.Blocks[block.type],
  );
  if (pending.length === 0) return;
  const message = (key: string) => `%{BKY_${prefix}_${key.toUpperCase()}}`;
  scratchBlocks.defineBlocksWithJsonArray(
    pending.map((block) => {
      const args = block.args ?? [];
      const inline = args.filter((arg) => arg.kind !== 'icon');
      const icons = args.filter((arg) => arg.kind === 'icon');
      // Icons render before the text; message placeholders refer to the other arguments.
      const iconPlaceholders = icons.map(
        (_, index) => `%${inline.length + index + 1} `,
      );
      return {
        type: block.type,
        message0: `${iconPlaceholders.join('')}${message(block.message)}`,
        ...(args.length
          ? {
              args0: [...inline, ...icons].map((arg) =>
                toScratchArgument(arg, message),
              ),
            }
          : {}),
        style: block.style,
        extensions: [
          block.shape === 'boolean' ? 'output_boolean' : 'shape_statement',
        ],
        tooltip: message(block.tooltip),
      };
    }),
  );
  for (const block of pending) {
    const definition = scratchBlocks.Blocks[block.type];
    const initialize = definition.init;
    const clamped = (block.args ?? []).filter(
      (arg) => arg.kind === 'number' && arg.clampToInteger,
    ) as Extract<RobotBlockArgument, { kind: 'number' }>[];
    const signed = (block.args ?? []).filter(
      (arg) => arg.kind === 'icon' && arg.signOf,
    ) as Extract<RobotBlockArgument, { kind: 'icon' }>[];
    if (clamped.length === 0 && signed.length === 0) continue;
    definition.init = function () {
      initialize.call(this);
      // Scratch's field_number implementation does not enforce JSON min/max/precision.
      for (const arg of clamped) {
        const field = this.getField(arg.name);
        field.setValidator((value: string) => {
          const numeric = Number(value);
          return Number.isFinite(numeric)
            ? String(Math.max(arg.min, Math.min(arg.max, Math.round(numeric))))
            : null;
        });
        field.setValue(String(arg.value));
      }
      for (const arg of signed) {
        const { field, negative, positive } = arg.signOf!;
        this.getField(field).setValidator((value: number) => {
          this.getField(arg.name).setValue(
            iconSource(value < 0 ? negative : positive),
          );
          return value;
        });
      }
    };
  }
}

function toScratchArgument(
  arg: RobotBlockArgument,
  message: (key: string) => string,
) {
  switch (arg.kind) {
    case 'number':
      return {
        type: 'field_number',
        name: arg.name,
        value: arg.value,
        // Scratch's field_number reads its initial display value from `text`.
        text: String(arg.value),
        min: arg.min,
        max: arg.max,
        precision: arg.precision,
      };
    case 'dropdown':
      return {
        type: 'field_dropdown',
        name: arg.name,
        options: arg.options.map(([label, value]) => [message(label), value]),
      };
    case 'icon':
      return {
        type: 'field_image',
        name: arg.name,
        src: iconSource(arg.icon),
        width: 33,
        height: 28,
        alt: message(arg.alt),
      };
  }
}

function getBotLabScratchBlocksTheme(scratchBlocks: ScratchBlocksApi) {
  botLabScratchBlocksTheme ??= scratchBlocks.Theme.defineTheme(
    'botlab-scratch-blocks',
    {
      name: 'botlab-scratch-blocks',
      blockStyles: createScratchBlockStyles(scratchBlocks),
      categoryStyles: {
        motion_category: { colour: '#4C97FF' },
        sensing_category: { colour: '#5CB1D6' },
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
    },
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
  blockStyles: Record<string, Partial<ScratchBlockStyle>>,
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
        style.hat ?? '',
      ),
    ]),
  );
}

function createBlockStyle(
  colourPrimary: string,
  colourSecondary: string,
  colourTertiary: string,
  hat = '',
) {
  return {
    colourPrimary,
    colourSecondary,
    colourTertiary,
    hat,
  };
}

const categoryStyles: Record<RobotBlockCategory['style'], string> = {
  motion: 'motion_category',
  sensing: 'sensing_category',
  botlab: 'botlab_category',
};

function createBotLabToolbox(
  scratchBlocks: ScratchBlocksApi,
  blockSets: readonly LocalizedBlockSet[],
  availableBlockTypes?: readonly string[],
) {
  const robotCategories = (placement: 'before-events' | 'after-events') =>
    blockSets.flatMap(({ set, prefix }) =>
      set.categories
        .filter(
          (category) => (category.placement ?? 'after-events') === placement,
        )
        .map((category) => ({
          kind: 'category',
          name:
            'message' in category.name
              ? scratchBlocks.Msg[
                  `${prefix}_${category.name.message.toUpperCase()}`
                ]
              : 'text' in category.name
                ? category.name.text
                : scratchBlocks.Msg['CATEGORY_SENSING'],
          categorystyle: categoryStyles[category.style],
          contents: category.blockTypes.map((type): ToolboxBlock => ({
            kind: 'block',
            type,
          })),
        })),
    );
  const categories: Array<{
    kind: string;
    name: string;
    categorystyle: string;
    contents: ToolboxBlock[];
  }> = [
    ...robotCategories('before-events'),
    {
      kind: 'category',
      name: scratchBlocks.Msg['CATEGORY_EVENTS'],
      categorystyle: 'event_category',
      contents: [{ kind: 'block', type: 'event_whenflagclicked' }],
    },
    ...robotCategories('after-events'),
    {
      kind: 'category',
      name: scratchBlocks.Msg['CATEGORY_CONTROL'],
      categorystyle: 'control_category',
      contents: [
        {
          kind: 'block',
          type: 'control_repeat',
          inputs: {
            TIMES: {
              shadow: { type: 'math_whole_number', fields: { NUM: 10 } },
            },
          },
        },
        { kind: 'block', type: 'control_if' },
        { kind: 'block', type: 'control_if_else' },
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
  ];
  return {
    kind: 'categoryToolbox',
    contents: categories
      .map((category) => ({
        ...category,
        contents: category.contents.filter(
          (block) =>
            availableBlockTypes === undefined ||
            availableBlockTypes.includes(block.type),
        ),
      }))
      .filter((category) => category.contents.length > 0),
  };
}

interface ToolboxBlock {
  kind: 'block';
  type: string;
  inputs?: Record<string, unknown>;
}

function loadWorkspaceXml(
  content: string,
  workspace: ScratchBlocksWorkspace,
  scratchBlocks: ScratchBlocksApi,
) {
  const document = new DOMParser().parseFromString(content, 'text/xml');
  const xml = document.documentElement;

  if (xml.nodeName.toLowerCase() !== 'xml') {
    throw new Error('The artifact does not contain Scratch Blocks XML.');
  }

  // Older toolbox entries created wait blocks without an editable number shadow.
  for (const block of Array.from(
    xml.querySelectorAll('block[type="control_wait"]'),
  )) {
    let duration = Array.from(block.children).find(
      (child) =>
        child.localName === 'value' &&
        child.getAttribute('name') === 'DURATION',
    );
    if (
      duration &&
      Array.from(duration.children).some(
        (child) => child.localName === 'shadow' || child.localName === 'block',
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
  scratchBlocks: ScratchBlocksApi,
) {
  // Target compatibility is derived UI state, never a persistent user disable.
  const incompatible = workspace
    .getAllBlocks(false)
    .filter((block) => block.hasDisabledReason(incompatibleTargetReason));
  scratchBlocks.Events.disable();
  try {
    incompatible.forEach((block) =>
      block.setDisabledReason(false, incompatibleTargetReason),
    );
    return scratchBlocks.Xml.domToText(
      scratchBlocks.Xml.workspaceToDom(workspace),
    );
  } finally {
    incompatible.forEach((block) =>
      block.setDisabledReason(true, incompatibleTargetReason),
    );
    scratchBlocks.Events.enable();
  }
}
