import { formatRelative, Logo } from '@code-galaxy/viewer';
import { ArrowRight, CloudDownload, FolderOpen, GitBranch, RefreshCw, Search } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { api, type RepoEntry } from './api';
import { FolderBrowser } from './FolderBrowser';

/** What the search field holds, when it is more than a search. */
type Intent = { kind: 'clone'; url: string; label: string } | { kind: 'open'; path: string } | { kind: 'zip' };

/** Path segments that start a page or a download of a repository (mirrors parseRemote in the CLI). */
const PAGES = /^(-|tree|blob|commits?|archive|releases)$/;
const BITBUCKET_PAGES = /^(-|tree|blob|commits?|archive|releases|src|get)$/;

/** `host/owner/repo` for a link to a repository, to one of its pages or to one of its downloads. */
function repositoryLabel(url: string): string {
  const [host, ...parts] = url
    .replace(/^https?:\/\//i, '')
    .replace(/^git@([^:]+):/, '$1/')
    .split('/')
    .filter(Boolean);
  const cut = parts.findIndex((part) => (host === 'bitbucket.org' ? BITBUCKET_PAGES : PAGES).test(part));
  const path = cut > 1 ? parts.slice(0, cut) : host === 'github.com' ? parts.slice(0, 2) : parts;
  return [host, ...path.map((part) => part.replace(/\.git$/, ''))].join('/');
}

function intentOf(query: string): Intent | null {
  const text = query.trim();
  if (!text) return null;
  // A ZIP download holds the files of one commit, without the .git folder: there is no history to draw.
  if (/^(\/|~|[a-zA-Z]:[\\/]|\\\\)/.test(text))
    return /\.zip$/i.test(text) ? { kind: 'zip' } : { kind: 'open', path: text };
  if (/^(https?:\/\/|git@)/i.test(text) || /^[\w-]+(\.[\w-]+)+\/[\w.-]+\/[\w.-]+/.test(text)) {
    // Links to a page or to a ZIP of the repository clone the repository itself, with its history.
    return { kind: 'clone', url: text, label: repositoryLabel(text) };
  }
  if (/^[\w.-]+\/[\w.-]+$/.test(text)) return { kind: 'clone', url: text, label: `github.com/${text}` };
  return null;
}

const SKELETON_ROWS = 5;
/** Paths are cut at their start (CSS rtl trick); this mark keeps their slashes in place. */
const LTR_MARK = '\u200e';

function Branch({ name }: { name: string }) {
  return (
    <span className="repo-branch">
      <GitBranch size={12} />
      <span>{name}</span>
    </span>
  );
}

function RepoRow({ repo, active, onOpen }: { repo: RepoEntry; active: boolean; onOpen: (path: string) => void }) {
  return (
    <button
      type="button"
      className={`repo-row${active ? ' is-active' : ''}`}
      disabled={repo.empty}
      onClick={() => onOpen(repo.path)}
      title={repo.empty ? 'This repository has no commits yet' : `Open ${repo.path}`}
    >
      <span className="repo-text">
        <span className="repo-name">{repo.name}</span>
        <span className="repo-path">{LTR_MARK + repo.display}</span>
      </span>
      {repo.empty ? <span className="repo-note">No commits yet</span> : repo.branch && <Branch name={repo.branch} />}
      <span className="repo-time">{repo.updatedAt > 0 ? formatRelative(repo.updatedAt / 1000) : ''}</span>
      <ArrowRight size={15} className="repo-arrow" />
    </button>
  );
}

function RepoCard({ repo, active, onOpen }: { repo: RepoEntry; active: boolean; onOpen: (path: string) => void }) {
  return (
    <button
      type="button"
      className={`repo-card${active ? ' is-active' : ''}`}
      disabled={repo.empty}
      onClick={() => onOpen(repo.path)}
    >
      <span className="repo-name">{repo.name}</span>
      <span className="repo-path">{LTR_MARK + repo.display}</span>
      <span className="repo-meta">
        {repo.branch && <Branch name={repo.branch} />}
        {repo.cloned && <span>Cloned</span>}
        {repo.openedAt && <span>Opened {formatRelative(repo.openedAt / 1000)}</span>}
      </span>
    </button>
  );
}

/** The repository picker: search, recent repositories, repositories on this computer, folders and URLs. */
export function Home({
  onOpen,
  onClone,
  error,
}: {
  onOpen: (path: string) => void;
  /** `label` is the repository as shown to the user, e.g. github.com/owner/repo. */
  onClone: (url: string, label: string) => void;
  error: string | null;
}) {
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<RepoEntry[] | null>(null);
  const [found, setFound] = useState<RepoEntry[] | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.recent().then(setRecent, () => setRecent([]));
    api.discover().then(setFound, () => setFound([]));
  }, []);

  const refresh = () => {
    setFound(null);
    api.discover(true).then(setFound, () => setFound([]));
  };

  const intent = intentOf(query);
  const needle = query.trim().toLowerCase();
  const matches = (repo: RepoEntry) => !needle || `${repo.name} ${repo.display}`.toLowerCase().includes(needle);
  const recentPaths = new Set((recent ?? []).map((repo) => repo.path));
  const recentList = (recent ?? []).filter(matches);
  const foundList = (found ?? []).filter((repo) => !recentPaths.has(repo.path)).filter(matches);
  const searching = needle.length > 0;
  // Keyboard order: the suggested action first, then the repositories as displayed.
  const repos = searching ? [...recentList, ...foundList] : [...recentList.slice(0, 6), ...foundList];
  const offset = intent && intent.kind !== 'zip' ? 1 : 0;
  const count = offset + repos.filter((repo) => !repo.empty).length;
  const selectable = repos.filter((repo) => !repo.empty);

  const activate = (index: number) => {
    if (offset && index === 0) {
      if (intent?.kind === 'clone') onClone(intent.url, intent.label);
      else if (intent?.kind === 'open') onOpen(intent.path);
      return;
    }
    const repo = selectable[index - offset];
    if (repo) onOpen(repo.path);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (count) setActive((index) => (index + (event.key === 'ArrowDown' ? 1 : count - 1)) % count);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      activate(active);
    }
  };

  const isActive = (repo: RepoEntry) => !repo.empty && selectable.indexOf(repo) + offset === active;

  return (
    <div className="home">
      <header className="home-top">
        <span className="home-brand">
          <Logo size={22} /> Code Galaxy
        </span>
        <span className="home-note">Runs on this computer. Nothing is uploaded.</span>
      </header>

      <main className="home-main">
        <h1>Open a repository</h1>
        <p className="home-lead">
          Choose a project on this computer, or paste the address of a repository to clone it. Its history grows into a
          3D tree.
        </p>

        <div className="home-search">
          <Search size={17} className="home-search-icon" />
          <input
            ref={input}
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search your repositories, paste a folder path or a GitHub URL…"
            aria-label="Search repositories, or paste a path or a URL"
            spellCheck={false}
            autoComplete="off"
          />
          <kbd>↵</kbd>
        </div>

        {intent?.kind === 'zip' && (
          <p className="home-notice">
            A ZIP downloaded from GitHub or GitLab only holds the files of one commit, without their history. Paste the
            address of the repository instead, like <code>github.com/owner/repo</code>: it will be cloned with its whole
            history.
          </p>
        )}

        {intent && intent.kind !== 'zip' && (
          <button
            type="button"
            className={`home-action${active === 0 ? ' is-active' : ''}`}
            onClick={() => activate(0)}
          >
            {intent.kind === 'clone' ? <CloudDownload size={17} /> : <FolderOpen size={17} />}
            <span>
              {intent.kind === 'clone' ? 'Clone and open ' : 'Open '}
              <b>{intent.kind === 'clone' ? intent.label : intent.path}</b>
            </span>
            <kbd>Enter</kbd>
          </button>
        )}

        {error && (
          <div className="home-error" role="alert">
            {error}
          </div>
        )}

        {!searching && recentList.length > 0 && (
          <section className="home-section">
            <div className="home-section-head">
              <h2>Recent</h2>
            </div>
            <div className="repo-grid">
              {recentList.slice(0, 6).map((repo) => (
                <RepoCard key={repo.path} repo={repo} active={isActive(repo)} onOpen={onOpen} />
              ))}
            </div>
          </section>
        )}

        {/* A pasted path or address already has its own action: an empty list of matches would only add noise. */}
        {!(intent && found !== null && repos.length === 0) && (
          <section className="home-section">
            <div className="home-section-head">
              <h2>
                {searching ? 'Matching repositories' : 'On this computer'}
                {found && <span className="count">{searching ? repos.length : foundList.length}</span>}
              </h2>
              <div className="home-section-actions">
                <button type="button" className="ghost-button" onClick={() => setBrowsing(true)}>
                  Browse folders…
                </button>
                <button type="button" className="icon-button" onClick={refresh} aria-label="Search again">
                  <RefreshCw size={15} />
                </button>
              </div>
            </div>
            <div className="repo-list">
              {found === null
                ? Array.from({ length: SKELETON_ROWS }, (_, i) => <div key={i} className="repo-row is-skeleton" />)
                : (searching ? repos : foundList).map((repo) => (
                    <RepoRow key={repo.path} repo={repo} active={isActive(repo)} onOpen={onOpen} />
                  ))}
              {found !== null && (searching ? repos : foundList).length === 0 && (
                <p className="repo-empty">
                  {searching
                    ? 'No repository matches. Paste a folder path or a repository address instead.'
                    : 'No repository found in the usual places. Use “Browse folders…” or paste a path.'}
                </p>
              )}
            </div>
          </section>
        )}

        <footer className="home-foot">
          Folder names are read locally and never leave this computer. Repositories cloned from a URL are kept in{' '}
          <code>~/.code-galaxy</code>.
        </footer>
      </main>

      {browsing && (
        <FolderBrowser
          onOpen={(path) => {
            setBrowsing(false);
            onOpen(path);
          }}
          onClose={() => {
            setBrowsing(false);
            input.current?.focus();
          }}
        />
      )}
    </div>
  );
}
