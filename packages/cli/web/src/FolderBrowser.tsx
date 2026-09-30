import { ArrowUp, ChevronRight, FolderGit2, Folder, House, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, type FolderListing } from './api';

/** A small folder browser, served by the local CLI (the browser alone cannot read folder paths). */
export function FolderBrowser({ onOpen, onClose }: { onOpen: (path: string) => void; onClose: () => void }) {
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = useCallback((path?: string) => {
    setError(null);
    api.browse(path).then(setListing, (reason: Error) => setError(reason.message));
  }, []);

  useEffect(() => go(), [go]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="browser-backdrop" onClick={onClose}>
      <div
        className="browser"
        role="dialog"
        aria-modal="true"
        aria-label="Browse folders"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="browser-head">
          <h2>Browse folders</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="browser-path">
          <button
            type="button"
            className="icon-button"
            disabled={!listing?.parent}
            onClick={() => listing?.parent && go(listing.parent)}
            aria-label="Parent folder"
          >
            <ArrowUp size={16} />
          </button>
          <button type="button" className="icon-button" onClick={() => go()} aria-label="Home folder">
            <House size={16} />
          </button>
          <code title={listing?.path}>{listing ? `\u200e${listing.display}` : '…'}</code>
        </div>

        {listing?.isRepo && (
          <div className="browser-repo">
            <span>This folder is a Git repository.</span>
            <button type="button" className="primary-button" onClick={() => onOpen(listing.path)}>
              Open it
            </button>
          </div>
        )}

        {error && <p className="browser-error">{error}</p>}

        <ul className="browser-list">
          {listing?.folders.map((folder) => (
            <li key={folder.path}>
              <button
                type="button"
                className={`browser-item${folder.isRepo ? ' is-repo' : ''}`}
                onClick={() => (folder.isRepo ? onOpen(folder.path) : go(folder.path))}
              >
                {folder.isRepo ? <FolderGit2 size={16} /> : <Folder size={16} />}
                <span className="browser-name">{folder.name}</span>
                {folder.isRepo ? <span className="browser-open">Open</span> : <ChevronRight size={15} />}
              </button>
            </li>
          ))}
          {listing && listing.folders.length === 0 && <li className="browser-empty">No sub-folders here.</li>}
        </ul>
      </div>
    </div>
  );
}
