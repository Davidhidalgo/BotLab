import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { connectStackChanBluetooth } from '@botlab/adapters-stackchan';
import { StackChanPanel } from './stackchan-panel';

vi.mock('@botlab/adapters-stackchan', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@botlab/adapters-stackchan')>()),
  connectStackChanBluetooth: vi.fn(),
}));

describe('StackChan manual trial', () => {
  afterEach(() => {
    vi.resetAllMocks();
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
    const sendYaw = vi.fn(async () => ({
      status: 'dispatched' as const,
      evidence: 'dispatch' as const,
    }));
    const disconnect = vi.fn();
    vi.mocked(connectStackChanBluetooth).mockResolvedValue({
      motionState: { yaw: 0, moves: 0 },
      deviceId: 'selected',
      deviceName: 'My StackChan',
      sendYaw,
      sendLeds: vi.fn(),
      disconnect,
    });
    const view = render(<StackChanPanel locale="es" onBusy={vi.fn()} />);
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
    act(() => vi.mocked(connectStackChanBluetooth).mock.calls[0][2]());
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
    const disconnect = vi.fn();
    const sendYaw = vi.fn();
    vi.mocked(connectStackChanBluetooth).mockResolvedValue({
      motionState: { yaw: 0, moves: 12, waitBeforeMotionMs: 8000 },
      deviceId: 'd',
      deviceName: 'Resting StackChan',
      sendYaw,
      sendLeds: vi.fn(),
      disconnect,
    });
    const view = render(<StackChanPanel locale="es" onBusy={vi.fn()} />);
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
    vi.mocked(connectStackChanBluetooth).mockImplementation(
      () => new Promise(() => undefined),
    );
    const view = render(<StackChanPanel locale="es" onBusy={vi.fn()} />);
    fireEvent.click(view.getByRole('button', { name: 'Conectar Bluetooth' }));
    const signal = vi.mocked(connectStackChanBluetooth).mock.calls[0][1];
    view.unmount();
    expect(signal.aborted).toBe(true);
  });
});
