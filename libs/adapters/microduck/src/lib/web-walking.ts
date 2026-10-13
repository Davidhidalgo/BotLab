import {
  expandWalkingProgram,
  walkingConditionCommandSchema,
  proximityCommandSchema,
} from '@botlab/model';
import type {
  Behavior,
  BotLabAdapter,
  CompiledBehaviorArtifact,
  WalkingProgramStep,
} from '@botlab/model';
export const microduckMujocoTargetId = 'microduck-mujoco-web';
export const microduckWalkingBehavior: Behavior = {
  id: 'microduck-web-walking',
  name: 'Marcha web de MicroDuck',
  description: 'Velocidad y giro sobre suelo plano con la policy alpha.',
  skillIds: [],
  schedulerId: 'manual',
  arbitrationId: 'exclusive',
  artifactIds: [],
  ast: {
    version: 1,
    steps: [{ id: 'start', nodeId: 'start', action: 'trigger' }],
  },
  graph: {
    nodes: [{ id: 'start', kind: 'event', label: 'Start' }],
    edges: [],
    entryNodeId: 'start',
  },
};
/** Advertise only after the pinned model and controller have loaded successfully. */
export function createMicroduckWalkingAdapter(
  hasProximity = false,
): BotLabAdapter {
  return {
    id: 'microduck-mujoco',
    name: 'MicroDuck · marcha web',
    status: 'available',
    targets: [
      {
        id: microduckMujocoTargetId,
        name: 'MicroDuck · MuJoCo web',
        adapterId: 'microduck-mujoco',
        kind: 'simulator',
        status: 'available',
      },
    ],
    capabilities: [
      {
        id: 'microduck-web-velocity',
        name: 'Marcha en suelo plano',
        kind: 'motion',
        description:
          'Policy alpha: velocidad y giro durante un intervalo simulado.',
        targetIds: [microduckMujocoTargetId],
        schema: {
          commands: [
            {
              id: 'posture',
              name: 'Cambiar postura',
              description:
                'Sentarse o levantarse de forma explícita y observada.',
              inputs: [
                {
                  name: 'posture',
                  type: 'enum',
                  enumValues: ['sit', 'stand'],
                  required: true,
                },
              ],
            },
            {
              id: 'head-yaw',
              name: 'Orientar cabeza',
              description:
                'Orientación medida de cabeza con equilibrio activo.',
              inputs: [
                {
                  name: 'angleRadians',
                  type: 'number',
                  required: true,
                  min: -0.3,
                  max: 0.3,
                },
              ],
            },
            ...(hasProximity
              ? [proximityCommandSchema, walkingConditionCommandSchema]
              : []),
            {
              id: 'distance',
              name: 'Avanzar',
              description: 'Termina al alcanzar la distancia medida.',
              inputs: [
                {
                  name: 'distanceMeters',
                  type: 'number',
                  required: true,
                  min: 0,
                  max: 20,
                },
                {
                  name: 'speed',
                  type: 'number',
                  required: true,
                  min: 0.25,
                  max: 0.25,
                },
                {
                  name: 'timeoutSeconds',
                  type: 'number',
                  required: true,
                  min: 1,
                  max: 600,
                },
              ],
            },
            {
              id: 'wait',
              name: 'Esperar',
              description: 'Mantiene el equilibrio durante la espera.',
              inputs: [
                {
                  name: 'durationSeconds',
                  type: 'number',
                  required: true,
                  min: 0,
                  max: 30,
                },
              ],
            },
            {
              id: 'turn',
              name: 'Girar',
              description: 'Termina al alcanzar el giro medido.',
              inputs: [
                {
                  name: 'angleRadians',
                  type: 'number',
                  required: true,
                  min: 0,
                  max: 2 * Math.PI,
                },
                {
                  name: 'speed',
                  type: 'number',
                  required: true,
                  min: 1,
                  max: 1,
                },
                {
                  name: 'timeoutSeconds',
                  type: 'number',
                  required: true,
                  min: 1,
                  max: 600,
                },
              ],
            },
            {
              id: 'velocity',
              name: 'Velocidad',
              description: 'Incluye parada con velocidad cero.',
              inputs: [
                {
                  name: 'forward',
                  type: 'number',
                  required: true,
                  min: -0.2,
                  max: 0.25,
                },
                {
                  name: 'yaw',
                  type: 'number',
                  required: true,
                  min: -1,
                  max: 1,
                },
                {
                  name: 'durationSeconds',
                  type: 'number',
                  required: true,
                  min: 0.02,
                  max: 30,
                },
              ],
            },
          ],
          telemetry: [],
        },
      },
    ],
  };
}
export function compileMicroduckWalkingProgram(
  steps: readonly WalkingProgramStep[],
): CompiledBehaviorArtifact {
  const expanded = expandWalkingProgram(steps, (s) => {
    if ('kind' in s && s.kind === 'posture') {
      if (!['sit', 'stand'].includes(s.posture))
        throw new Error('Postura no válida.');
      return;
    }
    if ('kind' in s) {
      const value =
        s.kind === 'distance'
          ? s.distanceMeters
          : s.kind === 'turn' || s.kind === 'head-yaw'
            ? s.angleRadians
            : s.durationSeconds;
      if (
        !['distance', 'turn', 'wait', 'head-yaw'].includes(s.kind) ||
        !Number.isFinite(value) ||
        (s.kind === 'distance' && (value < 0 || value > 20)) ||
        (s.kind === 'wait' && (value < 0 || value > 30)) ||
        (s.kind === 'head-yaw' && ![0, -0.3, 0.3].includes(value)) ||
        (s.kind === 'turn' && (value < 0 || value > 2 * Math.PI))
      )
        throw new Error(
          'Usa avance de 0–20 m, giro a la izquierda de 0–360° y espera de 0–30 s.',
        );
    } else if (
      ![s.forward, s.yaw, s.durationSeconds].every(Number.isFinite) ||
      s.forward < -0.2 ||
      s.forward > 0.25 ||
      Math.abs(s.yaw) > 1 ||
      s.durationSeconds < 0.02 ||
      s.durationSeconds > 30
    ) {
      throw new Error('Velocidad o duración no válida.');
    }
  });
  return {
    id: 'microduck-walking-compiled',
    kind: 'compiled-plan',
    behaviorId: microduckWalkingBehavior.id,
    targetId: microduckMujocoTargetId,
    label: 'MicroDuck walking',
    createdAt: new Date().toISOString(),
    requiredPolicyIds: [],
    commands: expanded.map((s, i) => ({
      id: `velocity-${i}`,
      ...(s.flow ? { flow: s.flow } : {}),
      sourceBlockId: s.sourceBlockId,
      ...(s.iterations ? { iterations: s.iterations } : {}),
      targetId: microduckMujocoTargetId,
      capabilityId: 'microduck-web-velocity',
      commandId: 'kind' in s ? s.kind : 'velocity',
      inputs:
        'kind' in s
          ? s.kind === 'posture'
            ? { posture: s.posture }
            : s.kind === 'head-yaw'
              ? { angleRadians: s.angleRadians }
              : s.kind === 'condition'
                ? { condition: s.condition }
                : s.kind === 'proximity'
                  ? { thresholdMeters: s.thresholdMeters }
                  : s.kind === 'distance'
                    ? {
                        distanceMeters: s.distanceMeters,
                        speed: 0.25,
                        timeoutSeconds: 15 + s.distanceMeters / 0.04,
                      }
                    : s.kind === 'turn'
                      ? {
                          angleRadians: s.angleRadians,
                          speed: 1,
                          timeoutSeconds: 45,
                        }
                      : { durationSeconds: s.durationSeconds }
          : {
              forward: s.forward,
              yaw: s.yaw,
              durationSeconds: s.durationSeconds,
            },
    })),
  };
}
