import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type { RepoData } from '@code-galaxy/viewer/types';
import { CloneError, cloneOrUpdate, parseRemote } from './clone.js';
import { GitError, findRepoRoot, readRepo, repoSignature } from './git.js';
import { browse, discoverRepos, expandHome, loadRecent, rememberRepo, scanRoots, type RepoEntry } from './local.js';

/** An error caused by the request (bad path, private repository…): shown as is to the user. */
class RequestError extends Error {}

export type AppEvent =
  | { kind: 'opened'; data: RepoData; seconds: number }
  | { kind: 'commits'; added: number; latest: string }
  | { kind: 'error'; message: string };

export interface AppOptions {
  /** Watch the open repository and push new commits to the page. */
  watch: boolean;
  onEvent?: (event: AppEvent) => void;
}

export interface GalaxyApp {
  /** Opens a repository (the one given on the command line, or picked on the home screen). */
  open: (path: string, trunk?: string) => Promise<RepoData>;
  /** Handles `/api/*` requests; returns false for anything else. */
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
  dispose: () => void;
}

const DISCOVERY_TTL = 60_000;
const MAX_BODY = 64 * 1024;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY) throw new RequestError('Request too large.');
    chunks.push(chunk);
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    throw new RequestError('Invalid JSON.');
  }
}

/**
 * Only the page served by Code Galaxy may call the API. Another website open in the
 * same browser could otherwise make it clone or open repositories behind your back.
 */
function fromOurPage(req: IncomingMessage): boolean {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}`) return false;
  // JSON bodies cannot be sent cross-site without a CORS preflight, which we never grant.
  if (req.method === 'POST' && !String(req.headers['content-type']).startsWith('application/json')) return false;
  return true;
}

export function createApp({ watch, onEvent }: AppOptions): GalaxyApp {
  let current: { root: string; trunk?: string; json: string; signature: string; commits: number } | null = null;
  let ticket = 0;
  const clients = new Set<ServerResponse>();
  let discovery: { at: number; repos: Promise<RepoEntry[]> } | null = null;

  const broadcast = (event: string, payload: object) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of clients) client.write(message);
  };

  const open = async (path: string, trunk?: string) => {
    const mine = ++ticket;
    const started = performance.now();
    const root = await findRepoRoot(resolve(expandHome(path.trim())));
    const data = await readRepo(root, { trunk });
    const signature = await repoSignature(root);
    // A later request wins: opening A then quickly B must end on B.
    if (mine === ticket) {
      current = { root, trunk, json: JSON.stringify(data), signature, commits: data.commits.length };
      void rememberRepo(root);
      onEvent?.({ kind: 'opened', data, seconds: (performance.now() - started) / 1000 });
      broadcast('repo', { name: data.name });
    }
    return data;
  };

  // Poll the open repository: a new commit or a moved branch refreshes the page.
  let busy = false;
  const timer = watch
    ? setInterval(async () => {
        const repo = current;
        if (!repo || busy) return;
        busy = true;
        try {
          const signature = await repoSignature(repo.root);
          if (signature === repo.signature || repo !== current) return;
          const data = await readRepo(repo.root, { trunk: repo.trunk });
          if (repo !== current) return;
          const added = data.commits.length - repo.commits;
          current = { ...repo, json: JSON.stringify(data), signature, commits: data.commits.length };
          onEvent?.({ kind: 'commits', added, latest: data.commits[data.commits.length - 1]?.message ?? '' });
          broadcast('update', { commits: data.commits.length });
        } catch (error) {
          onEvent?.({ kind: 'error', message: (error as Error).message });
        } finally {
          busy = false;
        }
      }, 1500)
    : undefined;
  const keepAlive = setInterval(() => {
    for (const client of clients) client.write(': ping\n\n');
  }, 25_000);

  const discover = (refresh: boolean) => {
    if (refresh || !discovery || Date.now() - discovery.at > DISCOVERY_TTL) {
      discovery = { at: Date.now(), repos: discoverRepos(scanRoots()) };
    }
    return discovery.repos;
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return false;
    if (!fromOurPage(req)) {
      sendJson(res, 403, { error: 'Requests from other websites are not allowed.' });
      return true;
    }
    try {
      switch (`${req.method} ${url.pathname}`) {
        case 'GET /api/repo.json':
          if (!current) sendJson(res, 404, { error: 'No repository is open.' });
          else {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(current.json);
          }
          break;
        case 'GET /api/events':
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store',
            Connection: 'keep-alive',
          });
          res.write('retry: 2000\n\n');
          clients.add(res);
          req.on('close', () => clients.delete(res));
          break;
        case 'GET /api/recent':
          sendJson(res, 200, { repos: await loadRecent() });
          break;
        case 'GET /api/discover':
          sendJson(res, 200, { repos: await discover(url.searchParams.has('refresh')) });
          break;
        case 'POST /api/browse': {
          const { path } = await readJson(req);
          try {
            sendJson(res, 200, await browse(typeof path === 'string' ? path : undefined));
          } catch {
            throw new RequestError(`Cannot open the folder ${String(path)}.`);
          }
          break;
        }
        case 'POST /api/open': {
          const { path } = await readJson(req);
          if (typeof path !== 'string' || !path.trim()) throw new RequestError('Give the path of a folder.');
          const data = await open(path);
          sendJson(res, 200, { name: data.name });
          break;
        }
        case 'POST /api/clone': {
          const { url: address } = await readJson(req);
          const remote = typeof address === 'string' ? parseRemote(address) : null;
          if (!remote)
            throw new RequestError('This does not look like a repository address (e.g. github.com/owner/repo).');
          const path = await cloneOrUpdate(remote, (progress) => broadcast('clone-progress', progress));
          const data = await open(path);
          sendJson(res, 200, { name: data.name });
          break;
        }
        case 'POST /api/close':
          ticket++;
          current = null;
          broadcast('repo', {});
          res.writeHead(204).end();
          break;
        default:
          sendJson(res, 404, { error: 'Not found.' });
      }
    } catch (error) {
      const known = error instanceof RequestError || error instanceof GitError || error instanceof CloneError;
      if (!res.headersSent) sendJson(res, known ? 400 : 500, { error: (error as Error).message });
    }
    return true;
  };

  return {
    open,
    handle,
    dispose: () => {
      clearInterval(timer);
      clearInterval(keepAlive);
      for (const client of clients) client.end();
    },
  };
}
