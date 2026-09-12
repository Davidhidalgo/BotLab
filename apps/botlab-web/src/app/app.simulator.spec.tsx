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

  it('prepares, loads, edits and replays with one button and one iframe', async () => {
    jest.useFakeTimers();
    const view = render(<App />);
    const run = () =>
      view.getByRole('button', { name: 'Executar', exact: true });
    const ready = () =>
      waitFor(() => expect(run()).toHaveProperty('disabled', false));
    const initialButton = run();
    fireEvent.click(initialButton);
    expect(initialButton).toHaveProperty('disabled', true);
    fireEvent.click(initialButton);
    const frame = (await view.findByTitle(
      'MicroDuck official simulator preview'
    )) as HTMLIFrameElement;
    const postMessage = jest.spyOn(frame.contentWindow!, 'postMessage');
    fireEvent.load(frame);
    await ready();
    act(() => jest.advanceTimersByTime(15000));
    expect(postMessage).toHaveBeenCalledTimes(5);
    const initial = postMessage.mock.calls[0][0];
    expect(
      new Set(postMessage.mock.calls.map(([message]) => message.executionId))
        .size
    ).toBe(1);
    expect(initial.source.frames).toHaveLength(3);
    expect(view.getByText('Execucio demo completada.')).toBeTruthy();
    postMessage.mockClear();

    const editor = view.getByLabelText('Test workspace') as HTMLTextAreaElement;
    const xml = new DOMParser().parseFromString(editor.value, 'text/xml');
    xml.querySelector('field[name="DISTANCE"]')!.textContent = '10';
    fireEvent.change(editor, {
      target: { value: new XMLSerializer().serializeToString(xml) },
    });
    expect(run()).toHaveProperty('disabled', false);
    expect(postMessage).not.toHaveBeenCalled();
    fireEvent.click(run());
    await ready();
    const edited = postMessage.mock.calls[0][0];
    expect(edited.source.frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'differential-drive',
          distanceMeters: 10,
          durationMs: 5000,
        }),
      ])
    );
    expect(edited.executionId).not.toBe(initial.executionId);
    expect(view.getByTitle('MicroDuck official simulator preview')).toBe(frame);

    postMessage.mockClear();
    fireEvent.click(run());
    await ready();
    const replay = postMessage.mock.calls[0][0];
    expect(replay.source).toEqual(edited.source);
    expect(replay.executionId).not.toBe(edited.executionId);
    act(() => jest.advanceTimersByTime(15000));
    expect(postMessage).toHaveBeenCalledTimes(5);
    expect(
      postMessage.mock.calls.every(
        ([message]) => message.executionId === replay.executionId
      )
    ).toBe(true);
    expect(view.getByTitle('MicroDuck official simulator preview')).toBe(frame);

    fireEvent.click(run());
    await ready();
    fireEvent.click(view.getByRole('button', { name: 'Desconnectar runtime' }));
    postMessage.mockClear();
    act(() => jest.advanceTimersByTime(15000));
    expect(postMessage).not.toHaveBeenCalled();
    expect(
      view.queryByTitle('MicroDuck official simulator preview')
    ).toBeNull();
    fireEvent.click(run());
    const reconnected = await view.findByTitle(
      'MicroDuck official simulator preview'
    );
    expect(reconnected).not.toBe(frame);
    fireEvent.load(reconnected);
    await ready();
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
