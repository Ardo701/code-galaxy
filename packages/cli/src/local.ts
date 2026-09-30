import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';

/** A Git repository found on this computer. */
export interface RepoEntry {
  name: string;
  path: string;
  /** Path for display, with the home folder shortened to `~`. */
  display: string;
  /** Checked-out branch, null when detached or unknown. */
  branch: string | null;
  /** The repository has no commit yet (nothing to draw). */
  empty: boolean;
  /** Last Git activity (ms since epoch). */
  updatedAt: number;
  /** Cloned by Code Galaxy from a URL. */
  cloned: boolean;
  /** When it was last opened in Code Galaxy (ms since epoch), for recent repositories. */
  openedAt?: number;
}

export interface FolderListing {
  path: string;
  display: string;
  parent: string | null;
  isRepo: boolean;
  folders: { name: string; path: string; isRepo: boolean }[];
}

/** Where Code Galaxy keeps its small state: recent repositories and cloned repositories. */
export const dataDir = () => resolve(process.env.CODE_GALAXY_HOME ?? join(homedir(), '.code-galaxy'));

export function expandHome(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2));
  return path;
}

export function tildify(path: string): string {
  const home = homedir();
  if (path === home) return '~';
  return path.startsWith(home + sep) ? `~${path.slice(home.length)}` : path;
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

/** The Git directory of a repository (work tree, linked work tree or bare), or null. */
async function gitDirOf(path: string): Promise<string | null> {
  const dotGit = join(path, '.git');
  try {
    const info = await stat(dotGit);
    if (info.isDirectory()) return dotGit;
    // Linked work trees and submodules have a `.git` file pointing to the real Git directory.
    const pointer = /^gitdir:\s*(.+)$/m.exec(await readFile(dotGit, 'utf8'));
    return pointer ? resolve(path, pointer[1].trim()) : null;
  } catch {
    // A bare repository is its own Git directory.
    return (await exists(join(path, 'HEAD'))) && (await exists(join(path, 'objects'))) ? path : null;
  }
}

/** Reads what the home screen shows about a repository, straight from its files (no Git process). */
export async function describeRepo(path: string): Promise<RepoEntry | null> {
  const gitDir = await gitDirOf(path);
  if (!gitDir) return null;
  let branch: string | null = null;
  let empty = false;
  try {
    const head = (await readFile(join(gitDir, 'HEAD'), 'utf8')).trim();
    const ref = /^ref:\s*(\S+)/.exec(head)?.[1];
    if (ref) {
      branch = ref.replace(/^refs\/heads\//, '');
      const packed = await readFile(join(gitDir, 'packed-refs'), 'utf8').catch(() => '');
      const linkedWorkTree = gitDir.includes(`${sep}worktrees${sep}`);
      empty = !linkedWorkTree && !(await exists(join(gitDir, ref))) && !packed.includes(` ${ref}\n`);
    }
  } catch {
    return null;
  }
  const times = await Promise.all(
    ['logs/HEAD', 'index', 'HEAD', 'FETCH_HEAD'].map((file) =>
      stat(join(gitDir, file)).then(
        (info) => info.mtimeMs,
        () => 0,
      ),
    ),
  );
  return {
    name: basename(path).replace(/\.git$/, ''),
    path,
    display: tildify(path),
    branch,
    empty,
    updatedAt: Math.max(...times),
    cloned: path.startsWith(dataDir() + sep),
  };
}

/** Folders never worth scanning for repositories. */
const SKIP = new Set([
  'node_modules',
  'Library',
  'Applications',
  'Movies',
  'Music',
  'Pictures',
  'Public',
  'Downloads',
  'AppData',
  'Application Data',
  'vendor',
  'venv',
  '__pycache__',
  'dist',
  'build',
  'target',
  'Pods',
  'DerivedData',
]);

/** Where to look for repositories: where the command was started, then the home folder. */
export function scanRoots(): string[] {
  if (process.env.CODE_GALAXY_SCAN_ROOT) return [resolve(process.env.CODE_GALAXY_SCAN_ROOT)];
  const home = homedir();
  const here = process.cwd();
  return here === home ? [home] : [here, home];
}

/**
 * Breadth-first search for Git repositories, bounded in depth, folder count and time
 * so the home screen stays quick even on a huge disk. Does not look inside repositories.
 */
export async function discoverRepos(
  roots: string[],
  { maxDepth = 4, maxFolders = 6000, budgetMs = 3000 } = {},
): Promise<RepoEntry[]> {
  const started = Date.now();
  const found = new Map<string, RepoEntry>();
  const seen = new Set<string>();
  const queue = roots.map((dir) => ({ dir, depth: 0 }));
  for (let i = 0; i < queue.length && seen.size < maxFolders && Date.now() - started < budgetMs; i++) {
    const { dir, depth } = queue[i];
    if (seen.has(dir)) continue;
    seen.add(dir);
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    if (entries.some((entry) => entry.name === '.git')) {
      const repo = await describeRepo(dir);
      if (repo) found.set(dir, repo);
      continue;
    }
    if (depth >= maxDepth) continue;
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.endsWith('.app') || SKIP.has(entry.name)) {
        continue;
      }
      queue.push({ dir: join(dir, entry.name), depth: depth + 1 });
    }
  }
  return [...found.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Lists the sub-folders of a folder, for the folder browser. */
export async function browse(target?: string): Promise<FolderListing> {
  // Starts in the home folder (or the test folder set by CODE_GALAXY_SCAN_ROOT).
  const dir = resolve(expandHome(target || process.env.CODE_GALAXY_SCAN_ROOT || homedir()));
  const entries = await readdir(dir, { withFileTypes: true });
  const folders = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(async (entry) => {
        const path = join(dir, entry.name);
        return { name: entry.name, path, isRepo: (await gitDirOf(path)) !== null };
      }),
  );
  folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const parent = dirname(dir);
  return {
    path: dir,
    display: tildify(dir),
    parent: parent === dir ? null : parent,
    isRepo: !!(await gitDirOf(dir)),
    folders,
  };
}

// --- Recent repositories ------------------------------------------------------

const RECENT_MAX = 12;
const recentFile = () => join(dataDir(), 'recent.json');

async function readRecent(): Promise<{ path: string; openedAt: number }[]> {
  try {
    const list: unknown = JSON.parse(await readFile(recentFile(), 'utf8'));
    return Array.isArray(list)
      ? list.filter((item) => typeof item?.path === 'string' && typeof item?.openedAt === 'number')
      : [];
  } catch {
    return [];
  }
}

/** Repositories opened recently in Code Galaxy, most recent first (missing ones are skipped). */
export async function loadRecent(): Promise<RepoEntry[]> {
  const entries = await Promise.all(
    (await readRecent()).map(async ({ path, openedAt }): Promise<RepoEntry | null> => {
      const repo = await describeRepo(path);
      return repo && { ...repo, openedAt };
    }),
  );
  return entries.filter((entry) => entry !== null);
}

export async function rememberRepo(path: string): Promise<void> {
  const list = (await readRecent()).filter((item) => item.path !== path);
  list.unshift({ path, openedAt: Date.now() });
  try {
    await mkdir(dataDir(), { recursive: true });
    await writeFile(recentFile(), JSON.stringify(list.slice(0, RECENT_MAX), null, 2));
  } catch {
    // Remembering is a convenience: never fail opening a repository because of it.
  }
}
