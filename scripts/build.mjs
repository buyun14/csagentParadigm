#!/usr/bin/env node
// Cross-platform build script (Windows / macOS / Linux).
// Equivalent of scripts/build.sh: install deps, build Next.js, bundle server with tsup.
import { spawnSync } from 'node:child_process';
import process from 'node:process';

function run(cmd, args) {
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
    },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('Installing dependencies...');
run('pnpm', ['install', '--prefer-frozen-lockfile', '--prefer-offline', '--loglevel', 'debug', '--reporter', 'append-only']);

console.log('Building the Next.js project...');
run('pnpm', ['next', 'build']);

console.log('Bundling server with tsup...');
run('pnpm', [
  'tsup', 'src/server.ts',
  '--format', 'cjs',
  '--platform', 'node',
  '--target', 'node20',
  '--outDir', 'dist',
  '--no-splitting',
  '--no-minify',
]);

console.log('Build completed successfully!');
