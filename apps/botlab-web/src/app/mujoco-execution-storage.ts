import {
  walkingProgramLimits,
  type ExecutionResult,
  type ProgramIteration,
} from '@botlab/model';
import type { SimulationCommandResult } from '@botlab/simulators-core';
import type { BlocksWorkspaceArtifact } from '@botlab/blocks';
import { isMujocoTarget, type MujocoTargetId } from './mujoco-targets';

export interface SavedMujocoExecution {
  targetId: MujocoTargetId;
  sourceContent: string;
  status:
    | 'running'
    | 'completed'
    | 'cancelled'
    | 'failed'
    | 'interrupted'
    | 'no-work';
  outcome: ExecutionResult;
  startedAt: string;
  finishedAt?: string;
  manifestId: string;
  modelRevision: string;
  mujocoVersion: string;
  trace: Array<{
    commandId?: string;
    sourceBlockId?: string;
    iterations?: ProgramIteration[];
    result: SimulationCommandResult;
  }>;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
function date(value: unknown): value is string {
  return nonempty(value) && Number.isFinite(Date.parse(value));
}

/** Restore historical evidence only; an in-flight run never resumes after hydration. */
export function decodeMujocoExecution(
  value: unknown,
  workspace: BlocksWorkspaceArtifact,
  targetId: string | undefined,
): SavedMujocoExecution {
  if (
    !record(value) ||
    !targetId ||
    !isMujocoTarget(targetId) ||
    value.targetId !== targetId ||
    value.sourceContent !== workspace.content ||
    ![
      'running',
      'completed',
      'cancelled',
      'failed',
      'interrupted',
      'no-work',
    ].includes(String(value.status)) ||
    !date(value.startedAt) ||
    (value.finishedAt !== undefined && !date(value.finishedAt)) ||
    !nonempty(value.manifestId) ||
    !nonempty(value.modelRevision) ||
    !nonempty(value.mujocoVersion) ||
    !Array.isArray(value.trace) ||
    value.trace.length > walkingProgramLimits.expandedSteps ||
    !record(value.outcome)
  )
    throw new Error('Invalid saved MuJoCo execution.');
  const outcome = value.outcome;
  const program = outcome.program;
  const expectedStatus =
    value.status === 'interrupted' ? 'cancelled' : value.status;
  if (
    !nonempty(outcome.executionId) ||
    outcome.status !== expectedStatus ||
    !['none', 'simulator'].includes(String(outcome.evidence)) ||
    (value.status === 'completed' && outcome.evidence !== 'simulator') ||
    (value.status === 'no-work' &&
      (outcome.evidence !== 'none' || value.trace.length !== 0)) ||
    !record(program) ||
    !nonempty(program.programId) ||
    !nonempty(program.revision) ||
    program.targetId !== targetId
  )
    throw new Error('Invalid saved MuJoCo outcome.');
  const commandIds = new Set<string>();
  const trace = value.trace.map(
    (entry): SavedMujocoExecution['trace'][number] => {
      if (
        !record(entry) ||
        !record(entry.result) ||
        (entry.sourceBlockId !== undefined && !nonempty(entry.sourceBlockId)) ||
        (entry.commandId !== undefined &&
          (!nonempty(entry.commandId) || commandIds.has(entry.commandId)))
      )
        throw new Error('Invalid MuJoCo trace.');
      if (entry.commandId !== undefined)
        commandIds.add(entry.commandId as string);
      let iterations: ProgramIteration[] | undefined;
      if (entry.iterations !== undefined) {
        if (
          !Array.isArray(entry.iterations) ||
          entry.iterations.length > walkingProgramLimits.depth
        )
          throw new Error('Invalid MuJoCo iterations.');
        iterations = entry.iterations.map((iteration: unknown) => {
          if (
            !record(iteration) ||
            !nonempty(iteration.sourceBlockId) ||
            typeof iteration.iteration !== 'number' ||
            !Number.isInteger(iteration.iteration) ||
            typeof iteration.count !== 'number' ||
            !Number.isInteger(iteration.count) ||
            iteration.iteration < 1 ||
            iteration.iteration > iteration.count ||
            iteration.count > walkingProgramLimits.count
          )
            throw new Error('Invalid MuJoCo iteration.');
          return {
            sourceBlockId: iteration.sourceBlockId,
            iteration: iteration.iteration,
            count: iteration.count,
          };
        });
      }
      const result = entry.result;
      if (
        result.status !== 'completed' ||
        result.evidence !== 'simulator' ||
        !['physics', 'closed-loop-policy'].includes(String(result.level)) ||
        typeof result.timeSeconds !== 'number' ||
        !Number.isFinite(result.timeSeconds) ||
        result.timeSeconds < 0
      )
        throw new Error('Invalid MuJoCo measurement.');
      const checked: SimulationCommandResult = {
        status: 'completed',
        evidence: 'simulator',
        level: result.level as SimulationCommandResult['level'],
        timeSeconds: result.timeSeconds,
      };
      for (const key of [
        'finalErrorRadians',
        'displacementMeters',
        'yawRadians',
        'targetDistanceMeters',
        'forwardDisplacementMeters',
        'targetYawRadians',
      ] as const) {
        if (result[key] !== undefined) {
          if (typeof result[key] !== 'number' || !Number.isFinite(result[key]))
            throw new Error('Invalid MuJoCo measurement.');
          checked[key] = result[key];
        }
      }
      if (result.proximity !== undefined) {
        const p = result.proximity;
        if (
          !record(p) ||
          typeof p.value !== 'boolean' ||
          ![
            'distanceMeters',
            'thresholdMeters',
            'capturedAtSeconds',
            'sequence',
          ].every(
            (k) =>
              typeof p[k] === 'number' && Number.isFinite(p[k]) && p[k] >= 0,
          ) ||
          !Number.isSafeInteger(p.sequence) ||
          (p.thresholdMeters as number) < 0.05 ||
          (p.thresholdMeters as number) > 4 ||
          p.value !==
            (p.distanceMeters as number) < (p.thresholdMeters as number) ||
          Math.abs((p.capturedAtSeconds as number) - checked.timeSeconds) > 0.1
        )
          throw new Error('Invalid saved proximity reading.');
        checked.proximity = {
          value: p.value,
          distanceMeters: p.distanceMeters as number,
          thresholdMeters: p.thresholdMeters as number,
          capturedAtSeconds: p.capturedAtSeconds as number,
          sequence: p.sequence as number,
        };
      }
      return {
        ...(entry.commandId !== undefined
          ? { commandId: entry.commandId as string }
          : {}),
        ...(iterations !== undefined ? { iterations } : {}),
        sourceBlockId: entry.sourceBlockId as string | undefined,
        result: checked,
      };
    },
  );
  const interrupted =
    value.status === 'running' || value.status === 'interrupted';
  return {
    targetId,
    sourceContent: workspace.content,
    status: interrupted
      ? 'interrupted'
      : (value.status as SavedMujocoExecution['status']),
    outcome: {
      executionId: outcome.executionId,
      status: interrupted
        ? 'cancelled'
        : (expectedStatus as ExecutionResult['status']),
      evidence: interrupted
        ? 'none'
        : (outcome.evidence as ExecutionResult['evidence']),
      program: {
        programId: program.programId,
        revision: program.revision,
        targetId,
      },
    },
    startedAt: value.startedAt,
    finishedAt: value.finishedAt as string | undefined,
    manifestId: value.manifestId,
    modelRevision: value.modelRevision,
    mujocoVersion: value.mujocoVersion,
    trace,
  };
}
