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

  it('should run the MicroDuck runtime demo from the UI', async () => {
    const { getAllByText, getByRole, getByText } = render(<App />);

    fireEvent.click(getByRole('button', { name: 'Ejecutar demo' }));

    expect(getAllByText(/Ejecutando/i).length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(getByText(/1 comando\(s\) enviados/i)).toBeTruthy();
    });
    expect(getByText('Completada')).toBeTruthy();
  });
});
