#!/usr/bin/env node
/*
 * Runs `prisma migrate deploy` against DATABASE_URL using the prisma CLI
 * resolved from THIS package's own node_modules — no npx download, no
 * assumptions about how the package manager hoists binaries (.bin layout
 * differs between npm / pnpm / pnpm-deploy trees).
 *
 * Used by the api container entrypoint (see docker-compose.yml / render.yaml):
 *   node scripts/migrate.js && node dist/apps/api/src/main.js
 *
 * Works both from the repo checkout (apps/api/) and from the pruned
 * production layout produced by `pnpm deploy` (where cwd === package root).
 */
'use strict';

const { spawn } = require('child_process');
const path = require('path');

function findPrismaCli() {
  // require.resolve walks up node_modules from this file, so it finds the
  // locally installed prisma package wherever pnpm materialized it.
  return require.resolve('prisma/build/index.js');
}

const cli = (() => {
  try {
    return findPrismaCli();
  } catch (err) {
    console.error('[migrate] Could not resolve the local prisma CLI:', err.message);
    console.error('[migrate] Is `prisma` installed for @og/api (devDependencies)?');
    process.exit(1);
  }
})();

if (!process.env.DATABASE_URL) {
  console.error('[migrate] DATABASE_URL is not set.');
  process.exit(1);
}

console.log(`[migrate] running: prisma migrate deploy (cli: ${path.relative(process.cwd(), cli)})`);

const child = spawn(process.execPath, [cli, 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: process.env,
  cwd: process.cwd(),
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
