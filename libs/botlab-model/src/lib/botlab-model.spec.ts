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
  type BotLabAdapter,
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
    const result = validateBehaviorDefinition(sampleStackChanExpressionBehavior, {
      skills: sampleSkills,
      schedulers: sampleSchedulers,
      arbitrationStrategies: sampleArbitrationStrategies,
    });

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

    expect(validateAdapterManifest(adapter)).toEqual({ valid: true, errors: [] });

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
      errors: ['Capability demo-light references unknown target missing-target.'],
    });
  });
});
