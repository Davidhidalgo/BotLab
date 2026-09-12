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

describe('Connected simulator execution', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('runs an edited plan and replays it without remounting the simulator', async () => {
    jest.useFakeTimers();
    const view = render(<App />);
    const button = (name: string) =>
      view.getByRole('button', { name, exact: true });
    const compileAndSimulate = async () => {
      fireEvent.click(button('Compilar demo'));
      await waitFor(() =>
        expect(button('Simular demo')).toHaveProperty('disabled', false)
      );
      fireEvent.click(button('Simular demo'));
      await waitFor(() =>
        expect(button('Executar demo')).toHaveProperty('disabled', false)
      );
    };

    await compileAndSimulate();
    fireEvent.click(button('Carregar runtime'));
    const frame = (await view.findByTitle(
      'MicroDuck official simulator preview'
    )) as HTMLIFrameElement;
    const postMessage = jest.spyOn(frame.contentWindow!, 'postMessage');
    fireEvent.load(frame);
    act(() => jest.advanceTimersByTime(15000));
    const initial = postMessage.mock.calls[0][0];
    expect(postMessage).toHaveBeenCalledTimes(5);
    expect(
      new Set(postMessage.mock.calls.map(([message]) => message.executionId))
        .size
    ).toBe(1);
    postMessage.mockClear();

    const editor = view.getByLabelText('Test workspace') as HTMLTextAreaElement;
    const xml = new DOMParser().parseFromString(editor.value, 'text/xml');
    xml.querySelector('field[name="DISTANCE"]')!.textContent = '10';
    fireEvent.change(editor, {
      target: { value: new XMLSerializer().serializeToString(xml) },
    });
    expect(button('Executar demo')).toHaveProperty('disabled', true);
    fireEvent.click(button('Executar demo'));
    expect(postMessage).not.toHaveBeenCalled();

    await compileAndSimulate();
    expect(postMessage).not.toHaveBeenCalled();
    fireEvent.click(button('Executar demo'));
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
    await waitFor(() =>
      expect(button('Executar demo')).toHaveProperty('disabled', false)
    );

    postMessage.mockClear();
    fireEvent.click(button('Executar demo'));
    const replay = postMessage.mock.calls[0][0];
    expect(replay.source).toEqual(edited.source);
    expect(replay.executionId).not.toBe(edited.executionId);
    await waitFor(() =>
      expect(button('Executar demo')).toHaveProperty('disabled', false)
    );
    act(() => jest.advanceTimersByTime(15000));
    expect(postMessage).toHaveBeenCalledTimes(5);
    expect(
      postMessage.mock.calls.every(
        ([message]) => message.executionId === replay.executionId
      )
    ).toBe(true);
    expect(view.getByTitle('MicroDuck official simulator preview')).toBe(frame);

    fireEvent.click(button('Executar demo'));
    await waitFor(() =>
      expect(button('Executar demo')).toHaveProperty('disabled', false)
    );
    fireEvent.click(button('Desconnectar runtime'));
    postMessage.mockClear();
    act(() => jest.advanceTimersByTime(15000));
    expect(postMessage).not.toHaveBeenCalled();
  });
});
