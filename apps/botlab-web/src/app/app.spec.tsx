import { act, fireEvent, render, waitFor } from '@testing-library/react';

import App, {
  microDuckSimulatorPreviewLoadTimeoutMs,
  scheduleMicroDuckSimulatorControlSourceDelivery,
} from './app';

describe('App', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('should schedule repeated MicroDuck simulator control source delivery', () => {
    jest.useFakeTimers();

    const targetWindow = { postMessage: jest.fn() };

    scheduleMicroDuckSimulatorControlSourceDelivery(
      targetWindow,
      {
        artifactId: 'artifact-microduck-led-demo-microduck-sim-smile-plan',
        targetId: 'microduck-sim',
        frames: [
          {
            id: 'frame-led-smile',
            type: 'led-pattern',
            targetId: 'microduck-sim',
            pattern: 'smile',
            brightness: 50,
          },
        ],
        messages: [],
        errors: [],
      },
      'http://127.0.0.1:4300'
    );

    act(() => {
      jest.advanceTimersByTime(15000);
    });

    expect(targetWindow.postMessage).toHaveBeenCalledTimes(5);
    expect(targetWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'botlab.microduck.control-source.v1',
        version: 1,
        simulatorId: 'microduck-official-sim',
        source: expect.objectContaining({
          artifactId: 'artifact-microduck-led-demo-microduck-sim-smile-plan',
          frames: [
            expect.objectContaining({
              type: 'led-pattern',
              pattern: 'smile',
              brightness: 50,
            }),
          ],
        }),
      }),
      'http://127.0.0.1:4300'
    );

    jest.useRealTimers();
  });

  it('should render successfully', () => {
    const { baseElement } = render(<App />);
    expect(baseElement).toBeTruthy();
  });

  it('should show the BotLab project screen', () => {
    const { getByLabelText, getByText } = render(<App />);
    expect(
      getByText(/Laboratori visual per a robots programables/i)
    ).toBeTruthy();
    expect(getByLabelText('Idioma')).toHaveProperty('value', 'ca');
  });

  it('should switch the shell language', () => {
    const { getByLabelText, getByText } = render(<App />);

    fireEvent.change(getByLabelText('Idioma'), { target: { value: 'en' } });

    expect(getByText(/Visual lab for programmable robots/i)).toBeTruthy();
    expect(getByText('Language')).toBeTruthy();
  });

  it('should show the artifact inventory', () => {
    const { getAllByText, getByText } = render(<App />);

    expect(getByText('Artifacts')).toBeTruthy();
    expect(
      getAllByText('sample-scratch-blocks-workspace').length
    ).toBeGreaterThan(0);
    expect(getByText('compiled-plan-pending')).toBeTruthy();
    expect(getByText('simulation-output-pending')).toBeTruthy();
  });

  it('should show official simulator asset readiness', () => {
    const { getByText } = render(<App />);

    expect(getByText('Assets oficials')).toBeTruthy();
    expect(getByText(/0 llest · 3 pendent revisio/i)).toBeTruthy();
  });

  it('should show the MicroDuck simulator host', () => {
    const { getAllByText, getByRole, getByText, getByTitle } = render(<App />);

    expect(getByText('MicroDuck Simulator Host')).toBeTruthy();
    expect(getByText('Runtime oficial llest en mode educatiu')).toBeTruthy();
    expect(getByText('Estat host')).toBeTruthy();
    expect(getByText('Setup assets')).toBeTruthy();
    expect(getAllByText('Revisio').length).toBeGreaterThan(0);
    expect(getByRole('button', { name: 'Carregar runtime' })).toHaveProperty(
      'disabled',
      true
    );
  });

  it('should receive workspace updates from the blocks boundary', () => {
    const { getAllByText, getByRole } = render(<App />);

    expect(getAllByText('Carregat').length).toBeGreaterThan(0);

    fireEvent.click(getByRole('button', { name: 'Marcar editat' }));

    expect(getAllByText('Editat').length).toBeGreaterThan(0);
  });

  it('should show and enforce target selection', async () => {
    const { getAllByText, getByRole } = render(<App />);

    expect(getAllByText('MicroDuck Simulator').length).toBeGreaterThan(0);
    expect(getAllByText('Seleccionat').length).toBeGreaterThan(0);

    fireEvent.click(getByRole('button', { name: /StackChan/i }));

    expect(getAllByText(/Planificat o no compatible/i).length).toBeGreaterThan(
      0
    );
    await waitFor(() => {
      expect(getByRole('button', { name: 'Compilar demo' })).toHaveProperty(
        'disabled',
        true
      );
    });
  });

  it('should run the MicroDuck runtime demo from the UI', async () => {
    const { getAllByText, getByRole, getByText, getByTitle } = render(<App />);

    fireEvent.click(getByRole('button', { name: 'Compilar demo' }));

    await waitFor(() => {
      expect(
        getAllByText(/artifact-microduck-led-demo-microduck-sim-smile-plan/i)
          .length
      ).toBeGreaterThan(0);
    });
    expect(getByText('Requereix confirmacio')).toBeTruthy();
    expect(getAllByText('Confirmacio aplicada').length).toBeGreaterThan(0);
    expect(getByText('confirm-led-output')).toBeTruthy();
    expect(getAllByText('Comanda generada').length).toBeGreaterThan(0);
    expect(getAllByText('set-led-pattern').length).toBeGreaterThan(0);
    expect(getAllByText('somriure').length).toBeGreaterThan(0);
    expect(getAllByText('50').length).toBeGreaterThan(0);

    fireEvent.click(getByRole('button', { name: 'Simular demo' }));

    await waitFor(() => {
      expect(
        getAllByText(/Simulacio completa: 1 comanda/i).length
      ).toBeGreaterThan(0);
    });
    expect(
      getAllByText(/simout-artifact-microduck-led-demo-microduck-sim-smile-plan/i)
        .length
    ).toBeGreaterThan(0);
    expect(getByText('Output artifact')).toBeTruthy();
    expect(getByText(/led-pattern ->/i)).toBeTruthy();
    expect(getByRole('button', { name: 'Carregar runtime' })).toHaveProperty(
      'disabled',
      false
    );

    fireEvent.click(getByRole('button', { name: 'Carregar runtime' }));

    await waitFor(() => {
      expect(getByText('Runtime loader')).toBeTruthy();
    });
    await waitFor(() => {
      expect(
        getByText(
          'BotLab ha carregat 1 frame(s) de control a la source del simulador oficial.'
        )
      ).toBeTruthy();
    });
    expect(
      getAllByText(
        'BotLab ha carregat 1 frame(s) de control a la source del simulador oficial.'
      ).length
    ).toBeGreaterThan(0);
    expect(
      getAllByText(/educational preview loading remains opt-in/i).length
    ).toBeGreaterThan(0);
    expect(
      getByText('Host local oficial')
    ).toBeTruthy();
    const simulatorFrame = getByTitle(
      'MicroDuck official simulator preview'
    ) as HTMLIFrameElement;

    expect(simulatorFrame.getAttribute('src')).toBe(
      'http://127.0.0.1:4300/?boot=1'
    );
    fireEvent.load(simulatorFrame);

    expect(
      getByText(
        'BotLab ha enviat 1 frame(s) de control al host del simulador BotLab-enabled.'
      )
    ).toBeTruthy();
    expect(getByRole('button', { name: 'Desconnectar runtime' })).toBeTruthy();

    fireEvent.click(getByRole('button', { name: 'Desconnectar runtime' }));

    expect(getByText('Runtime oficial desconnectat')).toBeTruthy();
    expect(
      getByText(
        'Runtime oficial desconnectat. Pots tornar a carregar-lo quan vulguis.'
      )
    ).toBeTruthy();
    expect(getByRole('button', { name: 'Carregar runtime' })).toHaveProperty(
      'disabled',
      false
    );

    fireEvent.click(getByRole('button', { name: 'Executar demo' }));

    expect(getAllByText(/Executant/i).length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(getByText(/1 comanda\(es\) enviades/i)).toBeTruthy();
    });
    expect(getAllByText('Completada').length).toBeGreaterThan(0);
    expect(getByText('Execucio demo completada.')).toBeTruthy();
    expect(getAllByText('Comanda generada').length).toBeGreaterThan(0);
    expect(
      getAllByText('Simulated dispatch set-led-pattern.').length
    ).toBeGreaterThan(0);
    expect(getByText('demo-microduck-leds-trace-artifact')).toBeTruthy();
  });

  it('should show a failed host state when the simulator preview times out', async () => {
    const { getAllByText, getByRole, getByText, getByTitle } = render(<App />);

    fireEvent.click(getByRole('button', { name: 'Compilar demo' }));

    await waitFor(() => {
      expect(
        getAllByText(/artifact-microduck-led-demo-microduck-sim-smile-plan/i)
          .length
      ).toBeGreaterThan(0);
    });

    fireEvent.click(getByRole('button', { name: 'Simular demo' }));

    await waitFor(() => {
      expect(
        getAllByText(/Simulacio completa: 1 comanda/i).length
      ).toBeGreaterThan(0);
    });

    jest.useFakeTimers();
    fireEvent.click(getByRole('button', { name: 'Carregar runtime' }));

    await waitFor(() => {
      expect(
        getByText(
          'BotLab ha carregat 1 frame(s) de control a la source del simulador oficial.'
        )
      ).toBeTruthy();
    });

    expect(getByTitle('MicroDuck official simulator preview')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(microDuckSimulatorPreviewLoadTimeoutMs);
    });

    await waitFor(() => {
      expect(getByText('Runtime oficial amb error de carrega')).toBeTruthy();
    });
    expect(
      getByText(
        'El preview local del simulador oficial no ha acabat de carregar dins del temps esperat.'
      )
    ).toBeTruthy();
    expect(getByRole('button', { name: 'Carregar runtime' })).toHaveProperty(
      'disabled',
      false
    );
    jest.useRealTimers();
  });
});
