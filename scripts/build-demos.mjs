#!/usr/bin/env node
/**
 * Builds the demo trees shown on the website.
 *
 * Clones (or updates) a few public repositories into .cache/demos, exports
 * their history with the CLI and writes apps/site/public/demos/*.json.
 * Run `npm run build:cli` first.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEMOS = [
  {
    id: 'react-three-fiber',
    repo: 'https://github.com/pmndrs/react-three-fiber.git',
    description: 'A React renderer for three.js — the library drawing this tree.',
  },
  {
    id: 'express',
    repo: 'https://github.com/expressjs/express.git',
    description: 'Fast, minimalist web framework for Node.js, grown since 2009.',
  },
  {
    id: 'zustand',
    repo: 'https://github.com/pmndrs/zustand.git',
    description: 'Bear necessities for state management in React.',
  },
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, '.cache', 'demos');
const out = join(root, 'apps', 'site', 'public', 'demos');
const cli = join(root, 'packages', 'cli', 'dist', 'cli.js');

if (!existsSync(cli)) {
  console.error('The CLI is not built yet: run `npm run build:cli` first.');
  process.exit(1);
}
mkdirSync(cache, { recursive: true });
mkdirSync(out, { recursive: true });

const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, stdio: 'inherit' });

const index = [];
for (const demo of DEMOS) {
  const dir = join(cache, demo.id);
  console.log(`\n▸ ${demo.id}`);
  if (existsSync(dir)) run('git', ['fetch', '--quiet', '--prune', 'origin'], dir);
  else run('git', ['clone', '--quiet', demo.repo, dir]);

  const file = join(out, `${demo.id}.json`);
  run(process.execPath, [cli, 'export', dir, '--out', file]);

  const data = JSON.parse(readFileSync(file, 'utf8'));
  index.push({
    id: demo.id,
    name: data.name,
    description: demo.description,
    commits: data.commits.length,
    authors: data.authors.length,
    size: statSync(file).size,
    file: `/demos/${demo.id}.json`,
  });
}

writeFileSync(join(out, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
console.log(`\n✔ ${index.length} demos written to ${out}`);
