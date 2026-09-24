import {
  act,
  fireEvent,
  render,
  waitFor,
  within,
} from '@testing-library/react';
import App from './app';
import {
  microDuckSimulatorPreviewLoadTimeoutMs,
  scheduleMicroDuckSimulatorControlSourceDelivery,
} from './microduck-simulator-host';

describe('App', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('schedules retries with one execution ID and the expected origin', () => {
    vi.useFakeTimers();
    const targetWindow = { postMessage: vi.fn() };
    const source = {
      artifactId: 'walk-plan',
      targetId: 'microduck-sim',
      frames: [
        {
          id: 'led',
          type: 'led-pattern' as const,
          targetId: 'microduck-sim',
          pattern: 'smile' as const,
          brightness: 50,
        },
      ],
      messages: [],
      errors: [],
    };
    scheduleMicroDuckSimulatorControlSourceDelivery(
      targetWindow,
      source,
      'http://127.0.0.1:4300',
    );
    act(() => vi.advanceTimersByTime(15000));
    expect(targetWindow.postMessage).toHaveBeenCalledTimes(5);
    expect(targetWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'botlab.microduck.control-source.v1',
        version: 1,
        simulatorId: 'microduck-official-sim',
        executionId: expect.any(String),
        source,
      }),
      'http://127.0.0.1:4300',
    );
    expect(
      new Set(
        targetWindow.postMessage.mock.calls.map(
          ([message]) => message.executionId,
        ),
      ).size,
    ).toBe(1);
  });

  it('shows one primary action next to the simulator, enabled before compilation', () => {
    const view = render(<App />);
    fireEvent.click(view.getByRole('button', { name: /MicroDuck Simulator/ }));
    expect(view.getByLabelText('Idioma')).toHaveProperty('value', 'ca');
    const host = view
      .getByRole('heading', { name: 'MicroDuck' })
      .closest('section')!;
    expect(
      within(host).getByRole('button', { name: 'Executar' }),
    ).toHaveProperty('disabled', false);
    expect(view.getAllByRole('button', { name: 'Executar' })).toHaveLength(1);
    for (const name of [
      'Compilar demo',
      'Simular demo',
      'Executar demo',
      'Carregar runtime',
    ]) {
      expect(view.queryByRole('button', { name })).toBeNull();
    }
    expect(view.getByText('Artifacts')).toBeTruthy();
    expect(view.getByText('compiled-plan-pending')).toBeTruthy();
    expect(view.getByText('simulation-output-pending')).toBeTruthy();
    expect(view.getByText(/0 llest · 3 pendent revisio/)).toBeTruthy();
    expect(view.getByText('Diagnòstic').closest('details')).toHaveProperty(
      'open',
      false,
    );
    expect(
      view.getByText('Detalls del simulador').closest('details'),
    ).toHaveProperty('open', false);
    expect(view.queryByText('React + TypeScript')).toBeNull();
  });

  it('translates the main action into all three languages', () => {
    const view = render(<App />);
    fireEvent.click(view.getByRole('button', { name: /MicroDuck Simulator/ }));
    for (const [locale, name] of [
      ['es', 'Ejecutar'],
      ['en', 'Run'],
      ['ca', 'Executar'],
    ]) {
      fireEvent.change(
        view.getByRole('combobox', { name: /Idioma|Language/ }),
        {
          target: { value: locale },
        },
      );
      expect(view.getByRole('button', { name })).toBeTruthy();
      expect(
        view.getByRole('button', {
          name: locale === 'en' ? 'Reset scene' : 'Reiniciar escena',
        }),
      ).toHaveProperty('disabled', true);
    }
  });

  it('selects StackChan by default with execution disabled until available', () => {
    const view = render(<App />);
    expect(
      view
        .getByRole('button', { name: /StackChan/ })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    const header = within(view.container.querySelector('header')!);
    expect(header.getByRole('combobox', { name: 'Robot' })).toHaveProperty(
      'value',
      'stackchan',
    );
    expect(header.queryByRole('combobox', { name: 'Simulador' })).toBeNull();
    fireEvent.change(header.getByRole('combobox', { name: 'Robot' }), {
      target: { value: 'microduck' },
    });
    expect(header.getByRole('combobox', { name: 'Simulador' })).toHaveProperty(
      'value',
      'browser',
    );
    fireEvent.change(header.getByRole('combobox', { name: 'Robot' }), {
      target: { value: 'stackchan' },
    });
    expect(header.queryByRole('combobox', { name: 'Simulador' })).toBeNull();
    expect(
      view.getByRole('button', { name: 'Connectar Bluetooth' }),
    ).toHaveProperty('disabled', true);
  });

  it('shows a timeout and retries the full launch with the same button', async () => {
    vi.useFakeTimers();
    const view = render(<App />);
    fireEvent.click(view.getByRole('button', { name: /MicroDuck Simulator/ }));
    fireEvent.click(view.getByRole('button', { name: 'Executar' }));
    const first = await view.findByTitle(
      'MicroDuck official simulator preview',
    );
    expect(view.getByRole('button', { name: 'Carregant' })).toHaveProperty(
      'disabled',
      true,
    );
    act(() => vi.advanceTimersByTime(microDuckSimulatorPreviewLoadTimeoutMs));
    expect(
      await view.findByText('Runtime oficial amb error de carrega'),
    ).toBeTruthy();
    expect(view.getByRole('button', { name: 'Executar' })).toHaveProperty(
      'disabled',
      false,
    );
    fireEvent.click(view.getByRole('button', { name: 'Executar' }));
    const second = await view.findByTitle(
      'MicroDuck official simulator preview',
    );
    expect(second).not.toBe(first);
    fireEvent.load(second);
    await waitFor(() =>
      expect(view.getByLabelText('Execució del simulador').textContent).toBe(
        'Esperant el simulador',
      ),
    );
  });

  it('shows iframe errors without keeping the run button locked', async () => {
    const view = render(<App />);
    fireEvent.click(view.getByRole('button', { name: /MicroDuck Simulator/ }));
    fireEvent.click(view.getByRole('button', { name: 'Executar' }));
    fireEvent.error(
      await view.findByTitle('MicroDuck official simulator preview'),
    );
    expect(
      await view.findByText('Runtime oficial amb error de carrega'),
    ).toBeTruthy();
    expect(view.getByRole('button', { name: 'Executar' })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('resets a running scene without changing the workspace or replaying commands', async () => {
    const view = render(<App />);
    fireEvent.click(view.getByRole('button', { name: /MicroDuck Simulator/ }));
    fireEvent.click(view.getByRole('button', { name: 'Executar' }));
    const first = (await view.findByTitle(
      'MicroDuck official simulator preview',
    )) as HTMLIFrameElement;
    const oldWindow = first.contentWindow!;
    const oldPost = vi.spyOn(oldWindow, 'postMessage');
    fireEvent.load(first);
    await waitFor(() => expect(oldPost).toHaveBeenCalled());
    const command = oldPost.mock.calls[0][0];
    const source = command.source;
    const origin = oldPost.mock.calls[0][1] as string;
    act(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          source: oldWindow,
          origin,
          data: {
            type: 'botlab.microduck.execution.v1',
            version: 1,
            simulatorId: 'microduck-official-sim',
            executionId: command.executionId,
            artifactId: source.artifactId,
            status: 'running',
            frameIndex: 1,
            distanceMeters: 0.5,
          },
        }),
      ),
    );
    const savedWorkspace = JSON.parse(
      localStorage.getItem('botlab.workspace.v1')!,
    ).workspace;
    expect(view.getByLabelText('Execució del simulador').textContent).toContain(
      'Executant',
    );
    fireEvent.click(view.getByRole('button', { name: 'Reiniciar escena' }));
    const second = view.getByTitle(
      'MicroDuck official simulator preview',
    ) as HTMLIFrameElement;
    expect(second).not.toBe(first);
    expect(oldPost.mock.calls.at(-1)![0].type).toBe('botlab.microduck.stop.v1');
    expect(
      view.getByRole('button', { name: 'Reiniciar escena' }),
    ).toHaveProperty('disabled', true);
    const newPost = vi.spyOn(second.contentWindow!, 'postMessage');
    fireEvent.load(second);
    expect(view.getByLabelText('Execució del simulador').textContent).toBe(
      'Sense executar',
    );
    const saved = JSON.parse(localStorage.getItem('botlab.workspace.v1')!);
    expect(saved.workspace).toEqual(savedWorkspace);
    expect(saved.lastExecution.status).toBe('stopped');
    expect(saved.lastExecution.events.at(-1).status).toBe('stopped');
    vi.useFakeTimers();
    act(() => vi.advanceTimersByTime(65000));
    expect(newPost).not.toHaveBeenCalled();
    vi.useRealTimers();
    fireEvent.click(view.getByRole('button', { name: 'Executar' }));
    await waitFor(() => expect(newPost).toHaveBeenCalled());
    expect(view.getByTitle('MicroDuck official simulator preview')).toBe(
      second,
    );
    expect(newPost.mock.calls[0][0].source.frames).toEqual(source.frames);
    expect(newPost.mock.calls[0][0].executionId).not.toBe(command.executionId);
  });

  it('can reset again after a scene reload fails without running the program', async () => {
    const view = render(<App />);
    fireEvent.click(view.getByRole('button', { name: /MicroDuck Simulator/ }));
    fireEvent.click(view.getByRole('button', { name: 'Executar' }));
    const first = await view.findByTitle(
      'MicroDuck official simulator preview',
    );
    fireEvent.load(first);
    fireEvent.click(view.getByRole('button', { name: 'Reiniciar escena' }));
    fireEvent.error(view.getByTitle('MicroDuck official simulator preview'));
    expect(
      view.queryByTitle('MicroDuck official simulator preview'),
    ).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Reiniciar escena' }));
    const second = view.getByTitle(
      'MicroDuck official simulator preview',
    ) as HTMLIFrameElement;
    const post = vi.spyOn(second.contentWindow!, 'postMessage');
    fireEvent.load(second);
    expect(post).not.toHaveBeenCalled();
    expect(view.getByLabelText('Execució del simulador').textContent).toBe(
      'Sense executar',
    );
    expect(view.getByRole('button', { name: 'Executar' })).toHaveProperty(
      'disabled',
      false,
    );
  });
});
