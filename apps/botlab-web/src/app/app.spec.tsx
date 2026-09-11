import { fireEvent, render, waitFor } from '@testing-library/react';

import App from './app';

describe('App', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<App />);
    expect(baseElement).toBeTruthy();
  });

  it('should show the BotLab project screen', () => {
    const { getByText } = render(<App />);
    expect(getByText(/Laboratorio visual para robots programables/i)).toBeTruthy();
  });

  it('should receive workspace updates from the blocks boundary', () => {
    const { getAllByText, getByRole } = render(<App />);

    expect(getAllByText('Cargado').length).toBeGreaterThan(0);

    fireEvent.click(getByRole('button', { name: 'Editar' }));

    expect(getAllByText('Editado').length).toBeGreaterThan(0);
  });

  it('should show and enforce target selection', async () => {
    const { getAllByText, getByRole } = render(<App />);

    expect(getAllByText('MicroDuck Simulator').length).toBeGreaterThan(0);
    expect(getAllByText('Seleccionado').length).toBeGreaterThan(0);

    fireEvent.click(getByRole('button', { name: /StackChan/i }));

    expect(getAllByText(/Planificado o no compatible/i).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(getByRole('button', { name: 'Compilar demo' })).toHaveProperty(
        'disabled',
        true,
      );
    });
  });

  it('should run the MicroDuck runtime demo from the UI', async () => {
    const { getAllByText, getByRole, getByText } = render(<App />);

    fireEvent.click(getByRole('button', { name: 'Compilar demo' }));

    await waitFor(() => {
      expect(getAllByText(/artifact-microduck-leds-plan/i).length).toBeGreaterThan(0);
    });

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
  });
});
