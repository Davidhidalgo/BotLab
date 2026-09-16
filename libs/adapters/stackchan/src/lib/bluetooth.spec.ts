import { describe, expect, it, vi } from 'vitest';
import {
  connectStackChanBluetooth,
  encodeStackChanBleYaw,
  stackChanBleMotion,
  stackChanBleRgb,
  stackChanBleService,
  type StackChanBleDevice,
} from './bluetooth';

function fixture() {
  const write = vi.fn(async (value: Uint8Array) => {
    void value;
  });
  const characteristic = {
    properties: { write: true },
    writeValueWithResponse: write,
  };
  const service = { getCharacteristic: vi.fn(async () => characteristic) };
  const server = { getPrimaryService: vi.fn(async () => service) };
  const device: StackChanBleDevice = {
    id: 'chosen-device',
    name: 'StackChan',
    gatt: {
      connected: true,
      connect: vi.fn(async () => server),
      disconnect: vi.fn(),
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const bluetooth = { requestDevice: vi.fn(async () => device) };
  return { bluetooth, device, write, service, server };
}

describe('StackChan DANCE Bluetooth', () => {
  it('fragments the yaw JSON with firmware headers and a 20-byte ATT limit', () => {
    const packets = encodeStackChanBleYaw(10);
    const bytes: number[] = [];
    packets.forEach((packet, index) => {
      expect([...packet.slice(0, 4)]).toEqual([0xaa, 0x55, 0xc3, 1]);
      expect(packet.length).toBeLessThanOrEqual(20);
      const header = new DataView(packet.buffer);
      expect(header.getUint16(4, false)).toBe(index);
      expect(header.getUint16(6, false)).toBe(packets.length);
      bytes.push(...packet.slice(10));
    });
    expect(new DataView(packets[0].buffer).getUint16(8, false)).toBe(
      bytes.length,
    );
    expect(JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)))).toEqual(
      { yawServo: { angle: 100, speed: 100 } },
    );
  });
  it('connects to the motion service without sending movement', async () => {
    const f = fixture();
    const connection = await connectStackChanBluetooth(
      f.bluetooth,
      new AbortController().signal,
      vi.fn(),
    );
    expect(f.bluetooth.requestDevice).toHaveBeenCalledWith({
      filters: [{ services: [stackChanBleService] }],
    });
    expect(f.service.getCharacteristic).toHaveBeenCalledWith(
      stackChanBleMotion,
    );
    expect(f.write).not.toHaveBeenCalled();
    expect(await connection.sendYaw(-10)).toEqual({
      status: 'dispatched',
      evidence: 'dispatch',
    });
    expect(f.write.mock.calls.map((call) => call[0])).toEqual(
      encodeStackChanBleYaw(-10),
    );
    connection.disconnect();
  });
  it('disconnects and stops sending fragments after a failed write', async () => {
    const f = fixture();
    f.write.mockRejectedValueOnce(new Error('link lost'));
    const connection = await connectStackChanBluetooth(
      f.bluetooth,
      new AbortController().signal,
      vi.fn(),
    );
    await expect(connection.sendYaw(10)).rejects.toThrow('link lost');
    expect(f.write).toHaveBeenCalledTimes(1);
    expect(f.device.gatt?.disconnect).toHaveBeenCalled();
    await expect(connection.sendYaw(0)).rejects.toThrow();
  });
  it('rejects invalid movement before writing', async () => {
    const f = fixture();
    const connection = await connectStackChanBluetooth(
      f.bluetooth,
      new AbortController().signal,
      vi.fn(),
    );
    await expect(connection.sendYaw(200)).rejects.toThrow();
    expect(f.write).not.toHaveBeenCalled();
    connection.disconnect();
  });
  it('uses the RGB characteristic and rejects rapid or excessive movement without writing', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      const connection = await connectStackChanBluetooth(
        f.bluetooth,
        new AbortController().signal,
        vi.fn(),
      );
      expect(f.service.getCharacteristic).toHaveBeenCalledWith(stackChanBleRgb);
      await connection.sendLeds('right', '#ff0000', 25);
      const bytes = f.write.mock.calls.flatMap(([packet]) => [
        ...packet.slice(10),
      ]);
      expect(
        JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))),
      ).toEqual({ rightRgbDuration: 0.5, rightRgbColor: '#400000' });
      f.write.mockClear();
      await connection.sendYaw(10);
      f.write.mockClear();
      await expect(connection.sendYaw(0)).rejects.toThrow('pause');
      await vi.advanceTimersByTimeAsync(3000);
      await expect(connection.sendYaw(-10)).rejects.toThrow('10 degrees');
      expect(f.write).not.toHaveBeenCalled();
      for (let i = 0; i < 11; i++) {
        await connection.sendYaw(10);
        await vi.advanceTimersByTimeAsync(3000);
      }
      f.write.mockClear();
      await expect(connection.sendYaw(0)).rejects.toThrow('pause');
      expect(f.write).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(
        connection.motionState.waitBeforeMotionMs ?? 0,
      );
      await connection.sendYaw(0);
      expect(connection.motionState.moves).toBe(13);
      expect(f.device.gatt?.disconnect).not.toHaveBeenCalled();
      connection.disconnect();
    } finally {
      vi.useRealTimers();
    }
  });
  it('does not connect after the device picker resolves for a cancelled request', async () => {
    const f = fixture();
    const controller = new AbortController();
    f.bluetooth.requestDevice.mockImplementation(async () => {
      controller.abort();
      return f.device;
    });
    await expect(
      connectStackChanBluetooth(f.bluetooth, controller.signal, vi.fn()),
    ).rejects.toThrow();
    expect(f.device.gatt?.connect).not.toHaveBeenCalled();
    expect(f.write).not.toHaveBeenCalled();
  });
});
