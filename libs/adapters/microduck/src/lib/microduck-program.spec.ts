import { compileMicroDuckProgram } from './microduck-program';
import { nativeMicroDuckCapabilities } from './microduck-capabilities';

describe('native posture capability and lowering', () => {
  it('does not expose posture when only a configured or unrelated skill exists', () => {
    expect(nativeMicroDuckCapabilities(undefined, 'native')).toEqual([]);
    expect(
      nativeMicroDuckCapabilities(
        { skills: ['kick_left'], postures: ['sit', 'stand'] },
        'native',
      ),
    ).toEqual([]);
    expect(
      nativeMicroDuckCapabilities(
        { skills: ['sit_toggle'], postures: [] },
        'native',
      ),
    ).toEqual([]);
  });
  it('binds discovered posture commands to the connected target only', () => {
    const capabilities = nativeMicroDuckCapabilities(
      { skills: ['sit_toggle'], postures: ['sit', 'stand'] },
      'native',
    );
    expect(capabilities[0].targetIds).toEqual(['native']);
    expect(capabilities[0].schema?.commands[0]).toMatchObject({
      id: 'set-posture',
      inputs: [{ enumValues: ['sit', 'stand'] }],
    });
  });
  it('lowers explicit posture actions without converting them to toggles', () => {
    const plan = compileMicroDuckProgram(
      { behaviorId: 'posture' },
      [
        { type: 'posture', posture: 'stand', sourceBlockId: 'a' },
        { type: 'posture', posture: 'stand', sourceBlockId: 'b' },
        { type: 'posture', posture: 'sit', sourceBlockId: 'c' },
      ],
      'native',
    );
    expect(
      plan.commands
        .slice(0, 3)
        .map((c) => [c.commandId, c.inputs['posture'], c.sourceBlockId]),
    ).toEqual([
      ['set-posture', 'stand', 'a'],
      ['set-posture', 'stand', 'b'],
      ['set-posture', 'sit', 'c'],
    ]);
  });
});

it('lowers branches with globally distinct command IDs and one final stop', () => {
  const compiled = compileMicroDuckProgram(
    { behaviorId: 'if' },
    [
      {
        type: 'if',
        sourceBlockId: 'if',
        condition: {
          type: 'posture',
          posture: 'sit',
          sourceBlockId: 'predicate',
        },
        then: [{ type: 'posture', posture: 'stand' }],
        else: [{ type: 'posture', posture: 'sit' }],
      },
    ],
    'native',
  );
  expect(compiled.commands).toHaveLength(2);
  expect(compiled.commands[0]).toMatchObject({
    commandId: 'if-posture',
    sourceBlockId: 'if',
    inputs: {
      condition: { posture: 'sit', sourceBlockId: 'predicate' },
      then: [
        {
          id: 'command-microduck-posture-0-then-0',
          commandId: 'set-posture',
          targetId: 'native',
        },
      ],
      else: [
        { id: 'command-microduck-posture-0-else-0', commandId: 'set-posture' },
      ],
    },
  });
  expect(compiled.commands[1].id).toBe('command-microduck-stop');
});

describe('bounded repeat lowering', () => {
  const compile = (program: Parameters<typeof compileMicroDuckProgram>[1]) =>
    compileMicroDuckProgram({ behaviorId: 'repeat' }, program, 'sim');
  it('expands nested repeats with unique command IDs and a complete iteration path', () => {
    const plan = compile([
      {
        type: 'repeat',
        sourceBlockId: 'outer',
        count: 2,
        body: [
          {
            type: 'repeat',
            sourceBlockId: 'inner',
            count: 2,
            body: [
              { type: 'posture', posture: 'sit', sourceBlockId: 'action' },
            ],
          },
        ],
      },
    ]);
    const actions = plan.commands.filter((c) => c.commandId === 'set-posture');
    expect(actions).toHaveLength(4);
    expect(actions.map((c) => c.iterations?.map((i) => i.iteration))).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2],
    ]);
    expect(actions.every((c) => c.sourceBlockId === 'action')).toBe(true);
    expect(new Set(plan.commands.map((c) => c.id)).size).toBe(
      plan.commands.length,
    );
    expect(plan.commands.at(-1)?.id).toBe('command-microduck-stop');
    expect(plan.commands.at(-1)?.iterations).toBeUndefined();
  });
  it('keeps each conditional dynamic on every iteration and preserves both branches', () => {
    const plan = compile([
      {
        type: 'repeat',
        count: 2,
        body: [
          {
            type: 'if',
            condition: { type: 'posture', posture: 'sit' },
            then: [{ type: 'posture', posture: 'stand' }],
            else: [{ type: 'posture', posture: 'sit' }],
          },
        ],
      },
    ]);
    const conditions = plan.commands.filter(
      (c) => c.commandId === 'if-posture',
    );
    expect(conditions.map((c) => c.iterations?.[0].iteration)).toEqual([1, 2]);
    expect(conditions[1].inputs['then']).toMatchObject([
      {
        commandId: 'set-posture',
        inputs: { posture: 'stand' },
        iterations: [{ iteration: 2 }],
      },
    ]);
  });
  it('skips zero repeats and retains cancellable checkpoints for empty bodies', () => {
    expect(
      compile([
        {
          type: 'repeat',
          count: 0,
          body: [{ type: 'posture', posture: 'sit' }],
        },
      ]).commands.map((c) => c.id),
    ).toEqual(['command-microduck-stop']);
    expect(
      compile([{ type: 'repeat', count: 100, body: [] }]).commands,
    ).toHaveLength(101);
  });
  it.each([-1, 1.5, 101, NaN, Infinity])(
    'rejects invalid counts even inside a zero repeat: %s',
    (count) => {
      expect(() =>
        compile([
          {
            type: 'repeat',
            count: 0,
            body: [{ type: 'repeat', count, body: [] }],
          },
        ]),
      ).toThrow('whole number');
    },
  );
  it('rejects expansion overflow without allocating an unbounded command tree', () => {
    expect(() =>
      compile([
        {
          type: 'repeat',
          count: 100,
          body: [{ type: 'repeat', count: 100, body: [] }],
        },
      ]),
    ).toThrow('256 expanded steps');
  });
  it('rejects excessive nesting before lowering', () => {
    let body: Parameters<typeof compileMicroDuckProgram>[1] = [];
    for (let i = 0; i < 18; i++)
      body = [{ type: 'repeat', count: 0, body: [...body] }];
    expect(() => compile(body)).toThrow('16 nested');
  });
});
