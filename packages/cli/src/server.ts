import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import type { GalaxyApp } from './app.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webp': 'image/webp',
};

/** Only answer to this machine: 127.0.0.1 and localhost (also blocks DNS rebinding). */
const HOST = '127.0.0.1';

export interface GalaxyServer {
  url: string;
  close: () => Promise<void>;
}

export interface ServerOptions {
  webRoot: string;
  port: number;
  /** Answers the `/api/*` requests. */
  app: GalaxyApp;
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      resolvePort(typeof address === 'object' && address ? address.port : port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, HOST);
  });
}

export async function startServer({ webRoot, port, app }: ServerOptions): Promise<GalaxyServer> {
  const root = resolve(webRoot);
  let actualPort = port;

  const allowedHosts = () => new Set([`127.0.0.1:${actualPort}`, `localhost:${actualPort}`]);

  const serveStatic = async (pathname: string, res: ServerResponse) => {
    let file = resolve(root, `.${decodeURIComponent(pathname)}`);
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    if (file === root || !extname(file)) file = resolve(root, 'index.html');
    try {
      const body = await readFile(file);
      const immutable = file.includes(`${sep}assets${sep}`);
      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    }
  };

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    if (!req.headers.host || !allowedHosts().has(req.headers.host)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Forbidden host');
      return;
    }
    if (await app.handle(req, res)) return;
    const { pathname } = new URL(req.url ?? '/', `http://${req.headers.host}`);

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    await serveStatic(pathname, res);
  };

  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  // Try the next ports when the preferred one is taken.
  for (let attempt = 0; ; attempt++) {
    try {
      actualPort = await listen(server, port + attempt);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE' || attempt >= 20) throw error;
    }
  }

  return {
    url: `http://localhost:${actualPort}`,
    close: () =>
      new Promise((done) => {
        app.dispose();
        server.close(() => done());
        server.closeAllConnections();
      }),
  };
}
