#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, styleText } from 'node:util';
import { createApp } from './app.js';
import { GitError, findRepoRoot, readRepo } from './git.js';
import { startServer } from './server.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

const HELP = `
${styleText('bold', 'Code Galaxy')} ${styleText('dim', `v${version}`)}
Grow your Git history into an interactive 3D tree.

${styleText('bold', 'Usage')}
  code-galaxy [path]                 Open the tree of the repository at path
                                     (default: this folder, or a repository picker)
  code-galaxy export [path] [-o file] Save the history as a .galaxy.json file

${styleText('bold', 'Options')}
  -p, --port <number>    Port of the local server (default: 3141)
  -t, --trunk <branch>   Branch drawn as the trunk (default: the main branch)
      --no-open          Do not open the browser
      --no-watch         Do not update the tree when new commits are made
  -o, --out <file>       Output file for export
  -h, --help             Show this help
  -v, --version          Show the version

Everything runs on your machine: your code never leaves it.
`;

const ok = (text: string) => console.log(`  ${styleText('green', '✔')} ${text}`);
const info = (text: string) => console.log(`  ${styleText('dim', text)}`);

function openBrowser(url: string) {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url]]
        : ['xdg-open', [url]];
  const child = spawn(command, args, { stdio: 'ignore', detached: true, windowsVerbatimArguments: true });
  child.on('error', () => info(`Open ${url} in your browser.`));
  child.unref();
}

function summary(data: Awaited<ReturnType<typeof readRepo>>, seconds: number) {
  const n = new Intl.NumberFormat('en-US');
  return `Read ${styleText('bold', n.format(data.commits.length))} commits · ${n.format(data.refs.length)} branches · ${n.format(data.authors.length)} authors ${styleText('dim', `(${seconds.toFixed(1)}s)`)}`;
}

async function exportCommand(path: string, out: string | undefined, trunk: string | undefined) {
  const root = await findRepoRoot(path);
  const started = performance.now();
  const data = await readRepo(root, { trunk });
  ok(summary(data, (performance.now() - started) / 1000));
  const file = resolve(out ?? `${data.name}.galaxy.json`);
  const json = JSON.stringify(data);
  await writeFile(file, json);
  ok(`Saved ${styleText('cyan', file)} ${styleText('dim', `(${(json.length / 1024 / 1024).toFixed(1)} MB)`)}`);
}

async function serveCommand(
  path: string | undefined,
  options: { port: number; open: boolean; watch: boolean; trunk?: string },
) {
  const webRoot = fileURLToPath(new URL('./web/', import.meta.url));
  if (!existsSync(webRoot)) throw new Error('The viewer is missing from this build. Run `npm run build` first.');

  const app = createApp({
    watch: options.watch,
    onEvent: (event) => {
      if (event.kind === 'opened') ok(`${styleText('bold', event.data.name)} · ${summary(event.data, event.seconds)}`);
      else if (event.kind === 'commits') {
        const count = `${event.added} new commit${event.added > 1 ? 's' : ''}`;
        ok(event.added > 0 ? `${count}: ${styleText('dim', event.latest)}` : 'Branches updated');
      } else info(`Could not refresh: ${event.message}`);
    },
  });

  if (path !== undefined) {
    // A folder given explicitly must be a repository.
    await app.open(path, options.trunk);
  } else {
    // In a repository: show it right away. Anywhere else: let the user pick one in the browser.
    await app.open('.', options.trunk).catch((error: unknown) => {
      if (!(error instanceof GitError)) throw error;
      info('No Git repository here: pick one in your browser.');
    });
  }

  const server = await startServer({ webRoot, port: options.port, app });
  console.log(
    `\n  ${styleText('magenta', '➜')}  ${styleText('bold', 'Code Galaxy')} is growing at ${styleText('cyan', server.url)}\n`,
  );
  if (options.open) openBrowser(server.url);
  info(options.watch ? 'Watching for new commits. Press Ctrl+C to stop.' : 'Press Ctrl+C to stop.');

  const stop = async () => {
    await server.close();
    console.log(`\n  ${styleText('dim', 'Stopped.')}`);
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    allowNegative: true,
    options: {
      port: { type: 'string', short: 'p', default: '3141' },
      trunk: { type: 'string', short: 't' },
      open: { type: 'boolean', default: true },
      watch: { type: 'boolean', default: true },
      out: { type: 'string', short: 'o' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });

  if (values.help) return console.log(HELP);
  if (values.version) return console.log(version);

  const [first, second] = positionals;
  if (first === 'export') return exportCommand(second ?? '.', values.out, values.trunk);

  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid port: ${values.port}`);
  console.log(`\n  ${styleText('bold', 'Code Galaxy')} ${styleText('dim', `v${version}`)}\n`);
  await serveCommand(first, { port, open: values.open, watch: values.watch, trunk: values.trunk });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n  ${styleText('red', '✖')} ${message}\n`);
  const code = (error as { code?: string }).code;
  if (!(error instanceof GitError) && code?.startsWith('ERR_PARSE_ARGS')) console.error(HELP);
  process.exit(1);
});
