import { fireEvent, render, waitFor } from '@testing-library/react';

import App from './app';

describe('App', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<App />);
    expect(baseElement).toBeTruthy();
  });

  it('should show the BotLab project screen', () => {
    const { getByText } = render(<App />);
    expect(
      getByText(/Laboratorio visual para robots programables/i)
    ).toBeTruthy();
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

  it('should receive workspace updates from the blocks boundary', () => {
    const { getAllByText, getByRole } = render(<App />);

    expect(getAllByText('Cargado').length).toBeGreaterThan(0);

    fireEvent.click(getByRole('button', { name: 'Marcar editado' }));

    expect(getAllByText('Editado').length).toBeGreaterThan(0);
  });

  it('should show and enforce target selection', async () => {
    const { getAllByText, getByRole } = render(<App />);

    expect(getAllByText('MicroDuck Simulator').length).toBeGreaterThan(0);
    expect(getAllByText('Seleccionado').length).toBeGreaterThan(0);

    fireEvent.click(getByRole('button', { name: /StackChan/i }));

    expect(getAllByText(/Planificado o no compatible/i).length).toBeGreaterThan(
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
    const { getAllByText, getByRole, getByText } = render(<App />);

    fireEvent.click(getByRole('button', { name: 'Compilar demo' }));

    await waitFor(() => {
      expect(
        getAllByText(/artifact-microduck-led-demo-microduck-sim-smile-plan/i)
          .length
      ).toBeGreaterThan(0);
    });
    expect(getByText('Requiere confirmacion')).toBeTruthy();
    expect(getByText('Confirmacion aplicada')).toBeTruthy();
    expect(getByText('confirm-led-output')).toBeTruthy();

    fireEvent.click(getByRole('button', { name: 'Simular demo' }));

    await waitFor(() => {
      expect(getByText(/Simulacion completa: 1 comando/i)).toBeTruthy();
    });

    fireEvent.click(getByRole('button', { name: 'Ejecutar demo' }));

    expect(getAllByText(/Ejecutando/i).length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(getByText(/1 comando\(s\) enviados/i)).toBeTruthy();
    });
    expect(getAllByText('Completada').length).toBeGreaterThan(0);
    expect(getByText('Ejecucion demo completada.')).toBeTruthy();
    expect(getByText('Comando enviado')).toBeTruthy();
    expect(
      getAllByText('Simulated dispatch set-led-pattern.').length
    ).toBeGreaterThan(0);
    expect(getByText('demo-microduck-leds-trace-artifact')).toBeTruthy();
  });
});
