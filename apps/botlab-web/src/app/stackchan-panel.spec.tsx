import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { connectStackChanBluetooth } from '@botlab/adapters-stackchan';
import { StackChanPanel } from './stackchan-panel';

jest.mock('@botlab/adapters-stackchan', () => ({
  ...jest.requireActual('@botlab/adapters-stackchan'),
  connectStackChanBluetooth: jest.fn(),
}));

describe('StackChan manual trial', () => {
  afterEach(() => {
    jest.resetAllMocks();
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: undefined,
    });
  });
  it('requires an explicit connection and pose check before sending one angle', async () => {
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {},
    });
    const sendYaw = jest.fn(async () => ({
      status: 'dispatched' as const,
      evidence: 'dispatch' as const,
    }));
    const disconnect = jest.fn();
    jest.mocked(connectStackChanBluetooth).mockResolvedValue({
      motionState: { yaw: 0, moves: 0 },
      deviceId: 'selected',
      deviceName: 'My StackChan',
      sendYaw,
      sendLeds: jest.fn(),
      disconnect,
    });
    const view = render(<StackChanPanel locale="es" onBusy={jest.fn()} />);
    expect(connectStackChanBluetooth).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole('button', { name: 'Conectar Bluetooth' }));
    await waitFor(() => expect(view.getByText(/My StackChan/)).toBeTruthy());
    expect(sendYaw).not.toHaveBeenCalled();
    expect(view.getByRole('button', { name: 'Ir a 10°' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.click(view.getByRole('checkbox'));
    fireEvent.click(view.getByRole('button', { name: 'Ir a 10°' }));
    await waitFor(() => expect(view.getByText(/Orden enviada/)).toBeTruthy());
    expect(sendYaw).toHaveBeenCalledTimes(1);
    expect(sendYaw).toHaveBeenCalledWith(10);
    act(() => jest.mocked(connectStackChanBluetooth).mock.calls[0][2]());
    expect(view.getByRole('button', { name: 'Ir a 0°' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(view.getByRole('checkbox')).toHaveProperty('checked', false);
  });
  it('keeps the connection when a manual movement is requested during rest', async () => {
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {},
    });
    const disconnect = jest.fn();
    const sendYaw = jest.fn();
    jest.mocked(connectStackChanBluetooth).mockResolvedValue({
      motionState: { yaw: 0, moves: 12, waitBeforeMotionMs: 8000 },
      deviceId: 'd',
      deviceName: 'Resting StackChan',
      sendYaw,
      sendLeds: jest.fn(),
      disconnect,
    });
    const view = render(<StackChanPanel locale="es" onBusy={jest.fn()} />);
    fireEvent.click(view.getByRole('button', { name: 'Conectar Bluetooth' }));
    await waitFor(() =>
      expect(view.getByText(/Resting StackChan/)).toBeTruthy(),
    );
    fireEvent.click(view.getByRole('checkbox'));
    fireEvent.click(view.getByRole('button', { name: 'Ir a 10°' }));
    expect(view.getByRole('alert').textContent).toContain('8 s');
    expect(sendYaw).not.toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();
  });
  it('cancels a pending connection when the panel is removed', () => {
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {},
    });
    jest
      .mocked(connectStackChanBluetooth)
      .mockImplementation(() => new Promise(() => undefined));
    const view = render(<StackChanPanel locale="es" onBusy={jest.fn()} />);
    fireEvent.click(view.getByRole('button', { name: 'Conectar Bluetooth' }));
    const signal = jest.mocked(connectStackChanBluetooth).mock.calls[0][1];
    view.unmount();
    expect(signal.aborted).toBe(true);
  });
});
