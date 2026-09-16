/** Factory firmware 1.5.1 protocol; source revision recorded in docs/stackchan-1.5.1.md. */
import type { StackChanLedSide } from '@botlab/model';
export type StackChanTrialExpression = 'happy' | 'neutral';

export function createStackChanLedPayload(
  side: StackChanLedSide,
  color: string,
  brightness: number,
): string {
  if (
    !['both', 'left', 'right'].includes(side) ||
    !/^#[0-9a-fA-F]{6}$/.test(color) ||
    !Number.isInteger(brightness) ||
    brightness < 0 ||
    brightness > 25
  ) {
    throw new Error(
      'LED requires a valid side, #RRGGBB color and brightness 0–25%',
    );
  }
  const dimmed =
    '#' +
    [1, 3, 5]
      .map((index) =>
        Math.round(
          (parseInt(color.slice(index, index + 2), 16) * brightness) / 100,
        )
          .toString(16)
          .padStart(2, '0'),
      )
      .join('');
  return JSON.stringify({
    ...(side !== 'right' ? { leftRgbDuration: 0.5, leftRgbColor: dimmed } : {}),
    ...(side !== 'left'
      ? { rightRgbDuration: 0.5, rightRgbColor: dimmed }
      : {}),
  });
}

/** JSON consumed by updateAvatarFromJson. This changes only the eyes. */
export function createStackChanExpressionPayload(
  expression: StackChanTrialExpression,
): string {
  if (expression !== 'happy' && expression !== 'neutral') {
    throw new Error('Unsupported StackChan trial expression');
  }
  const weight = expression === 'happy' ? 72 : 100;
  // Firmware rotations are tenths of a degree.
  const rotation = expression === 'happy' ? 1550 : 0;
  return JSON.stringify({
    leftEye: { weight, rotation },
    rightEye: { weight, rotation: rotation === 0 ? 0 : -rotation },
  });
}

/** App-to-relay frame, including the relay's 12-byte target MAC prefix.
 * Encoding does not connect, authenticate, send, or prove physical completion.
 */
export function encodeStackChanExpressionFrame(
  targetMac: string,
  expression: StackChanTrialExpression,
): Uint8Array {
  return encodeRelayFrame(
    targetMac,
    0x03,
    createStackChanExpressionPayload(expression),
  );
}

/** First servo trial: absolute yaw within +/-20 degrees, speed 100/1000.
 * Requires verified starting pose before sending; zero is the calibrated origin,
 * not the current position. This encoder does not send or schedule a return.
 */
export function encodeStackChanYawFrame(
  targetMac: string,
  degrees: number,
): Uint8Array {
  return encodeRelayFrame(targetMac, 0x04, createStackChanYawPayload(degrees));
}

export function createStackChanYawPayload(degrees: number): string {
  if (!Number.isInteger(degrees) || degrees < -20 || degrees > 20) {
    throw new Error('Trial yaw must be an integer from -20 to 20 degrees');
  }
  return JSON.stringify({
    yawServo: { angle: degrees * 10, speed: 100 },
  });
}

function encodeRelayFrame(
  targetMac: string,
  type: 0x03 | 0x04,
  json: string,
): Uint8Array {
  // Preserve case: the relay uses the identifier as an exact lookup key.
  if (!/^[0-9a-fA-F]{12}$/.test(targetMac)) {
    throw new Error(
      'Expected the exact 12-hex-character device identifier from StackChan World',
    );
  }
  const payload = new TextEncoder().encode(targetMac + json);
  const frame = new Uint8Array(5 + payload.length);
  frame[0] = type;
  new DataView(frame.buffer).setUint32(1, payload.length, false);
  frame.set(payload, 5);
  return frame;
}
