import { selectWorkspaceDestination } from './workspace-destinations';
import type { WorkspaceDocument } from './workspace-storage';

/** Explicit build-time opt-in for internal comparisons, never a project setting. */
export const referenceSimulatorsEnabled =
  process.env.BOTLAB_REFERENCE_SIMULATORS === '1';

/** Preserve the original source and evidence; never reinterpret legacy commands. */
export function openCurrentSimulation(
  document: WorkspaceDocument,
): WorkspaceDocument {
  if (
    document.targetId !== 'microduck-sim' &&
    document.targetId !== 'microduck-usb'
  )
    return document;
  const existing = document.targetWorkspaces?.['microduck-mujoco-web'];
  const migrated = selectWorkspaceDestination(
    document,
    'microduck-mujoco-web',
    'mujoco',
  );
  return existing
    ? migrated
    : {
        ...migrated,
        workspace: { ...document.workspace },
        lastExecution: undefined,
        mujocoExecution: undefined,
      };
}

export function hasArchivedMicroduckPrograms(
  document: WorkspaceDocument,
): boolean {
  return !!(
    document.targetWorkspaces?.['microduck-sim:browser'] ||
    document.targetWorkspaces?.['microduck-sim:native'] ||
    document.targetWorkspaces?.['microduck-usb']
  );
}
