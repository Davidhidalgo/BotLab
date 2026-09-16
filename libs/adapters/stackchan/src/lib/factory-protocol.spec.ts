import { describe, expect, it } from 'vitest';
import {
  createStackChanExpressionPayload,
  encodeStackChanExpressionFrame,
  encodeStackChanYawFrame,
} from './factory-protocol';

describe('factory 1.5.1 expression protocol', () => {
  it('matches the firmware happy eye preset and relay framing', () => {
    const frame = encodeStackChanExpressionFrame('aAbBcCdDeEfF', 'happy');
    expect(frame[0]).toBe(3);
    expect(new DataView(frame.buffer).getUint32(1, false)).toBe(
      frame.length - 5,
    );
    const wire = new TextDecoder().decode(frame.subarray(5));
    expect(wire.slice(0, 12)).toBe('aAbBcCdDeEfF');
    // The relay removes the MAC prefix before forwarding to the firmware.
    expect(JSON.parse(wire.slice(12))).toEqual({
      leftEye: { weight: 72, rotation: 1550 },
      rightEye: { weight: 72, rotation: -1550 },
    });
  });

  it('returns both eyes to the firmware neutral preset without motion fields', () => {
    expect(JSON.parse(createStackChanExpressionPayload('neutral'))).toEqual({
      leftEye: { weight: 100, rotation: 0 },
      rightEye: { weight: 100, rotation: 0 },
    });
  });

  it.each(['', 'aa:bb:cc:dd:ee:ff', 'aabbccddeeff00', 'zzbbccddeeff'])(
    'rejects invalid device identifier %s',
    (mac) => {
      expect(() => encodeStackChanExpressionFrame(mac, 'happy')).toThrow();
    },
  );

  it('rejects expressions without a verified preset', () => {
    expect(() =>
      createStackChanExpressionPayload('surprised' as 'happy'),
    ).toThrow();
  });
});

describe('factory 1.5.1 yaw trial', () => {
  it.each([-20, -10, 0, 10, 20])(
    'encodes %s degrees as tenths, with no rotation mode or other actuator',
    (degrees) => {
      const frame = encodeStackChanYawFrame('aabbccddeeff', degrees);
      expect(frame[0]).toBe(4);
      expect(new DataView(frame.buffer).getUint32(1, false)).toBe(
        frame.length - 5,
      );
      expect(new TextDecoder().decode(frame.subarray(5, 17))).toBe(
        'aabbccddeeff',
      );
      expect(JSON.parse(new TextDecoder().decode(frame.subarray(17)))).toEqual({
        yawServo: { angle: degrees * 10, speed: 100 },
      });
    },
  );
  it.each([-21, 21, 0.5, NaN, Infinity])(
    'rejects unbounded or invalid trial angle %s',
    (degrees) => {
      expect(() => encodeStackChanYawFrame('aabbccddeeff', degrees)).toThrow();
    },
  );
  it('requires an exact device identifier for motion too', () => {
    expect(() => encodeStackChanYawFrame('', 10)).toThrow();
  });
});
