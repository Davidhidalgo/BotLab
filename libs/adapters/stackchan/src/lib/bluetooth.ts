import { motionPauseMs } from './motion-timing';
import type { StackChanLedSide } from '@botlab/model';
import {
  createStackChanYawPayload,
  createStackChanLedPayload,
} from './factory-protocol';

export const stackChanBleService = 'e2e5e5e0-1234-5678-1234-56789abcdef0';
export const stackChanBleRgb = 'e2e5e5e4-1234-5678-1234-56789abcdef0';
export const stackChanBleMotion = 'e2e5e5e1-1234-5678-1234-56789abcdef0';

// Minimal structural Web Bluetooth interfaces keep this adapter independent of browser globals.
export interface StackChanBleCharacteristic {
  properties: { write: boolean };
  writeValueWithResponse(value: Uint8Array): Promise<void>;
}
export interface StackChanBleDevice {
  id: string;
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<{
      getPrimaryService(uuid: string): Promise<{
        getCharacteristic(uuid: string): Promise<StackChanBleCharacteristic>;
      }>;
    }>;
    disconnect(): void;
  };
  addEventListener(type: 'gattserverdisconnected', listener: () => void): void;
  removeEventListener(
    type: 'gattserverdisconnected',
    listener: () => void,
  ): void;
}
export interface StackChanBluetooth {
  requestDevice(options: {
    filters: { services: string[] }[];
  }): Promise<StackChanBleDevice>;
}

/** Firmware fragmentation, using the minimum 20-byte ATT payload. No WS header/MAC. */
export function encodeStackChanBleYaw(degrees: number): Uint8Array[] {
  return fragmentStackChanPayload(createStackChanYawPayload(degrees));
}

function fragmentStackChanPayload(json: string): Uint8Array[] {
  const payload = new TextEncoder().encode(json);
  const count = Math.ceil(payload.length / 10);
  return Array.from({ length: count }, (_, index) => {
    const part = payload.slice(index * 10, (index + 1) * 10);
    const packet = new Uint8Array(10 + part.length);
    packet.set([0xaa, 0x55, 0xc3, 1]);
    const header = new DataView(packet.buffer);
    header.setUint16(4, index, false);
    header.setUint16(6, count, false);
    header.setUint16(8, payload.length, false);
    packet.set(part, 10);
    return packet;
  });
}

export interface StackChanBleConnection {
  readonly motionState: {
    yaw: number;
    moves: number;
    waitBeforeMotionMs?: number;
  };
  deviceId: string;
  deviceName: string;
  sendYaw(
    degrees: number,
  ): Promise<{ status: 'dispatched'; evidence: 'dispatch' }>;
  sendLeds(
    side: StackChanLedSide,
    color: string,
    brightness: number,
  ): Promise<{ status: 'dispatched'; evidence: 'dispatch' }>;
  disconnect(): void;
}

/** Call directly from a click: the browser picker requires a user gesture. */
export async function connectStackChanBluetooth(
  bluetooth: StackChanBluetooth,
  signal: AbortSignal,
  onDisconnect: () => void,
): Promise<StackChanBleConnection> {
  signal.throwIfAborted();
  const device = await bluetooth.requestDevice({
    filters: [{ services: [stackChanBleService] }],
  });
  let closed = false;
  let sending = false;
  const lost = () => {
    if (closed) return;
    closed = true;
    device.removeEventListener('gattserverdisconnected', lost);
    signal.removeEventListener('abort', disconnect);
    onDisconnect();
  };
  const disconnect = () => {
    if (closed) return;
    lost();
    device.gatt?.disconnect();
  };
  if (signal.aborted) {
    device.gatt?.disconnect();
    signal.throwIfAborted();
  }
  signal.addEventListener('abort', disconnect, { once: true });
  device.addEventListener('gattserverdisconnected', lost);
  const ensureConnected = () => {
    signal.throwIfAborted();
    if (closed || !device.gatt?.connected)
      throw new Error('StackChan Bluetooth disconnected');
  };
  async function bounded<T>(operation: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            disconnect();
            reject(new Error('StackChan Bluetooth timeout'));
          }, 10000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  try {
    if (!device.gatt) throw new Error('Bluetooth GATT unavailable');
    // Disconnect again if an in-flight connect resolves after cancellation/timeout.
    const server = await bounded(
      device.gatt.connect().then((server) => {
        if (closed || signal.aborted) {
          device.gatt?.disconnect();
          throw new Error('Connection cancelled');
        }
        return server;
      }),
    );
    ensureConnected();
    const service = await bounded(
      server.getPrimaryService(stackChanBleService),
    );
    ensureConnected();
    const motion = await bounded(service.getCharacteristic(stackChanBleMotion));
    ensureConnected();
    if (!motion.properties.write)
      throw new Error('StackChan motion characteristic is not writable');
    const rgb = await bounded(service.getCharacteristic(stackChanBleRgb));
    ensureConnected();
    if (!rgb.properties.write)
      throw new Error('StackChan RGB characteristic is not writable');
    let nextMotionAt = -Infinity;
    let lastLedAt = -Infinity;
    let lastYaw = 0;
    let motionCount = 0;
    async function sendPackets(
      characteristic: StackChanBleCharacteristic,
      packets: Uint8Array[],
    ) {
      ensureConnected();
      if (sending) throw new Error('A StackChan command is already pending');
      sending = true;
      try {
        for (const packet of packets) {
          ensureConnected();
          await bounded(characteristic.writeValueWithResponse(packet));
        }
        ensureConnected();
        return { status: 'dispatched' as const, evidence: 'dispatch' as const };
      } catch (error) {
        disconnect();
        throw error;
      } finally {
        sending = false;
      }
    }
    return {
      get motionState() {
        return {
          yaw: lastYaw,
          moves: motionCount,
          waitBeforeMotionMs: Math.max(0, nextMotionAt - Date.now()),
        };
      },
      deviceId: device.id,
      deviceName: device.name ?? 'StackChan',
      disconnect,
      async sendYaw(degrees) {
        const packets = encodeStackChanBleYaw(degrees);
        ensureConnected();
        if (sending || Date.now() < nextMotionAt)
          throw new Error('Servo pause pending; wait before the next movement');
        if (Math.abs(degrees - lastYaw) > 10)
          throw new Error(
            'Use changes of at most 10 degrees; return through the center',
          );
        const pauseMs = motionPauseMs(lastYaw, degrees, motionCount + 1);
        lastYaw = degrees;
        motionCount++;
        const result = await sendPackets(motion, packets);
        nextMotionAt = Date.now() + pauseMs;
        return result;
      },
      async sendLeds(side, color, brightness) {
        const packets = fragmentStackChanPayload(
          createStackChanLedPayload(side, color, brightness),
        );
        ensureConnected();
        if (sending || Date.now() - lastLedAt < 1000)
          throw new Error('Wait at least 1 second between LED commands');
        lastLedAt = Date.now();
        const result = await sendPackets(rgb, packets);
        lastLedAt = Date.now();
        return result;
      },
    };
  } catch (error) {
    disconnect();
    throw error;
  }
}
