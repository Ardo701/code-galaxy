import type { RepoData } from '@code-galaxy/viewer';

/** A repository listed on the home screen (mirrors `RepoEntry` in src/local.ts). */
export interface RepoEntry {
  name: string;
  path: string;
  display: string;
  branch: string | null;
  empty: boolean;
  updatedAt: number;
  cloned: boolean;
  openedAt?: number;
}

export interface FolderListing {
  path: string;
  display: string;
  parent: string | null;
  isRepo: boolean;
  folders: { name: string; path: string; isRepo: boolean }[];
}

export interface CloneProgress {
  phase: string;
  percent: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', ...init });
  if (!response.ok) {
    let message = `The local server answered ${response.status}.`;
    try {
      message = ((await response.json()) as { error?: string }).error ?? message;
    } catch {
      // Not JSON: keep the generic message.
    }
    throw new ApiError(message, response.status);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

const post = <T>(path: string, body: object) =>
  request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const api = {
  /** The open repository; rejects with a 404 ApiError when none is open. */
  current: () => request<RepoData>('/api/repo.json'),
  recent: () => request<{ repos: RepoEntry[] }>('/api/recent').then((result) => result.repos),
  discover: (refresh = false) =>
    request<{ repos: RepoEntry[] }>(`/api/discover${refresh ? '?refresh' : ''}`).then((result) => result.repos),
  browse: (path?: string) => post<FolderListing>('/api/browse', { path }),
  open: (path: string) => post<{ name: string }>('/api/open', { path }),
  clone: (url: string) => post<{ name: string }>('/api/clone', { url }),
  close: () => post<void>('/api/close', {}),
};
