import { motionPauseMs } from './motion-timing';
import { createProgramIdentity, type ExecutionResult } from '@botlab/model';
import type { StackChanProgramStep } from './stackchan-steps';
import type { StackChanBleConnection } from './bluetooth';
import {
  createStackChanLedPayload,
  createStackChanYawPayload,
} from './factory-protocol';

export function validateStackChanProgram(
  steps: readonly StackChanProgramStep[],
  session = { yaw: 0, moves: 0 },
): void {
  if (!Array.isArray(steps) || steps.length > 40)
    throw new Error('StackChan: maximum 40 expanded commands');
  let yaw = session.yaw,
    moves = session.moves,
    seconds = 0;
  for (const step of steps) {
    if (!step || typeof step.sourceBlockId !== 'string' || !step.sourceBlockId)
      throw new Error('Missing source block');
    switch (step.type) {
      case 'yaw':
        createStackChanYawPayload(step.degrees);
        if (Math.abs(step.degrees - yaw) > 10)
          throw new Error(
            'Servo changes must be at most 10°; use intermediate positions',
          );
        moves++;
        seconds += motionPauseMs(yaw, step.degrees, moves) / 1000;
        yaw = step.degrees;
        break;
      case 'led':
        createStackChanLedPayload(step.side, step.color, step.brightness);
        seconds += 1;
        break;
      case 'wait':
        if (
          !Number.isFinite(step.seconds) ||
          step.seconds < 0 ||
          step.seconds > 10
        )
          throw new Error('Wait must be 0–10 seconds');
        seconds += step.seconds;
        break;
      default:
        throw new Error('Unsupported StackChan command');
    }
  }
  if (seconds > 90)
    throw new Error(
      'Program limit: 90 seconds including motion pauses and periodic rests',
    );
}

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) throw new Error('Sequence cancelled');
    const aborted = () => {
      clearTimeout(timer);
      reject(new Error('Sequence cancelled'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', aborted);
      resolve();
    }, ms);
    signal.addEventListener('abort', aborted, { once: true });
  });
}

export async function runStackChanProgram(
  input: {
    connection: StackChanBleConnection;
    steps: readonly StackChanProgramStep[];
    programId: string;
    onBlock: (id?: string) => void;
  },
  signal: AbortSignal,
): Promise<ExecutionResult> {
  const steps: StackChanProgramStep[] = JSON.parse(JSON.stringify(input.steps));
  validateStackChanProgram(steps, input.connection.motionState); // Entire plan checked before the first write.
  if (signal.aborted) throw new Error('Sequence cancelled');
  const program = createProgramIdentity(input.programId, 'stackchan-planned', {
    deviceId: input.connection.deviceId,
    steps,
  });
  const executionId = `stackchan-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
  const disconnect = () => input.connection.disconnect();
  signal.addEventListener('abort', disconnect, { once: true });
  let dispatched = false;
  let yaw = input.connection.motionState.yaw;
  let moves = input.connection.motionState.moves;
  try {
    for (const step of steps) {
      if (signal.aborted) throw new Error('Sequence cancelled');
      input.onBlock(step.sourceBlockId);
      if (step.type === 'yaw') {
        const remaining = input.connection.motionState.waitBeforeMotionMs ?? 0;
        if (remaining > 0) await pause(remaining, signal);
        if (signal.aborted) throw new Error('Sequence cancelled');
        await input.connection.sendYaw(step.degrees);
        dispatched = true;
        await pause(motionPauseMs(yaw, step.degrees, ++moves), signal);
        yaw = step.degrees;
      } else if (step.type === 'led') {
        await input.connection.sendLeds(step.side, step.color, step.brightness);
        dispatched = true;
        await pause(1000, signal);
      } else await pause(step.seconds * 1000, signal);
    }
    if (signal.aborted) throw new Error('Sequence cancelled');
    return {
      executionId,
      program,
      status: dispatched ? 'dispatched' : 'no-work',
      evidence: dispatched ? 'dispatch' : 'none',
    };
  } catch (error) {
    disconnect();
    throw error;
  } finally {
    signal.removeEventListener('abort', disconnect);
    input.onBlock(undefined);
  }
}
