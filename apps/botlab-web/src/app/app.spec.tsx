import {
  act,
  fireEvent,
  render,
  waitFor,
  within,
} from '@testing-library/react';
import App, {
  microDuckSimulatorPreviewLoadTimeoutMs,
  scheduleMicroDuckSimulatorControlSourceDelivery,
} from './app';

describe('App', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('schedules retries with one execution ID and the expected origin', () => {
    jest.useFakeTimers();
    const targetWindow = { postMessage: jest.fn() };
    const source = {
      artifactId: 'walk-plan',
      targetId: 'microduck-sim',
      frames: [
        {
          id: 'led',
          type: 'led-pattern' as const,
          targetId: 'microduck-sim',
          pattern: 'smile',
          brightness: 50,
        },
      ],
      messages: [],
      errors: [],
    };
    scheduleMicroDuckSimulatorControlSourceDelivery(
      targetWindow,
      source,
      'http://127.0.0.1:4300'
    );
    act(() => jest.advanceTimersByTime(15000));
    expect(targetWindow.postMessage).toHaveBeenCalledTimes(5);
    expect(targetWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'botlab.microduck.control-source.v1',
        version: 1,
        simulatorId: 'microduck-official-sim',
        executionId: expect.any(String),
        source,
      }),
      'http://127.0.0.1:4300'
    );
    expect(
      new Set(
        targetWindow.postMessage.mock.calls.map(
          ([message]) => message.executionId
        )
      ).size
    ).toBe(1);
  });

  it('shows one primary action next to the simulator, enabled before compilation', () => {
    const view = render(<App />);
    expect(view.getByLabelText('Idioma')).toHaveProperty('value', 'ca');
    const host = view
      .getByRole('heading', { name: 'MicroDuck Simulator Host' })
      .closest('section')!;
    expect(
      within(host).getByRole('button', { name: 'Executar', exact: true })
    ).toHaveProperty('disabled', false);
    expect(
      view.getAllByRole('button', { name: 'Executar', exact: true })
    ).toHaveLength(1);
    for (const name of [
      'Compilar demo',
      'Simular demo',
      'Executar demo',
      'Carregar runtime',
    ]) {
      expect(view.queryByRole('button', { name, exact: true })).toBeNull();
    }
    expect(view.getByText('Artifacts')).toBeTruthy();
    expect(view.getByText('compiled-plan-pending')).toBeTruthy();
    expect(view.getByText('simulation-output-pending')).toBeTruthy();
    expect(view.getByText(/0 llest · 3 pendent revisio/)).toBeTruthy();
  });

  it('translates the main action into all three languages', () => {
    const view = render(<App />);
    for (const [locale, name] of [
      ['es', 'Ejecutar'],
      ['en', 'Run'],
      ['ca', 'Executar'],
    ]) {
      fireEvent.change(view.getByRole('combobox'), {
        target: { value: locale },
      });
      expect(view.getByRole('button', { name, exact: true })).toBeTruthy();
    }
  });

  it('disables execution for an unavailable target', () => {
    const view = render(<App />);
    fireEvent.click(view.getByRole('button', { name: /StackChan/ }));
    expect(
      view.getByRole('button', { name: 'Executar', exact: true })
    ).toHaveProperty('disabled', true);
  });

  it('shows a timeout and retries the full launch with the same button', async () => {
    jest.useFakeTimers();
    const view = render(<App />);
    fireEvent.click(
      view.getByRole('button', { name: 'Executar', exact: true })
    );
    const first = await view.findByTitle(
      'MicroDuck official simulator preview'
    );
    expect(
      view.getByRole('button', { name: 'Carregant', exact: true })
    ).toHaveProperty('disabled', true);
    act(() => jest.advanceTimersByTime(microDuckSimulatorPreviewLoadTimeoutMs));
    expect(
      await view.findByText('Runtime oficial amb error de carrega')
    ).toBeTruthy();
    expect(
      view.getByRole('button', { name: 'Executar', exact: true })
    ).toHaveProperty('disabled', false);
    fireEvent.click(
      view.getByRole('button', { name: 'Executar', exact: true })
    );
    const second = await view.findByTitle(
      'MicroDuck official simulator preview'
    );
    expect(second).not.toBe(first);
    fireEvent.load(second);
    await waitFor(() =>
      expect(view.getByLabelText('Execució del simulador').textContent).toBe('Esperant el simulador')
    );
  });

  it('shows iframe errors without keeping the run button locked', async () => {
    const view = render(<App />);
    fireEvent.click(
      view.getByRole('button', { name: 'Executar', exact: true })
    );
    fireEvent.error(
      await view.findByTitle('MicroDuck official simulator preview')
    );
    expect(
      await view.findByText('Runtime oficial amb error de carrega')
    ).toBeTruthy();
    expect(
      view.getByRole('button', { name: 'Executar', exact: true })
    ).toHaveProperty('disabled', false);
  });
});
