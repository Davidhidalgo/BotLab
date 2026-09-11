import type { CompiledBehaviorArtifact, Target } from '@botlab/model';
import { createMicroDuckSimulatorBridge } from './microduck-simulator';

describe('microDuckSimulatorBridge', () => {
  it('boots a MicroDuck simulator target and simulates a compiled behavior', async () => {
    const bridge = createMicroDuckSimulatorBridge({
      now: () => '2026-09-11T00:00:00.000Z',
    });
    const target = createMicroDuckSimulatorTarget();
    const bootSnapshot = await bridge.boot(target);

    expect(bootSnapshot).toMatchObject({
      simulatorId: 'microduck-official-sim',
      targetId: 'microduck-sim',
      state: 'ready',
      commandCount: 0,
    });

    const result = await bridge.simulate(createCompiledBehaviorArtifact());

    expect(result).toMatchObject({
      simulatorId: 'microduck-official-sim',
      artifactId: 'artifact-microduck-led-demo-microduck-sim-smile-plan',
      status: 'passed',
      commandCount: 1,
    });
    expect(result.snapshot.messages).toEqual([
      'MicroDuck simulator checked 1 command(s) at 2026-09-11T00:00:00.000Z.',
      'microduck.set-leds -> {"pattern":"smile","brightness":50}',
    ]);
  });

  it('rejects plans before the simulator target is booted', async () => {
    const bridge = createMicroDuckSimulatorBridge();

    expect(() => bridge.simulate(createCompiledBehaviorArtifact())).toThrow(
      'Boot the MicroDuck simulator target before simulating.'
    );
  });
});

function createMicroDuckSimulatorTarget(): Target {
  return {
    id: 'microduck-sim',
    name: 'MicroDuck simulator',
    kind: 'simulator',
    adapterId: 'microduck',
    status: 'available',
    profile: {
      hardware: {
        family: 'MicroDuck',
      },
      simulator: {
        supported: true,
        integrationId: 'microduck-official-sim',
      },
      connection: {
        modes: ['simulator'],
        defaultMode: 'simulator',
        discovery: 'automatic',
      },
    },
  };
}

function createCompiledBehaviorArtifact(): CompiledBehaviorArtifact {
  return {
    id: 'artifact-microduck-led-demo-microduck-sim-smile-plan',
    kind: 'compiled-plan',
    label: 'MicroDuck LED demo',
    createdAt: '2026-09-11T00:00:00.000Z',
    behaviorId: 'microduck-led-demo',
    targetId: 'microduck-sim',
    requiredPolicyIds: ['safe-demo-policy'],
    commands: [
      {
        id: 'cmd-microduck-leds',
        capabilityId: 'microduck-leds',
        commandId: 'microduck.set-leds',
        targetId: 'microduck-sim',
        inputs: {
          pattern: 'smile',
          brightness: 50,
        },
      },
    ],
  };
}
