import {
  sampleMicroDuckCompiledBehaviorArtifact,
  type CompiledBehaviorArtifact,
  type MicroDuckProgramStep,
} from '@botlab/model';

export function compileMicroDuckProgram(
  artifact: { behaviorId: string },
  program: readonly MicroDuckProgramStep[],
  targetId: string
): CompiledBehaviorArtifact {
  const planParts: string[] = [];
  function lower(
    steps: readonly MicroDuckProgramStep[],
    path = ''
  ): CompiledBehaviorArtifact['commands'] {
    const commands: CompiledBehaviorArtifact['commands'] = [];
    for (const [ordinal, step] of steps.entries()) {
      const index = `${path}${ordinal}`;
      if (step.type === 'if') {
        planParts.push(`if-${step.condition.posture}`);
        commands.push({
          id: `command-microduck-if-${index}`,
          sourceBlockId: step.sourceBlockId,
          capabilityId: 'microduck-control',
          commandId: 'if-posture',
          targetId,
          inputs: {
            condition: step.condition,
            then: lower(step.then, `${index}-then-`),
            else: lower(step.else, `${index}-else-`),
          },
        });
        continue;
      }
      if (step.type === 'leds') {
        planParts.push(step.pattern);
        commands.push({
          id: `command-microduck-leds-${index}`,
          sourceBlockId: step.sourceBlockId,
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
              step.distanceMeters
            )}m`
          : turning
          ? `turn-${formatArtifactNumber(step.angleDegrees)}deg`
          : `wait-${formatArtifactNumber(step.seconds)}s`
      );
      commands.push({
        id: `command-microduck-${step.type}-${index}`,
        sourceBlockId: step.sourceBlockId,
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
    ...sampleMicroDuckCompiledBehaviorArtifact,
    id: `artifact-${artifact.behaviorId}-${targetId}-${planParts.join(
      '-'
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
