import { describe, it, expect, vi } from 'vitest';
import { createMujocoSession } from './client';
import type { WorkerRequest, WorkerResponse } from './protocol';

function fixture() {
  const requests: WorkerRequest[] = [];
  const worker = {
    postMessage: vi.fn<(r: WorkerRequest) => void>((r: WorkerRequest) =>
      requests.push(r),
    ),
    terminate: vi.fn<() => void>(),
    onmessage: null as ((e: MessageEvent<WorkerResponse>) => void) | null,
    onerror: null,
    onmessageerror: null,
  };
  const session = createMujocoSession(() => worker as unknown as Worker);
  const reply = (r: WorkerRequest, values: Partial<WorkerResponse>) =>
    worker.onmessage?.({
      data: {
        id: r.id,
        sessionId: r.sessionId,
        generation: r.generation,
        ...values,
      },
    } as MessageEvent<WorkerResponse>);
  const frame = (r: WorkerRequest) => ({
    sessionId: r.sessionId,
    generation: r.generation,
    state: 'paused' as const,
    tick: 0,
    timeSeconds: 0,
    positions: [],
    velocities: [],
    efforts: [],
    targets: [],
    geomPositions: [],
    geomRotations: [],
    rootPosition: [],
    rootQuaternion: [],
  });
  return { session, worker, requests, reply, frame };
}
describe('worker session ownership', () => {
  it('keeps cancellation pending until the stop acknowledgement', async () => {
    const f = fixture(),
      abort = new AbortController();
    let settled = false;
    const promise = f.session
      .command(
        {
          joint: 'hip',
          positionRadians: 0.2,
          toleranceRadians: 0.02,
          timeoutSeconds: 2,
        },
        abort.signal,
      )
      .catch((e) => {
        settled = true;
        return e;
      });
    abort.abort();
    expect(f.requests.map((r) => r.operation)).toEqual(['command', 'stop']);
    f.reply(f.requests[0], { error: 'cancelled' });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    f.reply(f.requests[1], { frame: f.frame(f.requests[1]) });
    expect(await promise).toBeInstanceOf(Error);
    expect(settled).toBe(true);
    f.session.dispose();
  });
  it('discards old generations and foreign session frames after reset', async () => {
    const f = fixture(),
      listener = vi.fn<(frame: unknown) => void>();
    f.session.subscribe(listener);
    const step = f.session.step().catch((e) => e);
    const reset = f.session.reset();
    const old = f.requests[0],
      fresh = f.requests[1];
    f.reply(old, { frame: f.frame(old) });
    expect(listener).not.toHaveBeenCalled();
    f.reply({ ...fresh, sessionId: 'foreign' }, { frame: f.frame(fresh) });
    expect(listener).not.toHaveBeenCalled();
    f.reply(fresh, { frame: f.frame(fresh) });
    await reset;
    expect(await step).toBeInstanceOf(Error);
    expect(listener).toHaveBeenCalledTimes(1);
    f.session.dispose();
  });
  it('terminates a timed-out worker before releasing outstanding work', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const p = f.session.step().catch((e) => e);
    await vi.advanceTimersByTimeAsync(15000);
    expect(await p).toBeInstanceOf(Error);
    expect(f.worker.terminate).toHaveBeenCalledOnce();
    f.session.dispose();
    expect(f.worker.terminate).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
