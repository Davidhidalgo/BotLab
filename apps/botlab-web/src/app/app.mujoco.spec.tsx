import { fireEvent, render, waitFor } from '@testing-library/react';
import type { BlocksEditorShellProps } from '@botlab/blocks';
import App from './app';
import { sampleScratchBlocksWorkspaceArtifact } from '@botlab/blocks';
import {
  workspaceStorageKey,
  encodeWorkspaceDocument,
  readWorkspaceDocument,
} from './workspace-storage';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

jest.mock('@botlab/blocks', () => ({
  ...jest.requireActual('@botlab/blocks'),
  BlocksEditorShell: ({
    artifact,
    onArtifactChange,
    availableBlockTypes,
  }: BlocksEditorShellProps) => (
    <textarea
      aria-label="Test workspace"
      data-palette={availableBlockTypes?.join(',')}
      value={artifact?.content}
      onChange={(event) =>
        artifact &&
        onArtifactChange?.({
          ...artifact,
          content: event.target.value,
          status: 'dirty',
        })
      }
    />
  ),
}));
jest.mock('./mujoco-simulator-panel', () => ({
  __esModule: true,
  default: ({
    targetId,
    executionBlocked,
  }: {
    targetId: string;
    executionBlocked: boolean;
  }) => (
    <div>
      <p data-testid="mujoco-panel">{targetId}</p>
      <button disabled={executionBlocked}>Test run</button>
    </div>
  ),
}));

describe('MuJoCo in the primary workspace', () => {
  beforeEach(() => localStorage.clear());
  it('offers compatible blocks and preserves each destination across switching, projects and reload', async () => {
    const view = render(<App />);
    const robot = () => view.getByRole('combobox', { name: 'Robot' });
    const backend = () => view.getByRole('combobox', { name: 'Simulador' });
    const editor = () =>
      view.getByLabelText('Test workspace') as HTMLTextAreaElement;
    const legacy = editor().value;
    fireEvent.change(robot(), { target: { value: 'jumper' } });
    expect(await view.findByTestId('mujoco-panel')).toHaveProperty(
      'textContent',
      'jumper-web-walking',
    );
    expect(editor().dataset.palette).toContain('botlab_microduck_walk_steps');
    expect(editor().dataset.palette).toContain('control_wait');
    expect(editor().dataset.palette).toContain('control_repeat');
    expect(editor().dataset.palette).toContain('botlab_microduck_turn_left');
    expect(editor().dataset.palette).toContain('botlab_microduck_turn_right');
    const walking = editor().value.replace('>1<', '>2<');
    fireEvent.change(editor(), { target: { value: walking } });
    expect(backend().querySelectorAll('option')).toHaveLength(1);
    fireEvent.click(view.getByText('Opcions avançades'));
    fireEvent.change(view.getByLabelText('Mode de Jumper'), {
      target: { value: 'jumper-web-joint-probe' },
    });
    expect(editor().dataset.palette).toBe(
      'event_whenflagclicked,botlab_joint_position',
    );
    fireEvent.change(view.getByLabelText('Mode de Jumper'), {
      target: { value: 'jumper-web-walking' },
    });
    expect(editor().value).toBe(walking);
    fireEvent.change(robot(), { target: { value: 'stackchan' } });
    expect(editor().value).toBe(legacy);
    fireEvent.change(robot(), { target: { value: 'microduck' } });
    expect(backend().querySelectorAll('option')).toHaveLength(1);
    expect(
      view.queryByRole('button', { name: /MicroDuck Simulator/ }),
    ).toBeNull();
    expect(view.container.querySelector('iframe')).toBeNull();
    await waitFor(() =>
      expect(view.getByTestId('mujoco-panel')).toHaveProperty(
        'textContent',
        'microduck-mujoco-web',
      ),
    );
    expect(editor().dataset.palette).toContain('botlab_microduck_turn_left');
    expect(editor().dataset.palette).not.toContain(
      'botlab_microduck_turn_right',
    );
    expect(editor().dataset.palette).not.toContain(
      'botlab_microduck_back_steps',
    );
    fireEvent.click(view.getByRole('button', { name: 'Projectes' }));
    fireEvent.click(view.getByRole('button', { name: 'Nou projecte' }));
    expect(robot()).toHaveProperty('value', 'microduck');
    fireEvent.click(view.getByRole('button', { name: 'Projectes' }));
    fireEvent.click(view.getByRole('button', { name: /Mi proyecto/ }));
    fireEvent.click(view.getByRole('button', { name: 'Obre el projecte' }));
    expect(robot()).toHaveProperty('value', 'microduck');
    expect(backend()).toHaveProperty('value', 'mujoco');
    view.unmount();
    const restored = render(<App />);
    expect(await restored.findByTestId('mujoco-panel')).toHaveProperty(
      'textContent',
      'microduck-mujoco-web',
    );
    fireEvent.change(restored.getByRole('combobox', { name: 'Robot' }), {
      target: { value: 'jumper' },
    });
    expect(restored.getByLabelText('Test workspace')).toHaveProperty(
      'value',
      walking,
    );
  });
});

const retiredSource =
  '<xml><block type="event_whenflagclicked" id="flag"><next><block type="botlab_microduck_sit" id="sit"/></next></block></xml>';
const retiredDocument = (simulatorBackend: 'browser' | 'native') => ({
  schemaVersion: 1 as const,
  locale: 'es' as const,
  targetId: 'microduck-sim' as const,
  simulatorBackend,
  workspace: {
    ...sampleScratchBlocksWorkspaceArtifact,
    content: retiredSource,
  },
});
describe('opening retired programs in the product', () => {
  beforeEach(() => localStorage.clear());
  it.each(['browser', 'native'] as const)(
    'restores %s without mounting its transport and blocks unsupported actions',
    async (backend) => {
      localStorage.setItem(
        workspaceStorageKey,
        encodeWorkspaceDocument(retiredDocument(backend)),
      );
      const view = render(<App />);
      expect(await view.findByTestId('mujoco-panel')).toHaveProperty(
        'textContent',
        'microduck-mujoco-web',
      );
      expect(
        view
          .getByRole('combobox', { name: 'Simulador' })
          .querySelectorAll('option'),
      ).toHaveLength(1);
      expect(view.container.querySelector('iframe')).toBeNull();
      expect(view.getByRole('button', { name: 'Test run' })).toHaveProperty(
        'disabled',
        true,
      );
      expect(view.getByLabelText('Test workspace')).toHaveProperty(
        'value',
        retiredSource,
      );
      expect(view.getByText(/Se incluyen al exportar/)).toBeTruthy();
      expect(
        readWorkspaceDocument().document?.targetWorkspaces?.[
          `microduck-sim:${backend}`
        ]?.workspace.content,
      ).toBe(retiredSource);
    },
  );
  it('normalizes a file import and preserves its archived source after reload', async () => {
    const view = render(<App />);
    fireEvent.change(view.getByLabelText('Importa un projecte'), {
      target: {
        files: [
          {
            name: 'old.botlab.json',
            size: 100,
            text: async () =>
              encodeWorkspaceDocument(retiredDocument('native')),
          },
        ],
      },
    });
    expect(await view.findByTestId('mujoco-panel')).toHaveProperty(
      'textContent',
      'microduck-mujoco-web',
    );
    expect(view.getByRole('button', { name: 'Test run' })).toHaveProperty(
      'disabled',
      true,
    );
    view.unmount();
    const again = render(<App />);
    expect(await again.findByTestId('mujoco-panel')).toHaveProperty(
      'textContent',
      'microduck-mujoco-web',
    );
    expect(again.getByLabelText('Test workspace')).toHaveProperty(
      'value',
      retiredSource,
    );
    expect(
      readWorkspaceDocument().document?.targetWorkspaces?.[
        'microduck-sim:native'
      ]?.workspace.content,
    ).toBe(retiredSource);
  });
});
