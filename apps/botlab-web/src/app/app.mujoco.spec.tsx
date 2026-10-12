import { fireEvent, render, waitFor } from '@testing-library/react';
import type { BlocksEditorShellProps } from '@botlab/blocks';
import App from './app';

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
  default: ({ targetId }: { targetId: string }) => (
    <p data-testid="mujoco-panel">{targetId}</p>
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
    expect(editor().dataset.palette).not.toContain(
      'botlab_microduck_turn_left',
    );
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
    fireEvent.change(backend(), { target: { value: 'mujoco' } });
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
