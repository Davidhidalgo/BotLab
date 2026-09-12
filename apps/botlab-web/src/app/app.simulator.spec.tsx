import { act, fireEvent, render, waitFor } from '@testing-library/react';
import type { BlocksEditorShellProps } from '@botlab/blocks';
import App from './app';

jest.mock('@botlab/blocks', () => ({
  ...jest.requireActual('@botlab/blocks'),
  BlocksEditorShell: ({
    artifact,
    onArtifactChange,
    activeBlockId,
    locale,
  }: BlocksEditorShellProps) => (
    <textarea
      aria-label="Test workspace"
      data-active-block={activeBlockId}
      data-locale={locale}
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
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('passes the locale to blocks without stopping or replaying a simulator execution', async () => {
    const view = render(<App />);
    fireEvent.click(view.getByRole('button', { name: 'Executar' }));
    const frame = await view.findByTitle('MicroDuck official simulator preview') as HTMLIFrameElement;
    const post = jest.spyOn(frame.contentWindow!, 'postMessage');
    fireEvent.load(frame);
    await waitFor(() => expect(post).toHaveBeenCalled());
    const request = post.mock.calls[0][0];
    act(() => window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow, origin: 'http://127.0.0.1:4300', data: {
        type: 'botlab.microduck.execution.v1', version: 1, simulatorId: 'microduck-official-sim',
        executionId: request.executionId, artifactId: request.source.artifactId, status: 'running', frameIndex: 1,
      },
    })));
    const editor = view.getByLabelText('Test workspace') as HTMLTextAreaElement;
    const original = editor.value;
    post.mockClear();
    for (const locale of ['es', 'en', 'ca']) {
      fireEvent.change(view.getByRole('combobox'), { target: { value: locale } });
      expect(editor.dataset.locale).toBe(locale);
      expect(editor.value).toBe(original);
      expect(editor.dataset.activeBlock).toBe('botlab-walk');
      expect(view.getByTitle('MicroDuck official simulator preview')).toBe(frame);
      expect(post).not.toHaveBeenCalled();
    }
  });

  it('requires simulator confirmation, stops pending retries, and runs the edited plan', async () => {
    jest.useFakeTimers();
    const view = render(<App />);
    const run = () =>
      view.getByRole('button', { name: 'Executar' });
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
      if (state === 'completed') {
        act(() => window.dispatchEvent(new MessageEvent('message', {
          origin, source: sender, data: {
            type: 'botlab.microduck.execution.v1', version: 1, simulatorId: 'microduck-official-sim',
            executionId: message.executionId, artifactId: message.source.artifactId,
            status: 'running', frameIndex: 1, distanceMeters: message.source.frames[1].distanceMeters,
          },
        })));
      }
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
    fireEvent.click(view.getByRole('button', { name: 'Aturar' }));
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
    view.unmount();
    const restored = render(<App />);
    expect(
      restored.queryByTitle('MicroDuck official simulator preview')
    ).toBeNull();
    expect(
      restored.getByText(/Última execució: Execució confirmada/)
    ).toBeTruthy();
    expect(restored.getByText(second.source.artifactId)).toBeTruthy();
  });

  it('closes the iframe if stopping is not acknowledged', async () => {
    jest.useFakeTimers();
    const view = render(<App />);
    fireEvent.click(
      view.getByRole('button', { name: 'Executar' })
    );
    const frame = await view.findByTitle(
      'MicroDuck official simulator preview'
    );
    fireEvent.load(frame);
    fireEvent.click(view.getByRole('button', { name: 'Aturar' }));
    act(() => jest.advanceTimersByTime(3000));
    expect(
      view.queryByTitle('MicroDuck official simulator preview')
    ).toBeNull();
    expect(view.getByLabelText('Execució del simulador').textContent).toBe(
      'Sense confirmació del simulador'
    );
  });

  it('rejects completion from an old simulator that never confirmed measured arrival', async () => {
    const view = render(<App />);
    fireEvent.click(view.getByRole('button', { name: 'Executar' }));
    const frame = await view.findByTitle('MicroDuck official simulator preview') as HTMLIFrameElement;
    const post = jest.spyOn(frame.contentWindow!, 'postMessage');
    fireEvent.load(frame);
    await waitFor(() => expect(post).toHaveBeenCalled());
    const message = post.mock.calls[0][0];
    act(() => window.dispatchEvent(new MessageEvent('message', {
      origin: 'http://127.0.0.1:4300', source: frame.contentWindow, data: {
        type: 'botlab.microduck.execution.v1', version: 1, simulatorId: 'microduck-official-sim',
        executionId: message.executionId, artifactId: message.source.artifactId, status: 'completed',
      },
    })));
    expect(view.getByText('No es pot llegir la posició o l’orientació del robot.')).toBeTruthy();
    expect(view.queryByTitle('MicroDuck official simulator preview')).toBeNull();
    expect(view.getByLabelText('Test workspace').getAttribute('data-active-block')).toBe('botlab-walk');
  });

  it('links measured progress and failures to the source block without editing the program', async () => {
    const view = render(<App />);
    const editor = view.getByLabelText('Test workspace') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: '<xml><block type="event_whenflagclicked"><next><block type="botlab_microduck_walk_distance" id="walk"><field name="DISTANCE">5</field><next><block type="control_wait" id="wait"><value name="DURATION"><shadow type="math_positive_number"><field name="NUM">3</field></shadow></value></block></next></block></next></block></xml>' } });
    const original = editor.value;
    fireEvent.click(view.getByRole('button', { name: 'Executar' }));
    const frame = await view.findByTitle('MicroDuck official simulator preview') as HTMLIFrameElement;
    const post = jest.spyOn(frame.contentWindow!, 'postMessage');
    fireEvent.load(frame);
    await waitFor(() => expect(post).toHaveBeenCalled());
    const message = post.mock.calls[0][0];
    const status = (data: Record<string, unknown>) => act(() => window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow, origin: 'http://127.0.0.1:4300', data: {
        type: 'botlab.microduck.execution.v1', version: 1, simulatorId: 'microduck-official-sim',
        executionId: message.executionId, artifactId: message.source.artifactId, status: 'running', ...data,
      },
    })));
    expect(message.source.frames[0].sourceBlockId).toBe('walk');
    status({ frameIndex: 0, distanceMeters: 1.25, elapsedMs: 5000 });
    expect(view.getByText('Caminant: 1.25 / 5 m')).toBeTruthy();
    expect(editor.dataset.activeBlock).toBe('walk');
    status({ frameIndex: 1, elapsedMs: 1250 });
    expect(view.getByText('Esperant: 1.8 s')).toBeTruthy();
    expect(editor.dataset.activeBlock).toBe('wait');
    expect(editor.value).toBe(original);
    // Malformed telemetry cannot replace valid progress.
    status({ frameIndex: 0, distanceMeters: Infinity });
    expect(editor.dataset.activeBlock).toBe('wait');
    status({ status: 'failed', frameIndex: 0, errorCode: 'motion-stalled' });
    expect(view.getByText('El robot no es mou com s’esperava. Comprova si hi ha un obstacle.')).toBeTruthy();
    expect(editor.dataset.activeBlock).toBe('walk');
    expect(view.getByTitle('MicroDuck official simulator preview')).toBe(frame);
    expect(view.getByLabelText('Execució del simulador').textContent).toBe('Execució aturada per un error');
    expect(editor.value).toBe(original);
    for (const [locale, label, text] of [
      ['es', 'Ejecución del simulador', 'Ejecución detenida por un error'],
      ['en', 'Simulator execution', 'Execution stopped by an error'],
      ['ca', 'Execució del simulador', 'Execució aturada per un error'],
    ]) {
      fireEvent.change(view.getByRole('combobox'), { target: { value: locale } });
      expect(view.getByLabelText(label).textContent).toBe(text);
      expect(view.getByTitle('MicroDuck official simulator preview')).toBe(frame);
    }
    post.mockClear();
    fireEvent.change(editor, { target: { value: original.replace('>5<', '>2<') } });
    expect(editor.dataset.activeBlock).toBeUndefined();
    fireEvent.click(view.getByRole('button', { name: 'Executar' }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    const retry = post.mock.calls[0][0];
    expect(retry.executionId).not.toBe(message.executionId);
    expect(retry.source.frames[0].distanceMeters).toBe(2);
    expect(view.getByTitle('MicroDuck official simulator preview')).toBe(frame);
    status({ status: 'failed', frameIndex: 0, errorCode: 'motion-stalled' });
    expect(view.queryByRole('alert')).toBeNull();
  });

  it.each(['telemetry-unavailable', 'invalid-frame', 'position-reset', 'motion-timeout', 'scene-interrupted'])(
    'keeps the scene available after a confirmed %s failure', async (errorCode) => {
      const view = render(<App />);
      fireEvent.click(view.getByRole('button', { name: 'Executar' }));
      const frame = await view.findByTitle('MicroDuck official simulator preview') as HTMLIFrameElement;
      const post = jest.spyOn(frame.contentWindow!, 'postMessage');
      fireEvent.load(frame);
      await waitFor(() => expect(post).toHaveBeenCalled());
      const message = post.mock.calls[0][0];
      act(() => window.dispatchEvent(new MessageEvent('message', {
        origin: 'http://127.0.0.1:4300', source: frame.contentWindow, data: {
          type: 'botlab.microduck.execution.v1', version: 1, simulatorId: 'microduck-official-sim',
          executionId: message.executionId, artifactId: message.source.artifactId,
          status: 'failed', frameIndex: 1, errorCode,
        },
      })));
      expect(view.getByTitle('MicroDuck official simulator preview')).toBe(frame);
      expect(view.getByRole('alert')).toBeTruthy();
      expect(view.getByRole('button', { name: 'Executar' })).toHaveProperty('disabled', false);
      fireEvent.click(view.getByRole('button', { name: 'Reiniciar escena' }));
      expect(view.getByTitle('MicroDuck official simulator preview')).not.toBe(frame);
      expect(view.queryByRole('alert')).toBeNull();
      expect(view.getByRole('button', { name: 'Carregant' })).toHaveProperty('disabled', true);
    }
  );

  it('stops on invalid XML and recovers after the user fixes it', async () => {
    const view = render(<App />);
    const editor = view.getByLabelText('Test workspace') as HTMLTextAreaElement;
    const validContent = editor.value;
    fireEvent.change(editor, { target: { value: '<xml><broken>' } });
    fireEvent.click(
      view.getByRole('button', { name: 'Executar' })
    );
    expect(await view.findByRole('alert')).toBeTruthy();
    expect(
      view.queryByTitle('MicroDuck official simulator preview')
    ).toBeNull();
    fireEvent.change(editor, { target: { value: validContent } });
    fireEvent.click(
      view.getByRole('button', { name: 'Executar' })
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
        view.getByRole('button', { name: 'Executar' })
      );
      fireEvent.change(editor, { target: { value: '<xml></xml>' } });
    });
    expect(
      view.queryByTitle('MicroDuck official simulator preview')
    ).toBeNull();
    expect(
      view.getByRole('button', { name: 'Executar' })
    ).toHaveProperty('disabled', false);
  });

  it('restores edited blocks and locale after remount without starting the simulator', () => {
    const first = render(<App />);
    const editor = first.getByLabelText(
      'Test workspace'
    ) as HTMLTextAreaElement;
    const xml = new DOMParser().parseFromString(editor.value, 'text/xml');
    xml.querySelector('field[name="DISTANCE"]')!.textContent = '12';
    const content = new XMLSerializer().serializeToString(xml);
    fireEvent.change(editor, { target: { value: content } });
    fireEvent.change(first.getByRole('combobox'), { target: { value: 'en' } });
    first.unmount();
    const second = render(<App />);
    expect(second.getByLabelText('Test workspace')).toHaveProperty(
      'value',
      content
    );
    expect(second.getByRole('combobox')).toHaveProperty('value', 'en');
    expect(
      second.queryByTitle('MicroDuck official simulator preview')
    ).toBeNull();
    expect(second.getByText('compiled-plan-pending')).toBeTruthy();
    expect(second.getByLabelText('Simulator execution').textContent).toBe(
      'Not run'
    );
  });

  it('imports a versioned program and rejects invalid files without replacing current blocks', async () => {
    const view = render(<App />);
    const editor = view.getByLabelText('Test workspace') as HTMLTextAreaElement;
    const input = view.getByLabelText('Importar programa', {
      selector: 'input',
    });
    const original = editor.value;
    fireEvent.change(input, {
      target: { files: [{ size: 2, text: async () => '{}' }] },
    });
    expect(await view.findByRole('alert')).toBeTruthy();
    expect(editor.value).toBe(original);
    const { sampleScratchBlocksWorkspaceArtifact } =
      jest.requireActual('@botlab/blocks');
    const json = JSON.stringify({
      schemaVersion: 1,
      locale: 'es',
      workspace: {
        ...sampleScratchBlocksWorkspaceArtifact,
        content: '<xml><block type="event_whenflagclicked"/></xml>',
      },
    });
    fireEvent.change(input, {
      target: { files: [{ size: json.length, text: async () => json }] },
    });
    await waitFor(() =>
      expect(view.getByRole('combobox')).toHaveProperty('value', 'es')
    );
    expect(view.getByLabelText('Test workspace')).toHaveProperty(
      'value',
      '<xml><block type="event_whenflagclicked"/></xml>'
    );
    expect(
      view.queryByTitle('MicroDuck official simulator preview')
    ).toBeNull();
  });
});
