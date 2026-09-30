import { Galaxy, GalaxyLoader, type RepoData } from '@code-galaxy/viewer';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, type CloneProgress } from './api';
import { Home } from './Home';

type View = { kind: 'starting' } | { kind: 'home' } | { kind: 'viewer'; data: RepoData };

/** A long operation in progress (reading a big history, cloning). */
interface Busy {
  label: string;
  progress?: number;
  detail?: string;
}

const folderName = (path: string) =>
  path
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .pop() || path;

export function App() {
  const [view, setView] = useState<View>({ kind: 'starting' });
  const [busy, setBusy] = useState<Busy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string; count: number } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const busyRef = useRef(false);

  /** Shows the repository open on the server, or the home screen when none is. */
  const showCurrent = useCallback(async () => {
    try {
      const data = await api.current();
      const before = viewRef.current;
      if (
        before.kind === 'viewer' &&
        before.data.name === data.name &&
        data.commits.length > before.data.commits.length
      ) {
        const latest = data.commits[data.commits.length - 1];
        setToast({ id: Date.now(), text: latest.message, count: data.commits.length - before.data.commits.length });
      }
      document.title = `${data.name} · Code Galaxy`;
      setView({ kind: 'viewer', data });
    } catch (reason) {
      if (!(reason instanceof ApiError && reason.status === 404)) setError((reason as Error).message);
      document.title = 'Code Galaxy';
      setView({ kind: 'home' });
    }
  }, []);

  useEffect(() => {
    void showCurrent();
    // The CLI pushes events: new commits, another tab opening a repository, clone progress.
    const events = new EventSource('/api/events');
    events.addEventListener('update', () => void showCurrent());
    events.addEventListener('repo', () => {
      if (!busyRef.current) void showCurrent();
    });
    events.addEventListener('clone-progress', (event) => {
      const progress = JSON.parse((event as MessageEvent<string>).data) as CloneProgress;
      setBusy((current) => current && { ...current, progress: progress.percent, detail: progress.phase });
    });
    return () => events.close();
  }, [showCurrent]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const run = async (state: Busy, action: () => Promise<unknown>) => {
    busyRef.current = true;
    setBusy(state);
    setError(null);
    try {
      await action();
      await showCurrent();
    } catch (reason) {
      setError((reason as Error).message);
      setView({ kind: 'home' });
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const openRepo = (path: string) => run({ label: `Reading ${folderName(path)}…` }, () => api.open(path));
  const cloneRepo = (url: string, label: string) =>
    run({ label: `Cloning ${label.split('/').slice(1).join('/') || label}…`, progress: 0, detail: 'Connecting' }, () =>
      api.clone(url),
    );
  const goHome = () => {
    setError(null);
    document.title = 'Code Galaxy';
    setView({ kind: 'home' });
    void api.close().catch(() => undefined);
  };

  if (busy) return <GalaxyLoader label={busy.label} progress={busy.progress} detail={busy.detail} />;
  if (view.kind === 'starting') return <GalaxyLoader label="Starting…" />;
  if (view.kind === 'home') return <Home onOpen={openRepo} onClone={cloneRepo} error={error} />;

  return (
    <Galaxy data={view.data} autoFocus onBack={goHome} backLabel="Repositories">
      {toast && (
        <div key={toast.id} className="app-toast cg-panel cg-enter" role="status">
          <span className="app-toast-text">
            <b>{toast.count > 1 ? `${toast.count} new commits` : 'New commit'}</b> · {toast.text}
          </span>
        </div>
      )}
    </Galaxy>
  );
}
