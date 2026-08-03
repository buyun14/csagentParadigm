#!/usr/bin/env node
// Cross-platform production start script (Windows / macOS / Linux).
// Equivalent of scripts/start.sh: run the bundled server on DEPLOY_RUN_PORT (default 5000).
import { spawn } from 'node:child_process';
import process from 'node:process';

const PORT = process.env.DEPLOY_RUN_PORT || '5000';
console.log(`Starting HTTP service on port ${PORT} for deploy...`);

// node is a native executable on every platform; no shell wrapper needed.
const child = spawn('node', ['dist/server.js'], {
  stdio: 'inherit',
  env: { ...process.env, PORT },
});
child.on('exit', code => process.exit(code ?? 0));
