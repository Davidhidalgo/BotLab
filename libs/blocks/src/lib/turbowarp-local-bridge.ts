import type {
  BlocksEditorMountRequest,
  BlocksEditorMountResult,
  TurboWarpEditorBridge,
} from './blocks-contract';

type ScratchBlocksApi = {
  inject?: (
    element: HTMLElement,
    options?: Record<string, unknown>,
  ) => {
    dispose?: () => void;
  };
};

declare global {
  interface Window {
    ScratchBlocks?: ScratchBlocksApi;
  }
}

export function createLocalTurboWarpEditorBridge(): TurboWarpEditorBridge {
  return {
    mount(request) {
      return mountLocalTurboWarpWorkspace(request);
    },
  };
}

function mountLocalTurboWarpWorkspace(
  request: BlocksEditorMountRequest,
): BlocksEditorMountResult {
  const scratchBlocks = window.ScratchBlocks;

  if (!scratchBlocks?.inject) {
    return {
      mounted: false,
      reason:
        'TurboWarp scratch-blocks is installed locally, but no browser-ready ScratchBlocks bundle has been loaded yet.',
    };
  }

  request.element.replaceChildren();
  const workspace = scratchBlocks.inject(request.element, {
    media: '/node_modules/scratch-blocks/media/',
    readOnly: request.artifact.status === 'read-only',
    scrollbars: true,
    toolbox: createBotLabToolboxXml(),
    zoom: {
      controls: true,
      startScale: 0.85,
      wheel: true,
    },
  });

  request.onArtifactChange?.({
    ...request.artifact,
    status: 'loaded',
  });

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
        workspace.dispose?.();
      },
    },
  };
}

function createBotLabToolboxXml() {
  return `
    <xml>
      <category name="Eventos" colour="#FFBF00">
        <block type="event_whenflagclicked"></block>
      </category>
      <category name="BotLab" colour="#0F766E">
        <block type="botlab_microduck_set_leds"></block>
      </category>
      <category name="Control" colour="#FFAB19">
        <block type="control_wait"></block>
      </category>
    </xml>
  `;
}
