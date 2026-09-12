import { sampleScratchBlocksWorkspaceArtifact } from '@botlab/blocks';
import {
  decodeWorkspaceDocument,
  encodeWorkspaceDocument,
  readWorkspaceDocument,
  saveWorkspaceDocument,
  workspaceStorageKey,
  type WorkspaceDocument,
} from './workspace-storage';

describe('versioned workspace storage', () => {
  const document: WorkspaceDocument = {
    schemaVersion: 1,
    workspace: sampleScratchBlocksWorkspaceArtifact,
    locale: 'ca',
  };
  beforeEach(() => localStorage.clear());
  afterEach(() => jest.restoreAllMocks());

  it('round-trips the workspace without restoring executable state', () => {
    expect(saveWorkspaceDocument(document)).toBe(true);
    const restored = readWorkspaceDocument();
    expect(restored.error).toBe(false);
    expect(restored.document?.workspace.content).toBe(
      document.workspace.content
    );
    expect(restored.document?.workspace.status).toBe('loaded');
    expect(restored.document?.locale).toBe('ca');
    expect(restored.document).not.toHaveProperty('compiledArtifact');
  });

  it('marks previously active execution as interrupted and retains its exact plan and trace', () => {
    const saved: WorkspaceDocument = {
      ...document,
      lastExecution: {
        executionId: 'previous-run',
        status: 'running',
        source: {
          artifactId: 'previous-plan',
          targetId: 'microduck-sim',
          frames: [],
          errors: [],
          messages: [],
        },
        events: [{ status: 'accepted', at: '2026-09-12T12:00:00Z' }],
      },
    };
    const restored = decodeWorkspaceDocument(encodeWorkspaceDocument(saved));
    expect(restored.lastExecution?.status).toBe('interrupted');
    expect(restored.lastExecution?.source.artifactId).toBe('previous-plan');
    expect(restored.lastExecution?.events).toEqual(saved.lastExecution?.events);
  });

  it.each([
    'broken',
    '{"schemaVersion":99}',
    '{"schemaVersion":1,"workspace":{}}',
  ])('reports invalid stored content without deleting it: %s', (text) => {
    localStorage.setItem(workspaceStorageKey, text);
    expect(readWorkspaceDocument()).toEqual({ error: true });
    expect(localStorage.getItem(workspaceStorageKey)).toBe(text);
  });

  it('rejects malformed XML, oversized files and unexpected execution metadata', () => {
    expect(() =>
      decodeWorkspaceDocument(
        JSON.stringify({
          ...document,
          workspace: { ...document.workspace, content: '<xml><broken>' },
        })
      )
    ).toThrow('Invalid workspace XML');
    expect(() =>
      decodeWorkspaceDocument(' '.repeat(2 * 1024 * 1024 + 1))
    ).toThrow('too large');
    expect(() =>
      decodeWorkspaceDocument(
        JSON.stringify({ ...document, lastExecution: { status: 'running' } })
      )
    ).toThrow('Invalid saved execution');
  });

  it('does not overwrite the last valid copy with malformed XML', () => {
    saveWorkspaceDocument(document);
    expect(
      saveWorkspaceDocument({
        ...document,
        workspace: { ...document.workspace, content: '<broken>' },
      })
    ).toBe(false);
    expect(readWorkspaceDocument().document?.workspace.content).toBe(
      document.workspace.content
    );
  });

  it('reports storage access and quota failures', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota');
    });
    expect(saveWorkspaceDocument(document)).toBe(false);
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Denied');
    });
    expect(readWorkspaceDocument().error).toBe(true);
  });
});
