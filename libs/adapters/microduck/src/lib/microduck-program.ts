import type {
  CompiledBehaviorArtifact,
  MicroDuckProgramStep,
  ProgramIteration,
} from '@botlab/model';

/** Visible robot output always requires the operator-confirmation policy. */
export const microDuckRequiredPolicyIds = ['confirm-visible-output'];

export function compileMicroDuckProgram(
  artifact: { behaviorId: string },
  program: readonly MicroDuckProgramStep[],
  targetId: string,
): CompiledBehaviorArtifact {
  // Validate even unreachable/zero-repeat bodies before constructing any commands.
  let nodes = 0;
  function validate(steps: readonly MicroDuckProgramStep[], depth = 0) {
    if (!Array.isArray(steps) || depth > 16)
      throw new Error('Programs support at most 16 nested control blocks.');
    for (const step of steps) {
      if (!step || ++nodes > 256)
        throw new Error('Programs support at most 256 blocks.');
      if (step.type === 'repeat') {
        if (!Number.isInteger(step.count) || step.count < 0 || step.count > 100)
          throw new Error('Repeat requires a whole number from 0 to 100.');
        validate(step.body, depth + 1);
      } else if (step.type === 'if') {
        validate(step.then, depth + 1);
        validate(step.else, depth + 1);
      }
    }
  }
  validate(program);
  let expanded = 1; // Reserve the final stop within the transport's 256-step budget.
  const planParts: string[] = [];
  function lower(
    steps: readonly MicroDuckProgramStep[],
    path = '',
    iterations: ProgramIteration[] = [],
  ): CompiledBehaviorArtifact['commands'] {
    const commands: CompiledBehaviorArtifact['commands'] = [];
    for (const [ordinal, step] of steps.entries()) {
      const index = `${path}${ordinal}`;
      if (step.type === 'repeat') {
        planParts.push(`repeat-${step.count}`);
        for (let iteration = 1; iteration <= step.count; iteration++) {
          const context = [
            ...iterations,
            { sourceBlockId: step.sourceBlockId, iteration, count: step.count },
          ];
          // A zero-duration checkpoint preserves progress/cancellation even for empty bodies.
          commands.push(
            ...lower(
              [{ type: 'wait', seconds: 0, sourceBlockId: step.sourceBlockId }],
              `${index}-repeat-${iteration}-start-`,
              context,
            ),
          );
          commands.push(
            ...lower(step.body, `${index}-repeat-${iteration}-`, context),
          );
        }
        continue;
      }
      if (++expanded > 256)
        throw new Error(
          'Program exceeds 256 expanded steps. Reduce repeat counts or body size.',
        );
      if (step.type === 'if') {
        planParts.push(`if-${step.condition.posture}`);
        commands.push({
          id: `command-microduck-if-${index}`,
          sourceBlockId: step.sourceBlockId,
          ...(iterations.length ? { iterations } : {}),
          capabilityId: 'microduck-control',
          commandId: 'if-posture',
          targetId,
          inputs: {
            condition: step.condition,
            then: lower(step.then, `${index}-then-`, iterations),
            else: lower(step.else, `${index}-else-`, iterations),
          },
        });
        continue;
      }
      if (step.type === 'leds') {
        planParts.push(step.pattern);
        commands.push({
          id: `command-microduck-leds-${index}`,
          sourceBlockId: step.sourceBlockId,
          ...(iterations.length ? { iterations } : {}),
          capabilityId: 'microduck-leds',
          commandId: 'set-led-pattern',
          targetId,
          inputs: { pattern: step.pattern, brightness: 50 },
        });
        continue;
      }
      if (step.type === 'posture') {
        planParts.push(step.posture);
        commands.push({
          id: `command-microduck-posture-${index}`,
          sourceBlockId: step.sourceBlockId,
          ...(iterations.length ? { iterations } : {}),
          capabilityId: 'microduck-posture',
          commandId: 'set-posture',
          targetId,
          inputs: { posture: step.posture },
        });
        continue;
      }
      const walking = step.type === 'walk';
      const turning = step.type === 'turn';
      planParts.push(
        walking
          ? `${step.backward ? 'back' : 'walk'}-${formatArtifactNumber(
              step.distanceMeters,
            )}m`
          : turning
            ? `turn-${formatArtifactNumber(step.angleDegrees)}deg`
            : `wait-${formatArtifactNumber(step.seconds)}s`,
      );
      commands.push({
        id: `command-microduck-${step.type}-${index}`,
        sourceBlockId: step.sourceBlockId,
        ...(iterations.length ? { iterations } : {}),
        capabilityId: 'microduck-motion',
        commandId: 'drive-differential',
        targetId,
        inputs: {
          leftPower: walking
            ? step.backward
              ? -1
              : 1
            : turning
              ? Math.sign(step.angleDegrees)
              : 0,
          rightPower: walking
            ? step.backward
              ? -1
              : 1
            : turning
              ? -Math.sign(step.angleDegrees)
              : 0,
          ...(walking
            ? { distanceMeters: step.distanceMeters }
            : turning
              ? { angleDegrees: step.angleDegrees }
              : { durationMs: Math.round(step.seconds * 1000) }),
        },
      });
    }
    return commands;
  }
  const commands = lower(program);
  commands.push({
    id: 'command-microduck-stop',
    capabilityId: 'microduck-motion',
    commandId: 'drive-differential',
    targetId,
    inputs: { leftPower: 0, rightPower: 0, durationMs: 250 },
  });

  return {
    kind: 'compiled-plan',
    // Fixed timestamp keeps recompiling the same program byte-for-byte stable.
    createdAt: '2026-09-10T00:00:00.000Z',
    requiredPolicyIds: [...microDuckRequiredPolicyIds],
    id: `artifact-${artifact.behaviorId}-${targetId}-${planParts.join(
      '-',
    )}-plan`,
    label: `MicroDuck ${program.length}-step plan`,
    behaviorId: artifact.behaviorId,
    targetId,
    commands,
  };
}

function formatArtifactNumber(value: number) {
  return value.toString().replace(/\./g, '_');
}
