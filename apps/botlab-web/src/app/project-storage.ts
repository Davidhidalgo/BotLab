import {
  decodeWorkspaceDocument,
  encodeWorkspaceDocument,
  type WorkspaceDocument,
} from './workspace-storage';

export const projectsStorageKey = 'botlab.projects.v1';
export function createLocalProjectId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `project-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
export interface LocalProject {
  id: string;
  name: string;
  document: WorkspaceDocument;
}
export interface ProjectLibrary {
  schemaVersion: 1;
  activeId: string;
  projects: LocalProject[];
}

export function readProjectLibrary(): {
  library?: ProjectLibrary;
  error: boolean;
} {
  try {
    const text = localStorage.getItem(projectsStorageKey);
    if (!text) return { error: false };
    const data = JSON.parse(text);
    if (
      data?.schemaVersion !== 1 ||
      !Array.isArray(data.projects) ||
      !data.projects.length ||
      data.projects.length > 50
    )
      throw new Error('Invalid projects');
    const ids = new Set<string>();
    const projects = data.projects.map((project: LocalProject) => {
      if (
        !project ||
        typeof project.id !== 'string' ||
        !project.id ||
        ids.has(project.id) ||
        typeof project.name !== 'string' ||
        !project.name.trim() ||
        project.name.length > 80
      )
        throw new Error('Invalid project');
      ids.add(project.id);
      return {
        id: project.id,
        name: project.name,
        document: decodeWorkspaceDocument(JSON.stringify(project.document)),
      };
    });
    if (!ids.has(data.activeId)) throw new Error('Invalid active project');
    return {
      library: { schemaVersion: 1, activeId: data.activeId, projects },
      error: false,
    };
  } catch {
    return { error: true };
  }
}

export function saveProjectLibrary(library: ProjectLibrary): boolean {
  try {
    // Validate without rewriting live execution status to interrupted.
    for (const project of library.projects)
      decodeWorkspaceDocument(encodeWorkspaceDocument(project.document));
    localStorage.setItem(projectsStorageKey, JSON.stringify(library));
    return true;
  } catch {
    return false;
  }
}
