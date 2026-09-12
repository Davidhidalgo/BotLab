import { act, fireEvent, render, waitFor } from '@testing-library/react';
import type { BlocksEditorShellProps } from '@botlab/blocks';
import App from './app';

jest.mock('@botlab/blocks', () => ({
  ...jest.requireActual('@botlab/blocks'),
  BlocksEditorShell: ({
    artifact,
    onArtifactChange,
  }: BlocksEditorShellProps) => (
    <textarea
      aria-label="Test workspace"
      value={artifact?.content}
      onChange={(event) =>
        artifact &&
        onArtifactChange?.({
          ...artifact,
          status: 'dirty',
          content: event.target.value,
        })
      }
    />
  ),
}));

describe('One-click simulator execution', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('requires simulator confirmation, stops pending retries, and runs the edited plan', async () => {
    jest.useFakeTimers();
    const view = render(<App />);
    const run = () =>
      view.getByRole('button', { name: 'Executar', exact: true });
    fireEvent.click(run());
    const frame = (await view.findByTitle(
      'MicroDuck official simulator preview'
    )) as HTMLIFrameElement;
    const postMessage = jest.spyOn(frame.contentWindow!, 'postMessage');
    fireEvent.load(frame);
    await waitFor(() => expect(postMessage).toHaveBeenCalled());
    const first = postMessage.mock.calls[0][0];
    expect(run()).toHaveProperty('disabled', true);
    expect(view.getByLabelText('Execució del simulador').textContent).toBe(
      'Esperant el simulador'
    );
    const status = (
      state: string,
      message = first,
      origin = 'http://127.0.0.1:4300',
      sender: MessageEventSource | null = frame.contentWindow
    ) => {
      act(() =>
        window.dispatchEvent(
          new MessageEvent('message', {
            origin,
            source: sender,
            data: {
              type: 'botlab.microduck.execution.v1',
              version: 1,
              simulatorId: 'microduck-official-sim',
              executionId: message.executionId,
              artifactId: message.source.artifactId,
              status: state,
            },
          })
        )
      );
    };
    status('completed', first, 'https://untrusted.example');
    status('completed', first, undefined, window);
    expect(run()).toHaveProperty('disabled', true);
    act(() => jest.advanceTimersByTime(15000));
    expect(postMessage).toHaveBeenCalledTimes(5);
    status('running');
    expect(view.getByLabelText('Execució del simulador').textContent).toBe(
      'Executant al simulador'
    );
    fireEvent.click(view.getByRole('button', { name: 'Aturar', exact: true }));
    expect(postMessage.mock.calls.at(-1)![0]).toMatchObject({
      type: 'botlab.microduck.stop.v1',
      executionId: first.executionId,
    });
    status('running');
    expect(view.getByLabelText('Execució del simulador').textContent).toBe(
      'Aturant'
    );
    status('stopped');
    await waitFor(() => expect(run()).toHaveProperty('disabled', false));
    postMessage.mockClear();
    act(() => jest.advanceTimersByTime(15000));
    expect(postMessage).not.toHaveBeenCalled();

    const editor = view.getByLabelText('Test workspace') as HTMLTextAreaElement;
    const xml = new DOMParser().parseFromString(editor.value, 'text/xml');
    xml.querySelector('field[name="DISTANCE"]')!.textContent = '10';
    fireEvent.change(editor, {
      target: { value: new XMLSerializer().serializeToString(xml) },
    });
    fireEvent.click(run());
    await waitFor(() => expect(postMessage).toHaveBeenCalled());
    const second = postMessage.mock.calls[0][0];
    expect(second.executionId).not.toBe(first.executionId);
    expect(second.source.frames[1].distanceMeters).toBe(10);
    status('completed', first);
    expect(run()).toHaveProperty('disabled', true);
    status('completed', second);
    await waitFor(() => expect(run()).toHaveProperty('disabled', false));
    expect(view.getByLabelText('Execució del simulador').textContent).toBe(
      'Execució confirmada'
    );
    expect(view.getByTitle('MicroDuck official simulator preview')).toBe(frame);
  });

  it('closes the iframe if stopping is not acknowledged', async () => {
    jest.useFakeTimers();
    const view = render(<App />);
    fireEvent.click(
      view.getByRole('button', { name: 'Executar', exact: true })
    );
    const frame = await view.findByTitle(
      'MicroDuck official simulator preview'
    );
    fireEvent.load(frame);
    fireEvent.click(view.getByRole('button', { name: 'Aturar', exact: true }));
    act(() => jest.advanceTimersByTime(3000));
    expect(
      view.queryByTitle('MicroDuck official simulator preview')
    ).toBeNull();
    expect(view.getByLabelText('Execució del simulador').textContent).toBe(
      'Sense confirmació del simulador'
    );
  });

  it('stops on invalid XML and recovers after the user fixes it', async () => {
    const view = render(<App />);
    const editor = view.getByLabelText('Test workspace') as HTMLTextAreaElement;
    const validContent = editor.value;
    fireEvent.change(editor, { target: { value: '<xml><broken>' } });
    fireEvent.click(
      view.getByRole('button', { name: 'Executar', exact: true })
    );
    expect(await view.findByRole('alert')).toBeTruthy();
    expect(
      view.queryByTitle('MicroDuck official simulator preview')
    ).toBeNull();
    fireEvent.change(editor, { target: { value: validContent } });
    fireEvent.click(
      view.getByRole('button', { name: 'Executar', exact: true })
    );
    fireEvent.load(
      await view.findByTitle('MicroDuck official simulator preview')
    );
    await waitFor(() => expect(view.queryByRole('alert')).toBeNull());
  });

  it('cancels preparation if the workspace changes before compilation completes', async () => {
    const view = render(<App />);
    const editor = view.getByLabelText('Test workspace') as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.click(
        view.getByRole('button', { name: 'Executar', exact: true })
      );
      fireEvent.change(editor, { target: { value: '<xml></xml>' } });
    });
    expect(
      view.queryByTitle('MicroDuck official simulator preview')
    ).toBeNull();
    expect(
      view.getByRole('button', { name: 'Executar', exact: true })
    ).toHaveProperty('disabled', false);
  });
});
