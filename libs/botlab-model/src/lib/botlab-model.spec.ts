import {
  botLabConcepts,
  sampleArbitrationStrategies,
  sampleMicroDuckCompiledBehaviorArtifact,
  sampleMicroDuckLedBehavior,
  sampleMicroDuckLedBehaviorArtifact,
  sampleSchedulers,
  sampleSkills,
  sampleStackChanExpressionBehavior,
  validateAdapterManifest,
  validateBehaviorDefinition,
  validateCapabilitySchema,
  validateCompiledBehaviorArtifact,
  validatePolicy,
  type BotLabAdapter,
  type Capability,
} from './botlab-model';

describe('botlabModel', () => {
  it('models the main BotLab concepts', () => {
    expect(botLabConcepts.map((entry) => entry.concept)).toContain('behavior');
  });

  it('can represent a MicroDuck LED behavior and compiled plan', () => {
    const result = validateBehaviorDefinition(sampleMicroDuckLedBehavior, {
      skills: sampleSkills,
      schedulers: sampleSchedulers,
      arbitrationStrategies: sampleArbitrationStrategies,
      artifacts: [
        sampleMicroDuckLedBehaviorArtifact,
        sampleMicroDuckCompiledBehaviorArtifact,
      ],
    });

    expect(result).toEqual({ valid: true, errors: [] });
    expect(sampleMicroDuckCompiledBehaviorArtifact.commands[0]).toMatchObject({
      capabilityId: 'microduck-leds',
      commandId: 'set-led-pattern',
      targetId: 'microduck-usb',
    });
  });

  it('can represent a future StackChan expression behavior', () => {
    const result = validateBehaviorDefinition(
      sampleStackChanExpressionBehavior,
      {
        skills: sampleSkills,
        schedulers: sampleSchedulers,
        arbitrationStrategies: sampleArbitrationStrategies,
      },
    );

    expect(result).toEqual({ valid: true, errors: [] });
    expect(sampleStackChanExpressionBehavior.skillIds).toEqual([
      'set-stackchan-expression',
    ]);
  });

  it('reports invalid behavior references', () => {
    const result = validateBehaviorDefinition(
      {
        ...sampleMicroDuckLedBehavior,
        schedulerId: 'missing-scheduler',
        graph: {
          ...sampleMicroDuckLedBehavior.graph,
          entryNodeId: 'missing-entry',
          edges: [
            {
              id: 'broken-edge',
              fromNodeId: 'on-start',
              toNodeId: 'missing-node',
            },
          ],
        },
        skillIds: ['missing-skill'],
      },
      {
        skills: sampleSkills,
        schedulers: sampleSchedulers,
        arbitrationStrategies: sampleArbitrationStrategies,
      },
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Behavior microduck-led-demo references unknown scheduler missing-scheduler.',
        'Behavior microduck-led-demo references unknown skill missing-skill.',
        'Behavior microduck-led-demo has an entry node that is not in its graph.',
        'Behavior edge broken-edge references a missing graph node.',
      ]),
    );
  });

  it('validates adapter target and capability references', () => {
    const adapter: BotLabAdapter = {
      id: 'demo-adapter',
      name: 'Demo Adapter',
      status: 'available',
      targets: [
        {
          id: 'demo-target',
          name: 'Demo Target',
          kind: 'robot',
          adapterId: 'demo-adapter',
          status: 'available',
        },
      ],
      capabilities: [
        {
          id: 'demo-light',
          kind: 'light',
          name: 'Demo light',
          description: 'A light capability for validation tests.',
          targetIds: ['demo-target'],
          schema: {
            commands: [
              {
                id: 'set-color',
                name: 'Set color',
                description: 'Set the visible light color.',
                inputs: [
                  {
                    name: 'color',
                    type: 'color',
                    required: true,
                  },
                ],
              },
            ],
            telemetry: [],
          },
        },
      ],
    };

    expect(validateAdapterManifest(adapter)).toEqual({
      valid: true,
      errors: [],
    });

    expect(
      validateAdapterManifest({
        ...adapter,
        capabilities: [
          {
            ...adapter.capabilities[0],
            targetIds: ['missing-target'],
          },
        ],
      }),
    ).toEqual({
      valid: false,
      errors: [
        'Capability demo-light references unknown target missing-target.',
      ],
    });
  });

  it('validates capability command and telemetry schemas', () => {
    const capability: Capability = {
      id: 'demo-light',
      kind: 'light',
      name: 'Demo light',
      description: 'A light capability for validation tests.',
      targetIds: ['demo-target'],
      schema: {
        commands: [
          {
            id: 'set-mode',
            name: 'Set mode',
            description: 'Set a named display mode.',
            inputs: [
              {
                name: 'mode',
                type: 'enum',
                required: true,
              },
              {
                name: 'brightness',
                type: 'number',
                required: true,
                min: 100,
                max: 0,
              },
              {
                name: 'brightness',
                type: 'number',
                required: false,
              },
            ],
          },
          {
            id: 'set-mode',
            name: 'Duplicate set mode',
            description: 'A duplicate command id.',
            inputs: [],
          },
        ],
        telemetry: [
          {
            id: 'frame-rate',
            name: 'Frame rate',
            description: 'Reported LED frame rate.',
            fields: [],
          },
          {
            id: 'frame-rate',
            name: 'Duplicate frame rate',
            description: 'A duplicate telemetry id.',
            fields: [],
          },
        ],
      },
    };

    expect(validateCapabilitySchema(capability)).toEqual({
      valid: false,
      errors: [
        'Capability demo-light has duplicate command set-mode.',
        'Capability demo-light has duplicate telemetry frame-rate.',
        'Capability demo-light command set-mode field mode must define enumValues.',
        'Capability demo-light command set-mode field brightness has min greater than max.',
        'Capability demo-light command set-mode has duplicate input brightness.',
      ],
    });
  });

  it('validates policy rule references and confirmation rules', () => {
    const result = validatePolicy(
      {
        id: 'bad-policy',
        name: 'Bad policy',
        rules: [
          {
            id: 'confirm-with-warning',
            category: 'user-confirmation',
            effect: 'warn',
            description: 'Invalid confirmation rule.',
            capabilityIds: ['missing-capability'],
          },
          {
            id: 'target-rule',
            category: 'target',
            effect: 'deny',
            description: 'Invalid target rule.',
          },
          {
            id: 'target-rule',
            category: 'target',
            effect: 'deny',
            description: 'Duplicate target rule.',
            targetIds: ['missing-target'],
          },
        ],
      },
      {
        capabilities: microDuckAdapter.capabilities,
        targets: microDuckAdapter.targets,
      },
    );

    expect(result).toEqual({
      valid: false,
      errors: [
        'Policy bad-policy has duplicate rule target-rule.',
        'Policy rule confirm-with-warning must require confirmation when category is user-confirmation.',
        'Policy rule confirm-with-warning references unknown capability missing-capability.',
        'Policy rule target-rule must name targetIds for target rules.',
        'Policy rule target-rule references unknown target missing-target.',
      ],
    });
  });

  it('validates compiled behavior artifacts against adapter schemas', () => {
    expect(
      validateCompiledBehaviorArtifact(
        sampleMicroDuckCompiledBehaviorArtifact,
        {
          behaviors: [sampleMicroDuckLedBehavior],
          adapters: [microDuckAdapter],
          policies: [
            {
              id: 'confirm-visible-output',
              name: 'Confirm visible output',
              rules: [],
            },
          ],
        },
      ),
    ).toEqual({ valid: true, errors: [] });

    expect(
      validateCompiledBehaviorArtifact(
        {
          ...sampleMicroDuckCompiledBehaviorArtifact,
          requiredPolicyIds: ['missing-policy'],
          commands: [
            {
              ...sampleMicroDuckCompiledBehaviorArtifact.commands[0],
              targetId: 'missing-target',
              inputs: {
                pattern: 'spiral',
                brightness: 150,
                unknown: true,
              },
            },
            {
              id: 'bad-capability-command',
              capabilityId: 'stackchan-expression',
              commandId: 'set-expression',
              targetId: 'microduck-usb',
              inputs: {
                expression: 'happy',
              },
            },
          ],
        },
        {
          behaviors: [sampleMicroDuckLedBehavior],
          adapters: [microDuckAdapter, stackChanAdapter],
          policies: [],
        },
      ),
    ).toEqual({
      valid: false,
      errors: [
        'Compiled artifact artifact-microduck-leds-plan references unknown policy missing-policy.',
        'Compiled command command-microduck-leds-smile targets missing-target, not artifact target microduck-usb.',
        'Compiled command command-microduck-leds-smile references unknown target missing-target.',
        'Compiled command command-microduck-leds-smile uses capability microduck-leds on unsupported target missing-target.',
        'Compiled command command-microduck-leds-smile input pattern must be one of smile, blink, solid, off.',
        'Compiled command command-microduck-leds-smile input brightness must be <= 100.',
        'Compiled command command-microduck-leds-smile provides unknown input unknown.',
        'Compiled command bad-capability-command uses capability stackchan-expression on unsupported target microduck-usb.',
      ],
    });
  });
});

const microDuckAdapter: BotLabAdapter = {
  id: 'microduck',
  name: 'MicroDuck',
  status: 'available',
  targets: [
    {
      id: 'microduck-usb',
      name: 'MicroDuck USB',
      kind: 'robot',
      adapterId: 'microduck',
      status: 'available',
    },
  ],
  capabilities: [
    {
      id: 'microduck-leds',
      kind: 'light',
      name: 'LED matrix',
      description: 'Initial light output capability for MicroDuck behaviors.',
      targetIds: ['microduck-usb'],
      schema: {
        commands: [
          {
            id: 'set-led-pattern',
            name: 'Set LED pattern',
            description: 'Render a named LED pattern with a brightness value.',
            inputs: [
              {
                name: 'pattern',
                type: 'enum',
                required: true,
                enumValues: ['smile', 'blink', 'solid', 'off'],
              },
              {
                name: 'brightness',
                type: 'number',
                required: true,
                min: 0,
                max: 100,
              },
            ],
          },
        ],
        telemetry: [],
      },
    },
  ],
};

const stackChanAdapter: BotLabAdapter = {
  id: 'stackchan',
  name: 'StackChan',
  status: 'planned',
  targets: [
    {
      id: 'stackchan-planned',
      name: 'StackChan',
      kind: 'robot',
      adapterId: 'stackchan',
      status: 'planned',
    },
  ],
  capabilities: [
    {
      id: 'stackchan-expression',
      kind: 'expression',
      name: 'Face expression',
      description: 'Future expressive output capability for StackChan.',
      targetIds: ['stackchan-planned'],
      schema: {
        commands: [
          {
            id: 'set-expression',
            name: 'Set expression',
            description: 'Display a named facial expression.',
            inputs: [
              {
                name: 'expression',
                type: 'enum',
                required: true,
                enumValues: ['happy', 'neutral', 'surprised', 'sleepy'],
              },
            ],
          },
        ],
        telemetry: [],
      },
    },
  ],
};
