import { afterEach, describe, expect, it, vi } from 'vitest';
import { runStackChanProgram, validateStackChanProgram } from './program';
import { createStackChanLedPayload } from './factory-protocol';
import type { StackChanBleConnection } from './bluetooth';
import type { StackChanProgramStep } from '@botlab/model';
const yaw = (degrees: number): StackChanProgramStep => ({
  type: 'yaw',
  degrees,
  sourceBlockId: 'head',
});
const led: StackChanProgramStep = {
  type: 'led',
  side: 'left',
  color: '#ff8000',
  brightness: 25,
  sourceBlockId: 'light',
};
const connection = (): StackChanBleConnection => ({
  motionState: { yaw: 0, moves: 0 },
  deviceId: 'chosen',
  deviceName: 'StackChan',
  sendYaw: vi.fn(async () => ({ status: 'dispatched', evidence: 'dispatch' })),
  sendLeds: vi.fn(async () => ({ status: 'dispatched', evidence: 'dispatch' })),
  disconnect: vi.fn(),
});
afterEach(() => vi.useRealTimers());
describe('StackChan bounded programs', () => {
  it('encodes separate RGB sides, capped brightness and explicit off', () => {
    expect(
      JSON.parse(createStackChanLedPayload('left', '#ff8000', 25)),
    ).toEqual({ leftRgbDuration: 0.5, leftRgbColor: '#402000' });
    expect(JSON.parse(createStackChanLedPayload('both', '#ffffff', 0))).toEqual(
      {
        leftRgbDuration: 0.5,
        leftRgbColor: '#000000',
        rightRgbDuration: 0.5,
        rightRgbColor: '#000000',
      },
    );
    for (const value of [-1, 26, NaN, Infinity, 1.5])
      expect(() =>
        createStackChanLedPayload('right', '#ffffff', value),
      ).toThrow();
    expect(() => createStackChanLedPayload('both', 'red', 15)).toThrow();
  });
  it('validates all motion and sequence limits before sending even an earlier LED', async () => {
    const c = connection();
    await expect(
      runStackChanProgram(
        {
          connection: c,
          steps: [led, yaw(20)],
          programId: 'p',
          onBlock: vi.fn(),
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('10°');
    expect(c.sendLeds).not.toHaveBeenCalled();
    expect(c.sendYaw).not.toHaveBeenCalled();
    for (const steps of [
      [yaw(21)],
      [yaw(NaN)],
      Array(41).fill(led),
      Array(10).fill({ type: 'wait', seconds: 10, sourceBlockId: 'w' }),
    ])
      expect(() => validateStackChanProgram(steps)).toThrow();
    expect(() =>
      validateStackChanProgram([yaw(0)], { yaw: 20, moves: 2 }),
    ).toThrow();
    expect(() =>
      validateStackChanProgram(Array(13).fill(yaw(0)), { yaw: 0, moves: 12 }),
    ).not.toThrow();
    expect(() =>
      validateStackChanProgram(
        Array.from({ length: 14 }, (_, i) => yaw(i % 2 ? 0 : 10)),
      ),
    ).not.toThrow();
  });
  it('sends a snapshot in order with mandatory pauses and only dispatch evidence', async () => {
    vi.useFakeTimers();
    const c = connection();
    const onBlock = vi.fn();
    const steps = [yaw(10), led, yaw(0)];
    const result = runStackChanProgram(
      { connection: c, steps, programId: 'p', onBlock },
      new AbortController().signal,
    );
    steps[1] = yaw(200);
    await vi.advanceTimersByTimeAsync(2999);
    expect(c.sendLeds).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(c.sendLeds).toHaveBeenCalledWith('left', '#ff8000', 25);
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.sendYaw).toHaveBeenNthCalledWith(2, 0);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await result).toMatchObject({
      status: 'dispatched',
      evidence: 'dispatch',
    });
    expect(onBlock).toHaveBeenLastCalledWith(undefined);
    expect(c.disconnect).not.toHaveBeenCalled();
  });
  it('cancellation disconnects and prevents the next command', async () => {
    vi.useFakeTimers();
    const c = connection();
    const abort = new AbortController();
    const result = runStackChanProgram(
      {
        connection: c,
        steps: [yaw(10), led],
        programId: 'p',
        onBlock: vi.fn(),
      },
      abort.signal,
    );
    const rejection = expect(result).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(100);
    abort.abort();
    await rejection;
    await vi.runAllTimersAsync();
    expect(c.disconnect).toHaveBeenCalled();
    expect(c.sendLeds).not.toHaveBeenCalled();
  });
  it('automatically rests after movement 12 and continues without disconnecting', async () => {
    vi.useFakeTimers();
    const c = { ...connection(), motionState: { yaw: 0, moves: 11 } };
    const result = runStackChanProgram(
      {
        connection: c,
        steps: [yaw(0), yaw(5)],
        programId: 'rest',
        onBlock: vi.fn(),
      },
      new AbortController().signal,
    );
    await vi.advanceTimersByTimeAsync(10999);
    expect(c.sendYaw).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(c.sendYaw).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toMatchObject({ status: 'dispatched' });
    expect(c.disconnect).not.toHaveBeenCalled();
  });
  it('cancels while waiting for a previous sequence cooldown without sending', async () => {
    vi.useFakeTimers();
    const c = {
      ...connection(),
      motionState: { yaw: 0, moves: 12, waitBeforeMotionMs: 10000 },
    };
    const abort = new AbortController();
    const result = runStackChanProgram(
      {
        connection: c,
        steps: [yaw(5)],
        programId: 'pending',
        onBlock: vi.fn(),
      },
      abort.signal,
    );
    const rejected = expect(result).rejects.toThrow('cancelled');
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.sendYaw).not.toHaveBeenCalled();
    abort.abort();
    await rejected;
    await vi.runAllTimersAsync();
    expect(c.sendYaw).not.toHaveBeenCalled();
    expect(c.disconnect).toHaveBeenCalled();
  });
  it('a failed write never advances to another block', async () => {
    const c = connection();
    vi.mocked(c.sendYaw).mockRejectedValue(new Error('lost'));
    await expect(
      runStackChanProgram(
        {
          connection: c,
          steps: [yaw(10), led],
          programId: 'p',
          onBlock: vi.fn(),
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('lost');
    expect(c.sendLeds).not.toHaveBeenCalled();
    expect(c.disconnect).toHaveBeenCalled();
  });
});
