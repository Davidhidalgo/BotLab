import { useEffect, useRef, useState } from 'react';
import {
  Copy,
  Download,
  FolderOpen,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@botlab/ui';
import type { LocalProject } from './project-storage';
import type { BotLabLocale } from './i18n';
import { workbenchCopy, workspaceDescription } from './workbench-copy';

export function ProjectManager({
  projects,
  activeId,
  locale,
  busy,
  storageEnabled,
  error,
  onClose,
  onOpen,
  onNew,
  onRename,
  onDuplicate,
  onDelete,
  onImport,
  onExport,
}: {
  projects: LocalProject[];
  activeId: string;
  locale: BotLabLocale;
  busy: boolean;
  storageEnabled: boolean;
  error?: string;
  onClose: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => boolean;
  onImport: () => void;
  onExport: (id: string) => void;
}) {
  const copy = workbenchCopy[locale];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedId, setSelectedId] = useState(activeId);
  const selected =
    projects.find((project) => project.id === selectedId) ?? projects[0];
  const [name, setName] = useState(selected.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const disabled = busy || !storageEnabled;
  useEffect(() => {
    const dialog = dialogRef.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    setName(selected.name);
    setConfirmDelete(false);
  }, [selected.id, selected.name]);

  return (
    <dialog
      ref={dialogRef}
      className="project-dialog"
      aria-labelledby="projects-title"
      aria-describedby="projects-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const index = controls.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        const next =
          index === -1
            ? event.shiftKey
              ? controls.length - 1
              : 0
            : (index + (event.shiftKey ? -1 : 1) + controls.length) %
              controls.length;
        controls[next]?.focus();
      }}
    >
      <div className="project-dialog-heading">
        <div>
          <h2 id="projects-title" className="text-xl font-semibold">
            {copy.projects}
          </h2>
          <p
            id="projects-description"
            className="mt-1 text-sm text-muted-foreground"
          >
            {copy.local}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={copy.close}
          onClick={onClose}
        >
          <X size={20} />
        </Button>
      </div>
      <div className="project-dialog-toolbar">
        <Button disabled={disabled || projects.length >= 50} onClick={onNew}>
          <Plus size={16} />
          {copy.newProject}
        </Button>
        <Button
          variant="secondary"
          disabled={busy || projects.length >= 50}
          onClick={onImport}
        >
          <Upload size={16} />
          {copy.import}
        </Button>
        <span className="text-xs text-muted-foreground">
          {projects.length} / 50
        </span>
      </div>
      <div className="project-dialog-body">
        <nav className="project-list" aria-label={copy.projects}>
          {projects.map((project) => (
            <button
              type="button"
              key={project.id}
              aria-pressed={selected.id === project.id}
              className="project-list-item"
              onClick={() => setSelectedId(project.id)}
            >
              <FolderOpen size={20} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {project.name}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {workspaceDescription(project.document, locale)}
                </span>
              </span>
              {project.id === activeId && (
                <span className="project-current">{copy.current}</span>
              )}
            </button>
          ))}
        </nav>
        <section className="project-detail" aria-label={selected.name}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onRename(selected.id, name);
            }}
          >
            <label className="grid gap-2 text-sm font-medium">
              {copy.name}
              <input
                required
                maxLength={80}
                value={name}
                disabled={disabled}
                className="rounded-md border bg-background px-3 py-2 font-normal"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <Button
              className="mt-3"
              variant="secondary"
              type="submit"
              disabled={
                disabled || !name.trim() || name.trim() === selected.name
              }
            >
              {copy.rename}
            </Button>
          </form>
          <p className="text-sm text-muted-foreground">
            {workspaceDescription(selected.document, locale)}
          </p>
          <p className="text-xs text-muted-foreground">{copy.separate}</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={disabled} onClick={() => onOpen(selected.id)}>
              <FolderOpen size={16} />
              {copy.open}
            </Button>
            <Button
              variant="secondary"
              disabled={disabled || projects.length >= 50}
              onClick={() => onDuplicate(selected.id)}
            >
              <Copy size={16} />
              {copy.duplicate}
            </Button>
            <Button variant="secondary" onClick={() => onExport(selected.id)}>
              <Download size={16} />
              {copy.export}
            </Button>
          </div>
          <div className="project-delete">
            {confirmDelete ? (
              <>
                <p className="text-sm">
                  {copy.removeHint} <strong>{selected.name}</strong>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={disabled}
                    onClick={() => {
                      if (onDelete(selected.id)) setConfirmDelete(false);
                    }}
                  >
                    {copy.confirmRemove}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setConfirmDelete(false)}
                  >
                    {copy.cancel}
                  </Button>
                </div>
              </>
            ) : (
              <Button
                variant="ghost"
                className="text-destructive"
                disabled={disabled || projects.length === 1}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={16} />
                {copy.remove}
              </Button>
            )}
            {projects.length === 1 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {copy.lastProject}
              </p>
            )}
          </div>
        </section>
      </div>
      <footer className="project-dialog-footer">
        <div className="text-xs text-muted-foreground">
          <p>
            {busy
              ? copy.busy
              : projects.length >= 50
                ? copy.limit
                : copy.importHint}
          </p>
          {error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <Button variant="secondary" onClick={onClose}>
          {copy.close}
        </Button>
      </footer>
    </dialog>
  );
}
