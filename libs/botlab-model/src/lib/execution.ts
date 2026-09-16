/** Exact semantic identity. Revision is canonical JSON, not a display label or timestamp. */
export interface ProgramIdentity {
  programId: string;
  revision: string;
  targetId: string;
}

export type ExecutionStatus =
  | 'validated'
  | 'accepted'
  | 'running'
  | 'completed'
  | 'dispatched'
  | 'cancelled'
  | 'failed'
  | 'confirmation-required'
  | 'no-work';
export type ExecutionEvidence = 'none' | 'dispatch' | 'simulator' | 'hardware';
export type ExecutionDiagnosticCode =
  | 'no-queued-work'
  | 'missing-compiled-artifact'
  | 'invalid-session-transition'
  | 'policy-denied'
  | 'policy-confirmation-required'
  | 'target-unavailable'
  | 'compiled-artifact-validation-failed'
  | 'capability-lock-conflict'
  | 'missing-dispatcher'
  | 'dispatcher-failed'
  | 'dispatcher-threw'
  | 'execution-cancelled'
  | 'transport-failed'
  | 'simulator-failed';

export interface ExecutionResult {
  executionId: string;
  program?: ProgramIdentity;
  status: ExecutionStatus;
  evidence: ExecutionEvidence;
  diagnostic?: { code: ExecutionDiagnosticCode; message?: string };
  sourceBlockId?: string;
}

export function createProgramIdentity(
  programId: string,
  targetId: string,
  content: unknown,
): ProgramIdentity {
  return { programId, targetId, revision: canonical(content) };
}

export function sameProgram(
  left: ProgramIdentity | undefined,
  right: ProgramIdentity | undefined,
): boolean {
  return (
    !!left &&
    !!right &&
    left.programId === right.programId &&
    left.targetId === right.targetId &&
    left.revision === right.revision
  );
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (
    typeof value === 'object' &&
    value &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  throw new Error('Program identity requires finite JSON data.');
}

export function identifyCompiledProgram(artifact: {
  behaviorId: string;
  targetId: string;
  commands: unknown;
  requiredPolicyIds: string[];
}): ProgramIdentity {
  return createProgramIdentity(artifact.behaviorId, artifact.targetId, {
    commands: artifact.commands,
    requiredPolicyIds: artifact.requiredPolicyIds,
  });
}
