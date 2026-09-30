import { execFile, spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { createInterface } from 'node:readline';
import type { AuthorInfo, CommitInfo, RefInfo, RepoData } from '@code-galaxy/viewer/types';

export class GitError extends Error {}

const RECORD = '\x1e';
const FIELD = '\x1f';
const LOG_FORMAT = '%x1e%H%x1f%P%x1f%aN%x1f%aE%x1f%at%x1f%s';

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 256 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (!error) return resolve(stdout);
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return reject(new GitError('Git was not found. Install it from https://git-scm.com and try again.'));
      }
      reject(new GitError(stderr.trim() || error.message));
    });
  });
}

async function gitOptional(cwd: string, args: string[]): Promise<string | null> {
  try {
    return (await git(cwd, args)).trim();
  } catch {
    return null;
  }
}

/** Absolute path of the repository containing `path` (its Git directory for a bare repository). */
export async function findRepoRoot(path: string): Promise<string> {
  const folder = await stat(path).catch(() => null);
  if (!folder?.isDirectory()) throw new GitError(`Folder not found: ${path}`);
  const root = await gitOptional(path, ['rev-parse', '--show-toplevel']);
  if (root) return root;
  if ((await gitOptional(path, ['rev-parse', '--is-bare-repository'])) === 'true') {
    const gitDir = await gitOptional(path, ['rev-parse', '--absolute-git-dir']);
    if (gitDir) return gitDir;
  }
  throw new GitError(`No Git repository found in ${path}`);
}

interface RawCommit {
  hash: string;
  parents: string[];
  name: string;
  email: string;
  time: number;
  message: string;
  additions: number;
  deletions: number;
  files: number;
}

/** Streams `git log` so that huge histories never have to fit in one string. */
function readLog(cwd: string): Promise<RawCommit[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'git',
      [
        '-c',
        'core.quotePath=false',
        'log',
        '--branches',
        '--remotes',
        'HEAD',
        '--date-order',
        '--numstat',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        '--no-show-signature',
        `--format=${LOG_FORMAT}`,
      ],
      { cwd, windowsHide: true },
    );
    const commits: RawCommit[] = [];
    let current: RawCommit | null = null;
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error: NodeJS.ErrnoException) =>
      reject(
        error.code === 'ENOENT'
          ? new GitError('Git was not found. Install it from https://git-scm.com and try again.')
          : error,
      ),
    );

    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on('line', (line) => {
      if (line.startsWith(RECORD)) {
        const [hash, parents, name, email, time, message] = line.slice(1).split(FIELD);
        current = {
          hash,
          parents: parents ? parents.split(' ') : [],
          name: name || 'Unknown',
          email: email ?? '',
          time: Number(time) || 0,
          message: message ?? '',
          additions: 0,
          deletions: 0,
          files: 0,
        };
        commits.push(current);
        return;
      }
      if (!line || !current) return;
      // numstat: "<added>\t<deleted>\t<path>", with "-" for binary files.
      const [added, deleted] = line.split('\t', 2);
      current.files++;
      if (added !== '-') current.additions += Number(added) || 0;
      if (deleted !== '-') current.deletions += Number(deleted) || 0;
    });

    child.on('close', (code) => {
      if (code === 0) resolve(commits);
      else reject(new GitError(stderr.trim() || `git log exited with code ${code}`));
    });
  });
}

/**
 * Turns a remote URL into a commit link template, for well-known hosts only.
 * Credentials embedded in the URL are dropped: only the host and path are kept.
 */
export function commitUrlFromRemote(remote: string | null): string | null {
  if (!remote) return null;
  let host: string;
  let path: string;
  const scp = /^(?:[\w.-]+@)?([\w.-]+):(?!\/\/)(.+)$/.exec(remote);
  if (scp) {
    host = scp[1];
    path = scp[2];
  } else {
    try {
      const url = new URL(remote);
      host = url.hostname;
      path = url.pathname;
    } catch {
      return null;
    }
  }
  path = path
    .replace(/^\/+/, '')
    .replace(/\.git\/?$/, '')
    .replace(/\/+$/, '');
  if (!/^[\w.-]+(\/[\w.-]+)+$/.test(path)) return null;
  switch (host) {
    case 'github.com':
      return `https://github.com/${path}/commit/{hash}`;
    case 'gitlab.com':
      return `https://gitlab.com/${path}/-/commit/{hash}`;
    case 'bitbucket.org':
      return `https://bitbucket.org/${path}/commits/{hash}`;
    case 'codeberg.org':
      return `https://codeberg.org/${path}/commit/{hash}`;
    default:
      return null;
  }
}

async function readRefs(root: string, indexOf: Map<string, number>): Promise<RefInfo[]> {
  const output = await git(root, [
    'for-each-ref',
    `--format=%(refname)${FIELD}%(objectname)${FIELD}%(symref)`,
    'refs/heads',
    'refs/remotes',
  ]);
  const refs: RefInfo[] = [];
  for (const line of output.split('\n')) {
    if (!line) continue;
    const [refname, hash, symref] = line.split(FIELD);
    if (symref) continue; // e.g. origin/HEAD
    const commit = indexOf.get(hash);
    if (commit === undefined) continue;
    const remote = refname.startsWith('refs/remotes/');
    refs.push({ name: refname.replace(/^refs\/(heads|remotes)\//, ''), commit, remote });
  }
  return refs;
}

/** The branch drawn as the trunk: the remote default branch, else main/master, else HEAD. */
async function detectTrunk(
  root: string,
  refs: RefInfo[],
  indexOf: Map<string, number>,
  requested?: string,
): Promise<{ name: string; tip: number }> {
  const byName = new Map(refs.map((ref) => [ref.name, ref]));
  if (requested) {
    const ref = byName.get(requested) ?? byName.get(`origin/${requested}`);
    if (!ref) {
      const names = refs.filter((r) => !r.remote).map((r) => r.name);
      throw new GitError(`Branch "${requested}" not found. Local branches: ${names.join(', ') || 'none'}`);
    }
    return { name: ref.name, tip: ref.commit };
  }

  const originHead = await gitOptional(root, ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD']);
  // In a bare clone (repositories cloned from a URL), HEAD is the remote's default branch.
  const bare = (await gitOptional(root, ['rev-parse', '--is-bare-repository'])) === 'true';
  const bareHead = bare ? await gitOptional(root, ['symbolic-ref', '-q', '--short', 'HEAD']) : null;
  const candidates = [
    bareHead,
    originHead?.replace(/^origin\//, ''),
    originHead,
    'main',
    'master',
    'trunk',
    'origin/main',
    'origin/master',
  ];
  for (const name of candidates) {
    const ref = name ? byName.get(name) : undefined;
    if (ref) return { name: ref.name, tip: ref.commit };
  }

  const head = await gitOptional(root, ['rev-parse', 'HEAD']);
  const tip = head ? indexOf.get(head) : undefined;
  if (tip === undefined) throw new GitError('Could not find the current commit (HEAD).');
  const name = (await gitOptional(root, ['symbolic-ref', '-q', '--short', 'HEAD'])) || 'HEAD';
  return { name, tip };
}

export interface ReadOptions {
  /** Branch to draw as the trunk (defaults to the main branch). */
  trunk?: string;
}

/** Reads the whole history of the repository at `root`. */
export async function readRepo(root: string, options: ReadOptions = {}): Promise<RepoData> {
  if (!(await gitOptional(root, ['rev-parse', '--verify', '-q', 'HEAD']))) {
    throw new GitError('This repository has no commits yet. Make a first commit and try again.');
  }

  const raw = (await readLog(root)).reverse(); // oldest first: parents before children
  const indexOf = new Map<string, number>();
  raw.forEach((commit, i) => indexOf.set(commit.hash, i));

  // Group the identities of one person (same email or same name) under one author.
  const byEmail = new Map<string, number>();
  const byName = new Map<string, number>();
  const people: AuthorInfo[] = [];
  const authorOf = raw.map((commit) => {
    const email = commit.email.trim().toLowerCase();
    const name = commit.name.trim().toLowerCase();
    let id = email ? byEmail.get(email) : undefined;
    id ??= byName.get(name);
    if (id === undefined) {
      id = people.length;
      people.push({ name: commit.name, commits: 0 });
    }
    if (email) byEmail.set(email, id);
    byName.set(name, id);
    people[id].commits++;
    return id;
  });

  // Most active authors first: they get the most distinct colors.
  const order = people.map((_, i) => i).sort((a, b) => people[b].commits - people[a].commits);
  const rankOf = new Map(order.map((id, rank) => [id, rank]));
  const authors = order.map((id) => people[id]);

  const commits: CommitInfo[] = raw.map((commit, i) => ({
    hash: commit.hash,
    parents: commit.parents.map((p) => indexOf.get(p)).filter((p): p is number => p !== undefined),
    author: rankOf.get(authorOf[i]) ?? 0,
    time: commit.time,
    message: commit.message,
    additions: commit.additions,
    deletions: commit.deletions,
    files: commit.files,
  }));

  const refs = await readRefs(root, indexOf);
  const trunk = await detectTrunk(root, refs, indexOf, options.trunk);
  const remote = await gitOptional(root, ['remote', 'get-url', 'origin']);

  return {
    schema: 1,
    name: basename(root).replace(/\.git$/, ''),
    generatedAt: new Date().toISOString(),
    commitUrl: commitUrlFromRemote(remote),
    trunk: trunk.name,
    trunkTip: trunk.tip,
    authors,
    commits,
    refs,
  };
}

/** A cheap fingerprint of every branch tip, to notice new commits. */
export async function repoSignature(root: string): Promise<string> {
  const [refs, head] = await Promise.all([
    gitOptional(root, ['for-each-ref', '--format=%(objectname)', 'refs/heads', 'refs/remotes']),
    gitOptional(root, ['rev-parse', 'HEAD']),
  ]);
  return `${head}\n${refs}`;
}
