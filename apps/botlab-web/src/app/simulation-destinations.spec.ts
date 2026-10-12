import {
  microduckWalkingExample,
  sampleScratchBlocksWorkspaceArtifact,
} from '@botlab/blocks';
import {
  openCurrentSimulation,
  hasArchivedMicroduckPrograms,
} from './simulation-destinations';
import {
  decodeWorkspaceDocument,
  encodeWorkspaceDocument,
  type WorkspaceDocument,
} from './workspace-storage';

const legacy: WorkspaceDocument = {
  schemaVersion: 1,
  locale: 'es',
  targetId: 'microduck-sim',
  simulatorBackend: 'browser',
  workspace: {
    ...sampleScratchBlocksWorkspaceArtifact,
    content: '<xml><block type="botlab_microduck_sit" id="sit"/></xml>',
  },
};
describe('retired simulation destinations', () => {
  it.each(['browser', 'native'] as const)(
    'archives %s source and opens an unchanged editable copy without inventing results',
    (simulatorBackend) => {
      const original = { ...legacy, simulatorBackend };
      const next = openCurrentSimulation(original);
      expect(next.targetId).toBe('microduck-mujoco-web');
      expect(next.simulatorBackend).toBe('mujoco');
      expect(next.workspace).toEqual(original.workspace);
      expect(
        next.targetWorkspaces?.[`microduck-sim:${simulatorBackend}`]?.workspace,
      ).toEqual(original.workspace);
      expect(next.lastExecution).toBeUndefined();
      expect(next.mujocoExecution).toBeUndefined();
      expect(original.targetWorkspaces).toBeUndefined();
      expect(hasArchivedMicroduckPrograms(next)).toBe(true);
      const loaded = decodeWorkspaceDocument(encodeWorkspaceDocument(next));
      expect(loaded.workspace.content).toBe(original.workspace.content);
      expect(
        loaded.targetWorkspaces?.[`microduck-sim:${simulatorBackend}`]
          ?.workspace.content,
      ).toBe(original.workspace.content);
      expect(openCurrentSimulation(loaded)).toBe(loaded);
    },
  );
  it('prefers an existing MuJoCo program while retaining both old simulator slots', () => {
    const next = openCurrentSimulation({
      ...legacy,
      targetWorkspaces: {
        'microduck-mujoco-web': { workspace: microduckWalkingExample },
        'microduck-sim:native': {
          workspace: { ...legacy.workspace, content: '<xml/>' },
        },
      },
    });
    expect(next.workspace).toEqual(microduckWalkingExample);
    expect(next.targetWorkspaces?.['microduck-sim:browser']?.workspace).toEqual(
      legacy.workspace,
    );
    expect(
      next.targetWorkspaces?.['microduck-sim:native']?.workspace.content,
    ).toBe('<xml/>');
    expect(next.targetWorkspaces?.['microduck-mujoco-web']).toBeUndefined();
  });
  it('also preserves the old unimplemented USB target, and leaves StackChan untouched', () => {
    expect(
      openCurrentSimulation({ ...legacy, targetId: 'microduck-usb' })
        .targetWorkspaces?.['microduck-usb']?.workspace,
    ).toEqual(legacy.workspace);
    const stackchan = { ...legacy, targetId: 'stackchan-planned' as const };
    expect(openCurrentSimulation(stackchan)).toBe(stackchan);
  });
});
