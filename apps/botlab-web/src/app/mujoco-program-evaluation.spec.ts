import { NumericVariables, type CompiledCommand } from '@botlab/model';
import type { SimulationSession } from '@botlab/simulators-core';
import {
  evaluateProgramCommand,
  programCommandNeedsDistance,
} from './mujoco-program-evaluation';
const command = (commandId: string, inputs: CompiledCommand['inputs']) =>
  ({ commandId, inputs }) as CompiledCommand;
const literal = (value: number) => ({ kind: 'literal', value });
function setup() {
  const session = {
    pause: jest.fn().mockResolvedValue({ timeSeconds: 3 }),
    command: jest.fn().mockResolvedValue({
      status: 'completed',
      evidence: 'simulator',
      level: 'physics',
      timeSeconds: 3,
      proximity: { distanceMeters: 0.42 },
    }),
  };
  const variables = new NumericVariables();
  const abort = new AbortController();
  return {
    session,
    variables,
    abort,
    run: (c: CompiledCommand) =>
      evaluateProgramCommand(
        c,
        session as unknown as SimulationSession,
        variables,
        abort.signal,
      ),
  };
}
describe('MuJoCo numeric dispatch', () => {
  it('calculates without physics and only moves after checking bounds', async () => {
    const { run, session, variables } = setup();
    expect(
      await run(
        command('set-number', { name: 'paso', expression: literal(15) }),
      ),
    ).toMatchObject({
      level: 'program-evaluation',
      variableChange: { name: 'paso', value: 15 },
    });
    expect(session.command).not.toHaveBeenCalled();
    await run(
      command('distance-value', {
        speed: 0.24,
        expression: { kind: 'variable', name: 'paso' },
      }),
    );
    expect(session.command).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'distance', distanceMeters: 0.15 }),
      expect.any(AbortSignal),
    );
    session.command.mockClear();
    variables.set('paso', 2001);
    await expect(
      run(
        command('distance-value', {
          speed: 0.24,
          expression: { kind: 'variable', name: 'paso' },
        }),
      ),
    ).rejects.toThrow(/2000/);
    expect(session.command).not.toHaveBeenCalled();
  });
  it('captures one fresh sensor reading for a numeric decision and saves its variables', async () => {
    const { run, session, variables } = setup();
    variables.set('umbral', 50);
    const c = command('condition', {
      condition: {
        sourceBlockId: 'c',
        comparison: 'lt',
        left: { kind: 'distance-cm' },
        right: { kind: 'variable', name: 'umbral' },
      },
    });
    expect(programCommandNeedsDistance(c)).toBe(true);
    expect(await run(c)).toMatchObject({
      decision: { value: true, variables: [['umbral', 50]] },
    });
    expect(session.command).toHaveBeenCalledTimes(1);
  });
  it('does not initialize a change implicitly or mutate after cancellation', async () => {
    const { run, variables, abort, session } = setup();
    await expect(
      run(command('change-number', { name: 'x', expression: literal(1) })),
    ).rejects.toThrow(/Inicializa/);
    session.pause.mockImplementation(async () => {
      abort.abort();
      return { timeSeconds: 3 };
    });
    await expect(
      run(command('set-number', { name: 'x', expression: literal(1) })),
    ).rejects.toThrow();
    expect(variables.snapshot()).toEqual([]);
  });
});
