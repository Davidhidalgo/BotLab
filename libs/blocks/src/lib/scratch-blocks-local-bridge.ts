import {
  registerMicroduckMujocoBlocks,
  applyWebWalkingLocale,
} from './microduck-mujoco-blocks';
import {
  applyStackChanLocale,
  registerStackChanBlocks,
} from './stackchan-blocks';
import { registerJumperBlocks } from './jumper-blocks';
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
  type BlockTranslationOverlay,
} from './block-messages';
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
const importedSkillsByWorkspace = new WeakMap<object, readonly string[]>();
let scratchBlocksPromise: Promise<ScratchBlocksApi> | undefined;
let botLabScratchBlocksTheme:
  | ReturnType<ScratchBlocksApi['Theme']['defineTheme']>
  | undefined;

const SCRATCH_BLOCKS_MEDIA_PATH = '/vendor/scratch-blocks/media/';
const incompatibleTargetReason = 'botlab-incompatible-target';

export function createLocalScratchBlocksEditorBridge(
  translations?: BlockTranslationOverlay,
): ScratchBlocksEditorBridge {
  const translate = createBlockMessageResolver(
    microDuckBlockMessages,
    translations,
  );
  return {
    async mount(request) {
      return mountLocalScratchBlocksWorkspace(
        request,
        await loadScratchBlocks(),
        translate,
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
  translate: ReturnType<typeof createBlockMessageResolver>,
): BlocksEditorMountResult {
  let locale = request.locale ?? 'ca';
  let availableBlockTypes = request.availableBlockTypes;
  let highlightedBlock: string | undefined;
  let disposed = false;
  function applyLocale(value: BlocksLocale) {
    scratchBlocks.ScratchMsgs.setLocale('en');
    scratchBlocks.ScratchMsgs.setLocale(value);
    applyStackChanLocale(scratchBlocks, value);
    applyWebWalkingLocale(scratchBlocks, value);
    for (const key of Object.keys(microDuckBlockMessages.messages)) {
      scratchBlocks.Msg[`BOTLAB_MICRODUCK_${key.toUpperCase()}`] = translate(
        key,
        value,
      );
    }
  }
  applyLocale(locale);
  registerBotLabBlocks(scratchBlocks);
  registerStackChanBlocks(scratchBlocks);
  registerJumperBlocks(scratchBlocks);
  registerMicroduckMujocoBlocks(scratchBlocks);

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
      toolbox: createBotLabToolbox(scratchBlocks, availableBlockTypes),
      zoom: {
        controls: true,
        startScale: 0.85,
        wheel: true,
      },
    });

    const previousSkillNames = Array.from(
      new DOMParser()
        .parseFromString(request.artifact.content, 'text/xml')
        .querySelectorAll(
          'block[type="botlab_microduck_community_skill"] > field[name="SKILL"]',
        ),
      (field) => field.textContent ?? '',
    ).filter((name) => /^[a-z][a-z0-9_-]{0,39}$/.test(name));
    importedSkillsByWorkspace.set(workspace, [
      ...new Set([...(request.importedSkills ?? []), ...previousSkillNames]),
    ]);

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
      if (
        disposed ||
        event.isUiEvent ||
        request.artifact.status === 'read-only'
      ) {
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
        setImportedSkills(names) {
          importedSkillsByWorkspace.set(workspace, [
            ...new Set([
              ...names,
              ...workspace
                .getAllBlocks(false)
                .filter(
                  (block) => block.type === 'botlab_microduck_community_skill',
                )
                .map((block) => block.getFieldValue('SKILL'))
                .filter(
                  (name): name is string =>
                    typeof name === 'string' && name !== '__none__',
                ),
            ]),
          ]);
        },
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
              createBotLabToolbox(scratchBlocks, availableBlockTypes),
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
                  createBotLabToolbox(scratchBlocks, availableBlockTypes),
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

function registerBotLabBlocks(scratchBlocks: ScratchBlocksApi) {
  if (
    botLabBlocksRegistered ||
    scratchBlocks.Blocks.botlab_microduck_set_leds
  ) {
    botLabBlocksRegistered = true;
    return;
  }

  const icon = (component: typeof ArrowUp) =>
    `data:image/svg+xml,${encodeURIComponent(
      renderToStaticMarkup(
        createElement(
          'svg',
          {
            xmlns: 'http://www.w3.org/2000/svg',
            width: 33,
            height: 28,
            viewBox: '0 0 33 28',
          },
          createElement(component, {
            x: 9.5,
            y: 4.5,
            color: 'white',
            size: 25,
            strokeWidth: 2.5,
          }),
        ),
      ),
    )}`;
  const icons = {
    forward: icon(ArrowUp),
    backward: icon(ArrowDown),
    left: icon(CornerUpLeft),
    right: icon(CornerUpRight),
    around: icon(Undo2),
  };
  const message = (key: string) =>
    `%{BKY_BOTLAB_MICRODUCK_${key.toUpperCase()}}`;
  const movementBlocks = [
    {
      type: 'walk_steps',
      key: 'forwardSteps',
      tooltip: 'stepsTooltip',
      icon: icons.forward,
      field: 'STEPS',
      value: 1,
      min: 0,
      max: 40,
      precision: 1,
    },
    {
      type: 'back_steps',
      key: 'backwardSteps',
      tooltip: 'stepsTooltip',
      icon: icons.backward,
      field: 'STEPS',
      value: 1,
      min: 0,
      max: 40,
      precision: 1,
    },
    {
      type: 'turn_left',
      key: 'turnLeft',
      tooltip: 'turnLeftTooltip',
      icon: icons.left,
    },
    {
      type: 'turn_right',
      key: 'turnRight',
      tooltip: 'turnRightTooltip',
      icon: icons.right,
    },
    {
      type: 'turn_around',
      key: 'turnAround',
      tooltip: 'turnAroundTooltip',
      icon: icons.around,
    },
    {
      type: 'walk_distance',
      key: 'walk',
      tooltip: 'walkTooltip',
      icon: icons.forward,
      field: 'DISTANCE',
      value: 5,
      min: 0,
      max: 20,
      precision: 0.1,
    },
    {
      type: 'back_distance',
      key: 'backwardMeters',
      tooltip: 'backwardTooltip',
      icon: icons.backward,
      field: 'DISTANCE',
      value: 1,
      min: 0,
      max: 20,
      precision: 0.1,
    },
    {
      type: 'turn_degrees',
      key: 'turnDegrees',
      tooltip: 'turnTooltip',
      icon: icons.right,
      field: 'ANGLE',
      value: 90,
      min: -360,
      max: 360,
      precision: 1,
    },
  ];
  scratchBlocks.defineBlocksWithJsonArray([
    ...[
      ['walk_until_obstacle', 'walkUntilObstacle'],
      ['turn_left_until_clear', 'turnLeftUntilClear'],
      ['turn_right_until_clear', 'turnRightUntilClear'],
    ].map(([type, key]) => ({
      type: `botlab_microduck_${type}`,
      message0: message(key),
      style: 'motion',
      extensions: ['shape_statement'],
      tooltip: message('navigationTooltip'),
    })),
    ...['sit', 'stand', 'transitioning'].map((posture) => ({
      type: `botlab_microduck_is_${posture}`,
      message0: message(`is_${posture}`),
      style: 'sensing',
      extensions: ['output_boolean'],
      tooltip: message('conditionTooltip'),
    })),
    ...['sit', 'stand'].map((posture) => ({
      type: `botlab_microduck_${posture}`,
      message0: message(posture),
      style: 'motion',
      extensions: ['shape_statement'],
      tooltip: message('postureTooltip'),
    })),
    ...['kick_left', 'kick_right'].map((skill) => ({
      type: `botlab_microduck_${skill}`,
      message0: message(skill),
      style: 'motion',
      extensions: ['shape_statement'],
      tooltip: message('kickTooltip'),
    })),
    {
      type: 'botlab_microduck_community_skill',
      message0: message('communitySkill'),
      args0: [
        {
          type: 'field_dropdown',
          name: 'SKILL',
          options: [['%{BKY_BOTLAB_MICRODUCK_CHOOSESKILL}', '__none__']],
        },
      ],
      style: 'motion',
      extensions: ['shape_statement'],
      tooltip: message('communitySkillTooltip'),
    },
    ...movementBlocks.map((block) => ({
      type: `botlab_microduck_${block.type}`,
      message0: `%${block.field ? 2 : 1} ${message(block.key)}`,
      args0: [
        ...(block.field
          ? [
              {
                type: 'field_number',
                name: block.field,
                value: block.value,
                text: String(block.value),
                min: block.min,
                max: block.max,
                precision: block.precision,
              },
            ]
          : []),
        {
          type: 'field_image',
          name: 'DIRECTION',
          src: block.icon,
          width: 33,
          height: 28,
          alt: message(block.tooltip),
        },
      ],
      style: 'motion',
      extensions: ['shape_statement'],
      tooltip: message(block.tooltip),
    })),
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
  ]);
  const turnDefinition = scratchBlocks.Blocks.botlab_microduck_turn_degrees;
  const communityDefinition =
    scratchBlocks.Blocks.botlab_microduck_community_skill;
  const initializeCommunity = communityDefinition.init;
  communityDefinition.init = function () {
    initializeCommunity.call(this);
    const input = this.inputList[0];
    input.removeField('SKILL');
    input.appendField(
      new scratchBlocks.FieldDropdown(() => {
        const names = importedSkillsByWorkspace.get(this.workspace) ?? [];
        const selected = this.getFieldValue('SKILL');
        const all =
          selected && selected !== '__none__' && !names.includes(selected)
            ? [...names, selected]
            : names;
        return [
          [String(scratchBlocks.Msg.BOTLAB_MICRODUCK_CHOOSESKILL), '__none__'],
          ...all.map((name): [string, string] => [name, name]),
        ];
      }),
      'SKILL',
    );
  };
  const initializeTurn = turnDefinition.init;
  turnDefinition.init = function () {
    initializeTurn.call(this);
    this.getField('ANGLE').setValidator((value: number) => {
      this.getField('DIRECTION').setValue(value < 0 ? icons.left : icons.right);
      return value;
    });
  };

  botLabBlocksRegistered = true;
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

function createBotLabToolbox(
  scratchBlocks: ScratchBlocksApi,
  availableBlockTypes?: readonly string[],
) {
  return {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category',
        name: 'Jumper',
        categorystyle: 'motion_category',
        contents: [{ kind: 'block', type: 'botlab_joint_position' }],
      },
      {
        kind: 'category',
        name: scratchBlocks.Msg['BOTLAB_STACKCHAN_MOVEMENT'],
        categorystyle: 'motion_category',
        contents: ['yaw', 'center'].map((type) => ({
          kind: 'block',
          type: `botlab_stackchan_${type}`,
        })),
      },
      {
        kind: 'category',
        name: scratchBlocks.Msg['BOTLAB_STACKCHAN_LIGHTS'],
        categorystyle: 'botlab_category',
        contents: ['leds', 'leds_off'].map((type) => ({
          kind: 'block',
          type: `botlab_stackchan_${type}`,
        })),
      },
      {
        kind: 'category',
        name: scratchBlocks.Msg['CATEGORY_EVENTS'],
        categorystyle: 'event_category',
        contents: [{ kind: 'block', type: 'event_whenflagclicked' }],
      },
      {
        kind: 'category',
        name: scratchBlocks.Msg['BOTLAB_MICRODUCK_MOVEMENT'],
        categorystyle: 'motion_category',
        contents: [
          'walk_steps',
          'back_steps',
          'turn_left',
          'turn_right',
          'turn_around',
        ].map((type) => ({
          kind: 'block',
          type: `botlab_microduck_${type}`,
          inputs: {},
        })),
      },
      {
        kind: 'category',
        name: scratchBlocks.Msg['BOTLAB_MICRODUCK_NAVIGATION'],
        categorystyle: 'motion_category',
        contents: [
          'walk_until_obstacle',
          'turn_left_until_clear',
          'turn_right_until_clear',
        ].map((type) => ({
          kind: 'block',
          type: `botlab_microduck_${type}`,
          inputs: {},
        })),
      },
      {
        kind: 'category',
        name: scratchBlocks.Msg['BOTLAB_MICRODUCK_PRECISEMOVEMENT'],
        categorystyle: 'motion_category',
        contents: [
          'walk_distance',
          'back_distance',
          'turn_degrees',
          'sit',
          'stand',
          'kick_left',
          'kick_right',
          'community_skill',
        ]
          .map((type) => ({
            kind: 'block',
            type: `botlab_microduck_${type}`,
            inputs: {},
          }))
          .concat([
            { kind: 'block', type: 'botlab_web_advance_cm', inputs: {} },
            {
              kind: 'block',
              type: 'botlab_web_advance_value',
              inputs: {
                CM: { shadow: { type: 'math_number', fields: { NUM: 15 } } },
              },
            },
            { kind: 'block', type: 'botlab_web_rest', inputs: {} },
            { kind: 'block', type: 'botlab_jumper_jump', inputs: {} },
            { kind: 'block', type: 'botlab_web_ground_pick', inputs: {} },
            { kind: 'block', type: 'botlab_web_head_yaw', inputs: {} },
          ]),
      },
      {
        kind: 'category',
        name: scratchBlocks.Msg['CATEGORY_SENSING'],
        categorystyle: 'sensing_category',
        contents: [
          { kind: 'block', type: 'botlab_web_obstacle' },
          { kind: 'block', type: 'botlab_web_distance_cm' },
          ...['sit', 'stand', 'transitioning'].map((posture) => ({
            kind: 'block',
            type: `botlab_microduck_is_${posture}`,
          })),
        ],
      },
      {
        kind: 'category',
        name: 'BotLab',
        categorystyle: 'botlab_category',
        contents: [{ kind: 'block', type: 'botlab_microduck_set_leds' }],
      },
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
          { kind: 'block', type: 'control_repeat_until' },
          { kind: 'block', type: 'botlab_web_wait_until' },
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
      {
        kind: 'category',
        name: scratchBlocks.Msg['CATEGORY_OPERATORS'],
        categorystyle: 'operators_category',
        contents: [
          'operator_and',
          'operator_or',
          'operator_not',
          'operator_lt',
          'operator_gt',
          'operator_equals',
          'operator_add',
          'operator_subtract',
          'operator_multiply',
          'operator_divide',
        ].map((type) => ({
          kind: 'block',
          type,
          ...(['operator_and', 'operator_or', 'operator_not'].includes(type)
            ? {}
            : {
                inputs: Object.fromEntries(
                  (['operator_lt', 'operator_gt', 'operator_equals'].includes(
                    type,
                  )
                    ? ['OPERAND1', 'OPERAND2']
                    : ['NUM1', 'NUM2']
                  ).map((name) => [
                    name,
                    { shadow: { type: 'math_number', fields: { NUM: 0 } } },
                  ]),
                ),
              }),
        })),
      },
      {
        kind: 'category',
        name: scratchBlocks.Msg['BOTLAB_WEB_VARIABLES'],
        categorystyle: 'data_category',
        contents: [
          { kind: 'block', type: 'botlab_web_number' },
          ...['set', 'change'].map((operation) => ({
            kind: 'block',
            type: `botlab_web_${operation}_number`,
            inputs: {
              VALUE: {
                shadow: {
                  type: 'math_number',
                  fields: { NUM: operation === 'set' ? 0 : 1 },
                },
              },
            },
          })),
        ],
      },
      {
        kind: 'category',
        name: scratchBlocks.Msg['BOTLAB_WEB_ADVANCED'],
        categorystyle: 'motion_category',
        contents: [{ kind: 'block', type: 'botlab_web_velocity' }],
      },
    ]
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
