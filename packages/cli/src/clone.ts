import { spawn } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { dataDir } from './local.js';

export class CloneError extends Error {}

export interface Remote {
  /** URL given to `git clone`. */
  url: string;
  host: string;
  owner: string;
  name: string;
}

export interface CloneProgress {
  phase: string;
  /** Overall progress in [0, 100]. */
  percent: number;
}

const SEGMENT = /^[\w.-]+$/;

/** Path segments that start a page of the repository rather than its name. */
const PAGES = new Set(['-', 'tree', 'blob', 'commit', 'commits', 'archive', 'releases']);
const BITBUCKET_PAGES = new Set([...PAGES, 'src', 'get']);

/**
 * Understands what people paste: `owner/repo` (GitHub), `github.com/owner/repo`,
 * an https URL (even a link to a file or a tree) or an SSH address like
 * `git@github.com:owner/repo.git`. Anything else is refused, so a URL can never
 * smuggle options or a local transport into `git clone`.
 */
export function parseRemote(input: string): Remote | null {
  const text = input.trim().replace(/\/+$/, '');
  let host: string;
  let parts: string[];
  let ssh = false;

  const scp = /^git@([\w.-]+):(.+)$/.exec(text);
  if (scp) {
    host = scp[1];
    parts = scp[2].split('/');
    ssh = true;
  } else if (/^[\w.-]+\/[\w.-]+$/.test(text)) {
    host = 'github.com';
    parts = text.split('/');
  } else {
    let url: URL;
    try {
      url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
    } catch {
      return null;
    }
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    host = url.hostname;
    parts = url.pathname.split('/').filter(Boolean);
  }

  if (!host.includes('.') || parts.length < 2) return null;
  // Links to a page or a download of the repository (/tree/main, /-/blob/…, /archive/main.zip) still point to the
  // repository itself: a ZIP has no history, so the repository is cloned instead.
  const markers = host === 'bitbucket.org' ? BITBUCKET_PAGES : PAGES;
  const cut = parts.findIndex((part) => markers.has(part));
  const path = (cut > 1 ? parts.slice(0, cut) : host === 'github.com' ? parts.slice(0, 2) : parts).map((part) =>
    part.replace(/\.git$/, ''),
  );
  if (path.length < 2 || !path.every((part) => SEGMENT.test(part) && !part.startsWith('.'))) return null;

  const owner = path.slice(0, -1).join('/');
  const name = path[path.length - 1];
  const url = ssh ? `git@${host}:${path.join('/')}.git` : `https://${host}/${path.join('/')}.git`;
  return { url, host, owner, name };
}

/** Where a remote is cloned: ~/.code-galaxy/repos/<host>/<owner>/<name>.git */
export const clonePath = (remote: Remote) =>
  join(dataDir(), 'repos', remote.host, ...remote.owner.split('/'), `${remote.name}.git`);

/** Maps git's progress lines to one overall percentage. */
const PHASES: Record<string, [number, number]> = {
  'Counting objects': [0, 3],
  'Compressing objects': [3, 6],
  'Receiving objects': [6, 85],
  'Resolving deltas': [85, 100],
};

function runGit(args: string[], onProgress: (progress: CloneProgress) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      windowsHide: true,
      env: {
        ...process.env,
        // Never wait for a password in a terminal nobody is looking at: fail with a clear error instead.
        GIT_TERMINAL_PROMPT: '0',
        GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? 'ssh -o BatchMode=yes',
      },
    });
    let errors = '';
    let lastSent = 0;
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      errors = (errors + text).slice(-4000);
      for (const line of text.split(/[\r\n]+/)) {
        const match = /(Counting objects|Compressing objects|Receiving objects|Resolving deltas):\s+(\d+)%/.exec(line);
        if (!match) continue;
        const [from, to] = PHASES[match[1]];
        const now = Date.now();
        if (now - lastSent < 100 && Number(match[2]) < 100) continue;
        lastSent = now;
        onProgress({ phase: match[1], percent: Math.round(from + ((to - from) * Number(match[2])) / 100) });
      }
    });
    child.on('error', (error: NodeJS.ErrnoException) =>
      reject(
        error.code === 'ENOENT' ? new CloneError('Git was not found. Install it from https://git-scm.com.') : error,
      ),
    );
    child.on('close', (code) => {
      if (code === 0) return resolve();
      if (/not found|could not read Username|Authentication failed|Permission denied|access denied/i.test(errors)) {
        reject(
          new CloneError(
            'Repository not found, or it is private and Git on this computer has no access to it. ' +
              'If you can `git clone` it yourself, it will work here too.',
          ),
        );
      } else {
        reject(new CloneError(errors.trim().split('\n').pop() || `git exited with code ${code}`));
      }
    });
  });
}

/**
 * Clones a remote into Code Galaxy's cache (or fetches it again when already there)
 * and returns its path. Clones are bare: only the history is needed, not the files.
 */
export async function cloneOrUpdate(remote: Remote, onProgress: (progress: CloneProgress) => void): Promise<string> {
  const target = clonePath(remote);
  const alreadyThere = await stat(join(target, 'HEAD')).then(
    () => true,
    () => false,
  );
  onProgress({ phase: alreadyThere ? 'Fetching new commits' : 'Connecting', percent: 0 });
  if (alreadyThere) {
    await runGit(['-C', target, 'fetch', '--prune', '--progress', 'origin'], onProgress);
  } else {
    await mkdir(dirname(target), { recursive: true });
    await runGit(['clone', '--bare', '--progress', '--', remote.url, target], onProgress);
    // Keep every branch of the remote as a local branch, so later fetches update them all.
    await runGit(['-C', target, 'config', 'remote.origin.fetch', '+refs/heads/*:refs/heads/*'], onProgress);
  }
  onProgress({ phase: 'Reading history', percent: 100 });
  return target;
}
