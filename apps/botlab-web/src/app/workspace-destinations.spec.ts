import {
  jumperWalkingExample,
  sampleScratchBlocksWorkspaceArtifact,
} from '@botlab/blocks';
import { compileJumperWalkingProgram } from '@botlab/adapters-jumper';
import { identifyCompiledProgram } from '@botlab/model';
import { selectWorkspaceDestination } from './workspace-destinations';
import {
  decodeWorkspaceDocument,
  encodeWorkspaceDocument,
  type WorkspaceDocument,
} from './workspace-storage';
import type { SavedMujocoExecution } from './mujoco-execution-storage';

const execution: SavedMujocoExecution = {
  targetId: 'jumper-web-walking',
  sourceContent: jumperWalkingExample.content,
  status: 'completed',
  startedAt: '2026-10-12T12:00:00Z',
  finishedAt: '2026-10-12T12:00:01Z',
  manifestId: 'walking',
  modelRevision: 'pinned-revision',
  mujocoVersion: '3.11.0',
  outcome: {
    executionId: 'measured-run',
    status: 'completed',
    evidence: 'simulator',
    program: identifyCompiledProgram(
      compileJumperWalkingProgram([
        { sourceBlockId: 'walk', forward: 0.24, yaw: 0, durationSeconds: 3 },
      ]),
    ),
  },
  trace: [
    {
      sourceBlockId: 'walk',
      result: {
        status: 'completed',
        evidence: 'simulator',
        level: 'closed-loop-policy',
        timeSeconds: 3,
        displacementMeters: 0.6,
      },
    },
  ],
};
const initial: WorkspaceDocument = {
  schemaVersion: 1,
  locale: 'es',
  workspace: sampleScratchBlocksWorkspaceArtifact,
  targetId: 'microduck-sim',
  simulatorBackend: 'browser',
};

describe('per-destination project documents', () => {
  it('migrates a legacy document without overwriting its blocks and keeps independently edited targets', () => {
    let doc = decodeWorkspaceDocument(encodeWorkspaceDocument(initial));
    doc = selectWorkspaceDestination(doc, 'jumper-web-walking', 'mujoco');
    expect(doc.workspace.content).toBe(jumperWalkingExample.content);
    doc = { ...doc, mujocoExecution: execution };
    doc = selectWorkspaceDestination(doc, 'microduck-sim', 'native');
    doc.workspace = { ...doc.workspace, content: '<xml/>' };
    doc = selectWorkspaceDestination(doc, 'microduck-sim', 'browser');
    expect(doc.workspace.content).toBe(initial.workspace.content);
    doc = decodeWorkspaceDocument(encodeWorkspaceDocument(doc));
    doc = selectWorkspaceDestination(doc, 'jumper-web-walking', 'mujoco');
    expect(doc.mujocoExecution).toEqual(execution);
    doc = selectWorkspaceDestination(doc, 'microduck-sim', 'native');
    expect(doc.workspace.content).toBe('<xml/>');
    expect(doc.mujocoExecution).toBeUndefined();
  });

  it('restores active and inactive running records as interrupted without inventing completion', () => {
    let doc = selectWorkspaceDestination(
      initial,
      'jumper-web-walking',
      'mujoco',
    );
    doc.mujocoExecution = {
      ...execution,
      status: 'running',
      finishedAt: undefined,
      outcome: { ...execution.outcome, status: 'running', evidence: 'none' },
    };
    let restored = decodeWorkspaceDocument(encodeWorkspaceDocument(doc));
    expect(restored.mujocoExecution?.status).toBe('interrupted');
    expect(restored.mujocoExecution?.outcome).toMatchObject({
      status: 'cancelled',
      evidence: 'none',
    });
    doc = selectWorkspaceDestination(doc, 'microduck-mujoco-web', 'mujoco');
    restored = decodeWorkspaceDocument(encodeWorkspaceDocument(doc));
    expect(
      restored.targetWorkspaces?.['jumper-web-walking']?.mujocoExecution
        ?.status,
    ).toBe('interrupted');
    expect(restored).not.toHaveProperty('session');
  });

  it('rejects cross-target results, stale source, malformed measurements and nested destination maps', () => {
    const base = {
      ...initial,
      targetId: 'jumper-web-walking',
      simulatorBackend: 'mujoco',
      workspace: jumperWalkingExample,
      mujocoExecution: execution,
    };
    for (const changed of [
      { ...base, simulatorBackend: 'native' },
      {
        ...base,
        mujocoExecution: { ...execution, targetId: 'microduck-mujoco-web' },
      },
      { ...base, mujocoExecution: { ...execution, sourceContent: '<xml/>' } },
      {
        ...base,
        mujocoExecution: {
          ...execution,
          trace: [
            { result: { ...execution.trace[0].result, timeSeconds: null } },
          ],
        },
      },
      {
        ...base,
        targetWorkspaces: { unknown: { workspace: initial.workspace } },
      },
      {
        ...base,
        targetWorkspaces: {
          'jumper-web-walking': {
            workspace: jumperWalkingExample,
            targetWorkspaces: {},
          },
        },
      },
    ])
      expect(() => decodeWorkspaceDocument(JSON.stringify(changed))).toThrow();
  });
});
