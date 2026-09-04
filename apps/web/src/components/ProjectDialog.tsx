import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Project } from '@recursive-research/contracts';
import { api, describeError } from '../lib/api';
import { Icon } from './Icon';

export function ProjectDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function chooseFolder() {
    setPicking(true);
    setError(null);
    try {
      const result = await api.pickFolder();
      if (result.folderPath) {
        setFolderPath(result.folderPath);
        if (!name.trim())
          setName(
            result.folderPath
              .replace(/[\\/]+$/, '')
              .split(/[\\/]/)
              .at(-1) ?? 'Research',
          );
      }
    } catch (cause) {
      setError(`${describeError(cause)} You can enter a folder path below.`);
    } finally {
      setPicking(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated(await api.createProject(name.trim(), folderPath.trim()));
    } catch (cause) {
      setError(describeError(cause));
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="project-dialog"
      aria-labelledby="project-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy && !picking) onClose();
      }}
    >
      <div className="window-bar">
        <span id="project-dialog-title">New project</span>
        <button
          type="button"
          className="icon-button inverse"
          aria-label="Close project dialog"
          disabled={busy || picking}
          onClick={onClose}
        >
          <Icon name="close" size={15} />
        </button>
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <div className="dialog-copy">
          <label className="field">
            <span>Project name</span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={100}
              placeholder="Project name"
              disabled={busy}
            />
          </label>
          <div className="field">
            <label htmlFor="project-folder">Project folder</label>
            <div className="folder-input">
              <input
                id="project-folder"
                value={folderPath}
                onChange={(event) => setFolderPath(event.target.value)}
                required
                placeholder="C:\\Users\\you\\Research\\my-project"
                disabled={busy || picking}
              />
              <button
                type="button"
                className="button"
                onClick={() => void chooseFolder()}
                disabled={busy || picking}
              >
                <Icon name="folder" />
                {picking ? 'Choosing…' : 'Browse'}
              </button>
            </div>
            <small>Choose an existing folder.</small>
          </div>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-actions">
          <button
            type="button"
            className="button quiet"
            onClick={onClose}
            disabled={busy || picking}
          >
            Cancel
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={busy || picking || !name.trim() || !folderPath.trim()}
          >
            {busy ? 'Creating…' : 'Create project'}
            <Icon name="arrow" />
          </button>
        </div>
      </form>
    </dialog>
  );
}
