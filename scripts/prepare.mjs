#!/usr/bin/env node
// Cross-platform prepare script (Windows / macOS / Linux).
// Equivalent of scripts/prepare.sh: install deps, optionally fix coze bins.
import { spawnSync } from 'node:child_process';
import process from 'node:process';

function run(cmd, args, opts = {}) {
  const isWin = process.platform === 'win32';
  // Windows: pnpm resolves to pnpm.cmd which needs a shell to launch.
  // When shell:true, pass the full command as a single string to avoid
  // Node's DEP0190 "args with shell option" deprecation warning.
  const result = spawnSync(
    isWin ? [cmd, ...args].join(' ') : cmd,
    isWin ? [] : args,
    {
      stdio: 'inherit',
      shell: isWin,
      ...opts,
    },
  );
  return result;
}

console.log('Installing dependencies...');
run('pnpm', ['install', '--prefer-frozen-lockfile', '--prefer-offline', '--loglevel', 'debug', '--reporter', 'append-only']);

const probe = run('coze', ['check-bins', '--help'], { stdio: 'ignore' });
if (probe.status === 0) {
  run('coze', ['check-bins', '--fix']);
}
