import { sampleScratchBlocksWorkspaceArtifact } from '@botlab/blocks';
import {
  projectsStorageKey,
  readProjectLibrary,
  saveProjectLibrary,
  type ProjectLibrary,
} from './project-storage';

describe('local project library', () => {
  const library: ProjectLibrary = {
    schemaVersion: 1,
    activeId: 'robot',
    projects: [
      {
        id: 'robot',
        name: 'Robot',
        document: {
          schemaVersion: 1,
          workspace: sampleScratchBlocksWorkspaceArtifact,
          locale: 'es',
          targetId: 'stackchan-planned',
          simulatorBackend: 'browser',
        },
      },
    ],
  };
  beforeEach(() => localStorage.clear());
  afterEach(() => jest.restoreAllMocks());
  it('restores active project and target selection', () => {
    expect(saveProjectLibrary(library)).toBe(true);
    expect(readProjectLibrary().library).toMatchObject(library);
  });
  it('preserves corrupt storage for recovery', () => {
    localStorage.setItem(projectsStorageKey, '{broken');
    expect(readProjectLibrary()).toEqual({ error: true });
    expect(localStorage.getItem(projectsStorageKey)).toBe('{broken');
  });
  it('rejects a missing active project', () => {
    localStorage.setItem(
      projectsStorageKey,
      JSON.stringify({ ...library, activeId: 'missing' }),
    );
    expect(readProjectLibrary().error).toBe(true);
  });
  it('reports storage exhaustion without claiming success', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded');
    });
    expect(saveProjectLibrary(library)).toBe(false);
  });
});
