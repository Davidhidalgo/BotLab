import { createProgramIdentity } from '@botlab/model';
import { createExecutionLifecycle } from './execution';

describe('shared execution lifecycle', () => {
  const program = createProgramIdentity('behavior', 'target', {
    commands: [{ sourceBlockId: 'one', value: 1 }],
  });
  it('rejects different runs, source revisions and targets even with reused display IDs', () => {
    const run = createExecutionLifecycle('run', program);
    for (const update of [
      {
        ...run.snapshot(),
        executionId: 'old',
        status: 'completed' as const,
        evidence: 'simulator' as const,
      },
      {
        ...run.snapshot(),
        program: { ...program, revision: 'other' },
        status: 'running' as const,
      },
      {
        ...run.snapshot(),
        program: { ...program, targetId: 'other' },
        status: 'running' as const,
      },
    ])
      expect(run.update(update)).toBe(false);
    expect(run.snapshot().status).toBe('validated');
  });
  it('distinguishes dispatch acknowledgement from physical completion', () => {
    const run = createExecutionLifecycle('run', program);
    expect(
      run.update({
        ...run.snapshot(),
        status: 'completed',
        evidence: 'dispatch',
      }),
    ).toBe(false);
    expect(run.update({ ...run.snapshot(), status: 'accepted' })).toBe(true);
    expect(run.update({ ...run.snapshot(), status: 'running' })).toBe(true);
    expect(run.update({ ...run.snapshot(), status: 'accepted' })).toBe(false);
    expect(
      run.update({
        ...run.snapshot(),
        status: 'completed',
        evidence: 'simulator',
      }),
    ).toBe(true);
    expect(run.update({ ...run.snapshot(), status: 'running' })).toBe(false);
  });
  it('does not revive cancellation or expose mutable identity', () => {
    const run = createExecutionLifecycle('run', program);
    const copy = run.snapshot();
    if (copy.program) copy.program.revision = 'changed';
    expect(run.snapshot().program).toEqual(program);
    run.update({ ...run.snapshot(), status: 'cancelled' });
    expect(
      run.update({
        ...run.snapshot(),
        status: 'completed',
        evidence: 'simulator',
      }),
    ).toBe(false);
  });
});
