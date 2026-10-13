import {
  validateWalkingCondition,
  type WalkingCondition,
} from './walking-condition';
import type { ProgramIteration } from './program';
import type { CommandFlow, CapabilityCommandSchema } from './botlab-model';

/** SI units; distinct from legacy MicroDuck degree/duration artifacts. */
export interface VelocityProgramStep {
  sourceBlockId: string;
  forward: number;
  yaw: number;
  durationSeconds: number;
}

/** Educational goals retain their meaning independently of a robot's speed. */
export type WalkingActionStep =
  | VelocityProgramStep
  | { sourceBlockId: string; kind: 'distance'; distanceMeters: number }
  | { sourceBlockId: string; kind: 'turn'; angleRadians: number }
  | { sourceBlockId: string; kind: 'wait'; durationSeconds: number };

export interface ProximityCondition {
  sourceBlockId: string;
  thresholdMeters: number;
}
export type WalkingProgramStep =
  | {
      sourceBlockId: string;
      kind: 'wait-until';
      condition: WalkingCondition;
      timeoutSeconds: number;
    }
  | {
      sourceBlockId: string;
      kind: 'until';
      condition: WalkingCondition;
      body: WalkingProgramStep[];
      otherwise?: WalkingProgramStep[];
    }
  | {
      sourceBlockId: string;
      kind: 'if';
      condition: WalkingCondition;
      body: WalkingProgramStep[];
      otherwise?: WalkingProgramStep[];
    }
  | WalkingActionStep
  | {
      sourceBlockId: string;
      kind: 'repeat';
      count: number;
      body: WalkingProgramStep[];
    };

export type ExpandedWalkingStep = (
  | WalkingActionStep
  | { sourceBlockId: string; kind: 'proximity'; thresholdMeters: number }
  | { sourceBlockId: string; kind: 'condition'; condition: WalkingCondition }
) & { iterations?: ProgramIteration[]; flow?: CommandFlow };

export const proximityCommandSchema: CapabilityCommandSchema = {
  id: 'proximity',
  name: '¿Obstáculo delante?',
  description: 'Compara una lectura frontal actual con el umbral.',
  inputs: [
    {
      name: 'thresholdMeters',
      type: 'number',
      required: true,
      min: 0.05,
      max: 4,
    },
  ],
};
export const walkingConditionCommandSchema: CapabilityCommandSchema = {
  id: 'condition',
  name: 'Condición de distancia',
  description: 'Evalúa la expresión con una lectura frontal confirmada.',
  inputs: [{ name: 'condition', type: 'object', required: true }],
};
export const walkingProgramLimits = {
  count: 100,
  depth: 16,
  sourceSteps: 256,
  expandedSteps: 256,
} as const;

/** Validate the entire source before expansion, including zero-repeat bodies. */
export function expandWalkingProgram(
  program: readonly WalkingProgramStep[],
  validateAction: (step: WalkingActionStep) => void,
): ExpandedWalkingStep[] {
  const ids = new Set<string>();
  function validate(steps: readonly WalkingProgramStep[], depth = 0) {
    if (!Array.isArray(steps) || depth > walkingProgramLimits.depth)
      throw new Error('Usa como máximo 16 niveles de repetición.');
    for (const step of steps) {
      if (
        !step ||
        typeof step.sourceBlockId !== 'string' ||
        !step.sourceBlockId.trim() ||
        ids.has(step.sourceBlockId)
      )
        throw new Error('Cada bloque necesita un identificador distinto.');
      ids.add(step.sourceBlockId);
      if (ids.size > walkingProgramLimits.sourceSteps)
        throw new Error('Usa como máximo 256 bloques.');
      if (
        'kind' in step &&
        (step.kind === 'until' ||
          step.kind === 'if' ||
          step.kind === 'wait-until')
      ) {
        if (step.kind === 'wait-until') {
          if (
            !Number.isFinite(step.timeoutSeconds) ||
            step.timeoutSeconds < 0.5 ||
            step.timeoutSeconds > 30 ||
            !Number.isInteger(step.timeoutSeconds * 2)
          )
            throw new Error(
              'La espera máxima debe ser de 0,5–30 s, en intervalos de 0,5 s.',
            );
        }
        if (step.kind === 'until' && step.otherwise !== undefined)
          throw new Error('Repetir hasta no admite una rama alternativa.');
        validateWalkingCondition(step.condition, ids);
        if (step.kind === 'wait-until') continue;
        validate(step.body, depth + 1);
        if (step.otherwise) validate(step.otherwise, depth + 1);
      } else if ('kind' in step && step.kind === 'repeat') {
        if (
          !Number.isInteger(step.count) ||
          step.count < 0 ||
          step.count > walkingProgramLimits.count
        )
          throw new Error('Repetir necesita un número entero de 0 a 100.');
        validate(step.body, depth + 1);
      } else validateAction(step);
    }
  }
  validate(program);
  if (!program.length) throw new Error('Añade al menos un bloque al programa.');
  const expanded: ExpandedWalkingStep[] = [];
  function append(step: ExpandedWalkingStep, iterations: ProgramIteration[]) {
    if (expanded.length >= walkingProgramLimits.expandedSteps)
      throw new Error(
        'El programa supera 256 pasos al repetir. Reduce las repeticiones o los bloques.',
      );
    expanded.push({ ...step, ...(iterations.length ? { iterations } : {}) });
  }
  function lower(
    steps: readonly WalkingProgramStep[],
    iterations: ProgramIteration[] = [],
  ) {
    for (const step of steps) {
      if (
        'kind' in step &&
        (step.kind === 'until' ||
          step.kind === 'if' ||
          step.kind === 'wait-until')
      ) {
        const check = expanded.length;
        append(
          {
            sourceBlockId: step.condition.sourceBlockId,
            ...('operator' in step.condition
              ? { kind: 'condition' as const, condition: step.condition }
              : {
                  kind: 'proximity' as const,
                  thresholdMeters: step.condition.thresholdMeters,
                }),
          },
          iterations,
        );
        const bodyStart = expanded.length;
        if (step.kind === 'wait-until')
          append(
            {
              sourceBlockId: step.sourceBlockId,
              kind: 'wait',
              durationSeconds: 0.5,
            },
            iterations,
          );
        else lower(step.body, iterations);
        const jump = expanded.length;
        append(
          {
            sourceBlockId: step.sourceBlockId,
            kind: 'wait',
            durationSeconds: 0,
          },
          iterations,
        );
        const otherwise = expanded.length;
        if (step.kind === 'if') lower(step.otherwise ?? [], iterations);
        const end = expanded.length;
        expanded[check].flow =
          step.kind !== 'if'
            ? {
                whenTrue: end,
                whenFalse: bodyStart,
                ...(step.kind === 'wait-until'
                  ? { maxFalseChecks: step.timeoutSeconds * 2 + 1 }
                  : {}),
              }
            : { whenTrue: bodyStart, whenFalse: otherwise };
        expanded[jump].flow = { next: step.kind !== 'if' ? check : end };
      } else if ('kind' in step && step.kind === 'repeat') {
        for (let iteration = 1; iteration <= step.count; iteration++) {
          const path = [
            ...iterations,
            { sourceBlockId: step.sourceBlockId, iteration, count: step.count },
          ];
          // A cancellable checkpoint also bounds expansion of empty nested loops.
          append(
            {
              sourceBlockId: step.sourceBlockId,
              kind: 'wait',
              durationSeconds: 0,
            },
            path,
          );
          lower(step.body, path);
        }
      } else append(step, iterations);
    }
  }
  lower(program);
  return expanded;
}
