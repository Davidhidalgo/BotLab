import { sampleScratchBlocksWorkspaceArtifact } from '@botlab/blocks';
import { isMujocoTarget, mujocoTargets } from './mujoco-targets';
import {
  workspaceDestination,
  type WorkspaceDocument,
  type WorkspaceTargetId,
  type SimulatorBackend,
} from './workspace-storage';

/** Move between durable editor documents; never move a live simulator session. */
export function selectWorkspaceDestination(
  document: WorkspaceDocument,
  targetId: WorkspaceTargetId,
  simulatorBackend: SimulatorBackend,
): WorkspaceDocument {
  const previousTarget = document.targetId ?? 'stackchan-planned';
  const previousKey = workspaceDestination(
    previousTarget,
    document.simulatorBackend ?? 'browser',
  );
  const nextKey = workspaceDestination(targetId, simulatorBackend);
  if (previousKey === nextKey) return document;
  const slots = {
    ...document.targetWorkspaces,
    [previousKey]: {
      workspace: document.workspace,
      lastExecution: document.lastExecution,
      mujocoExecution: document.mujocoExecution,
    },
  };
  const next = slots[nextKey] ?? {
    workspace: isMujocoTarget(targetId)
      ? { ...mujocoTargets[targetId].example }
      : isMujocoTarget(previousTarget)
        ? { ...sampleScratchBlocksWorkspaceArtifact }
        : { ...document.workspace },
  };
  delete slots[nextKey];
  return {
    ...document,
    targetId,
    simulatorBackend,
    targetWorkspaces: slots,
    workspace: next.workspace,
    lastExecution: next.lastExecution,
    mujocoExecution: next.mujocoExecution,
  };
}
