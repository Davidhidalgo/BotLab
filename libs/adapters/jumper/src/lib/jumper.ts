import {
  expandWalkingProgram,
  walkingConditionCommandSchema,
  proximityCommandSchema,
} from '@botlab/model';
import type {
  Behavior,
  BotLabAdapter,
  CompiledBehaviorArtifact,
  JointPositionLimits,
  JointPositionStep,
} from '@botlab/model';

export const jumperJointTargetId = 'jumper-web-joint-probe';
export const jumperJointBehavior: Behavior = {
  id: 'jumper-joint-program',
  name: 'Control articular de Jumper',
  description:
    'Programa de posiciones articulares en simulación con base fija.',
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

/** Call after resource resolution and successful model/joint negotiation. */
export function createJumperAdapter(
  joints: readonly JointPositionLimits[],
): BotLabAdapter {
  return {
    id: 'jumper',
    name: 'Jumper',
    status: 'available',
    targets: [
      {
        id: jumperJointTargetId,
        name: 'Jumper · control articular web',
        adapterId: 'jumper',
        kind: 'simulator',
        status: 'available',
      },
    ],
    capabilities: [
      {
        id: 'jumper-joint-position',
        name: 'Posición articular',
        kind: 'motion',
        description:
          'Control observado en una escena con base fija; sin locomoción.',
        targetIds: [jumperJointTargetId],
        schema: {
          commands: [
            {
              id: 'set-position',
              name: 'Posición objetivo',
              description:
                'Espera hasta alcanzar la posición dentro de tolerancia.',
              inputs: [
                {
                  name: 'joint',
                  type: 'enum',
                  required: true,
                  enumValues: joints.map((j) => j.name),
                },
                { name: 'positionRadians', type: 'number', required: true },
              ],
            },
          ],
          telemetry: [],
        },
      },
    ],
  };
}

export function compileJumperJointProgram(
  steps: readonly JointPositionStep[],
  joints: readonly JointPositionLimits[],
): CompiledBehaviorArtifact {
  if (!steps.length || steps.length > 100)
    throw new Error('Usa entre 1 y 100 bloques de posición.');
  const ids = new Set<string>();
  for (const step of steps) {
    const joint = joints.find((j) => j.name === step.joint);
    if (
      !step.sourceBlockId ||
      ids.has(step.sourceBlockId) ||
      !joint ||
      !Number.isFinite(step.positionRadians) ||
      step.positionRadians < joint.min ||
      step.positionRadians > joint.max
    )
      throw new Error(
        `Posición o articulación no válida en el bloque ${step.sourceBlockId}.`,
      );
    ids.add(step.sourceBlockId);
  }
  return {
    id: 'jumper-joint-compiled',
    kind: 'compiled-plan',
    behaviorId: jumperJointBehavior.id,
    targetId: jumperJointTargetId,
    label: 'Jumper joint program',
    createdAt: new Date().toISOString(),
    requiredPolicyIds: [],
    commands: steps.map((step, index) => ({
      id: `joint-${index}`,
      sourceBlockId: step.sourceBlockId,
      targetId: jumperJointTargetId,
      capabilityId: 'jumper-joint-position',
      commandId: 'set-position',
      inputs: { joint: step.joint, positionRadians: step.positionRadians },
    })),
  };
}

export const jumperWalkingTargetId = 'jumper-web-walking';
export const jumperWalkingBehavior: Behavior = {
  ...jumperJointBehavior,
  id: 'jumper-web-walking',
  name: 'Marcha web de Jumper',
  description:
    'Avance y giros de 90° con controlador upstream sobre suelo plano.',
};
export function createJumperWalkingAdapter(
  hasProximity = false,
): BotLabAdapter {
  return {
    id: 'jumper-walking',
    name: 'Jumper · marcha',
    status: 'available',
    targets: [
      {
        id: jumperWalkingTargetId,
        name: 'Jumper · marcha web',
        adapterId: 'jumper-walking',
        kind: 'simulator',
        status: 'available',
      },
    ],
    capabilities: [
      {
        id: 'jumper-web-velocity',
        name: 'Avanzar, girar y parar',
        kind: 'motion',
        description: 'Avance y giros medidos de 90° en suelo plano.',
        targetIds: [jumperWalkingTargetId],
        schema: {
          commands: [
            ...(hasProximity
              ? [proximityCommandSchema, walkingConditionCommandSchema]
              : []),
            {
              id: 'turn',
              name: 'Girar 90°',
              description: 'Cuarto de vuelta medido a izquierda o derecha.',
              inputs: [
                {
                  name: 'angleRadians',
                  type: 'number',
                  required: true,
                  min: -Math.PI / 2,
                  max: Math.PI / 2,
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
                  max: 45,
                },
              ],
            },
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
                  min: 0.24,
                  max: 0.24,
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
              id: 'velocity',
              name: 'Avance',
              description: 'Velocidad durante un intervalo simulado.',
              inputs: [
                {
                  name: 'forward',
                  type: 'number',
                  required: true,
                  min: 0,
                  max: 0.24,
                },
                { name: 'yaw', type: 'number', required: true, min: 0, max: 0 },
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
export function compileJumperWalkingProgram(
  steps: readonly import('@botlab/model').WalkingProgramStep[],
): CompiledBehaviorArtifact {
  const expanded = expandWalkingProgram(steps, (s) => {
    if ('kind' in s) {
      const value =
        s.kind === 'distance'
          ? s.distanceMeters
          : s.kind === 'turn'
            ? s.angleRadians
            : s.durationSeconds;
      if (
        !['distance', 'turn', 'wait'].includes(s.kind) ||
        !Number.isFinite(value) ||
        (s.kind === 'distance' && (value < 0 || value > 20)) ||
        (s.kind === 'wait' && (value < 0 || value > 30)) ||
        (s.kind === 'turn' && Math.abs(value) !== Math.PI / 2)
      )
        throw new Error(
          'Jumper admite avance de 0–20 m, espera de 0–30 s y giros de 90° a izquierda o derecha.',
        );
    } else if (
      ![s.forward, s.yaw, s.durationSeconds].every(Number.isFinite) ||
      s.forward < 0 ||
      s.forward > 0.24 ||
      s.yaw !== 0 ||
      s.durationSeconds < 0.02 ||
      s.durationSeconds > 30
    ) {
      throw new Error(
        'Jumper admite avance 0–0,24 m/s, sin giro, durante 0,02–30 s.',
      );
    }
  });
  return {
    id: 'jumper-walking-compiled',
    kind: 'compiled-plan',
    behaviorId: jumperWalkingBehavior.id,
    targetId: jumperWalkingTargetId,
    label: 'Jumper walking',
    createdAt: new Date().toISOString(),
    requiredPolicyIds: [],
    commands: expanded.map((s, i) => ({
      id: `velocity-${i}`,
      ...(s.flow ? { flow: s.flow } : {}),
      sourceBlockId: s.sourceBlockId,
      ...(s.iterations ? { iterations: s.iterations } : {}),
      targetId: jumperWalkingTargetId,
      capabilityId: 'jumper-web-velocity',
      commandId: 'kind' in s ? s.kind : 'velocity',
      inputs:
        'kind' in s
          ? s.kind === 'condition'
            ? { condition: s.condition }
            : s.kind === 'proximity'
              ? { thresholdMeters: s.thresholdMeters }
              : s.kind === 'distance'
                ? {
                    distanceMeters: s.distanceMeters,
                    speed: 0.24,
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
