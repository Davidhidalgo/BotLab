import {
  sameProgram,
  type ExecutionResult,
  type ExecutionStatus,
  type ProgramIdentity,
} from '@botlab/model';

const terminal: ExecutionStatus[] = [
  'completed',
  'dispatched',
  'cancelled',
  'failed',
  'confirmation-required',
  'no-work',
];

/** Shared lifecycle for command dispatch and whole-program simulator transports.
 * Transports own physical completion/stop validation; this boundary owns identity
 * and prevents late, foreign, or terminal-to-running updates from replacing a run.
 */
export function createExecutionLifecycle(
  executionId: string,
  program?: ProgramIdentity,
) {
  let result: ExecutionResult = {
    executionId,
    program: program && { ...program },
    status: 'validated',
    evidence: 'none',
  };
  return {
    snapshot(): ExecutionResult {
      return {
        ...result,
        program: result.program && { ...result.program },
        diagnostic: result.diagnostic && { ...result.diagnostic },
      };
    },
    update(update: ExecutionResult): boolean {
      if (
        update.executionId !== result.executionId ||
        (result.program
          ? !sameProgram(result.program, update.program)
          : !!update.program) ||
        terminal.includes(result.status)
      )
        return false;
      if (
        result.status === 'running' &&
        ['accepted', 'validated'].includes(update.status)
      )
        return false;
      if (
        update.status === 'completed' &&
        !['simulator', 'hardware'].includes(update.evidence)
      )
        return false;
      result = {
        ...update,
        program: update.program && { ...update.program },
        diagnostic: update.diagnostic && { ...update.diagnostic },
      };
      return true;
    },
  };
}
