#!/usr/bin/env node
// Cross-platform validate launcher (Windows / macOS / Linux).
// Equivalent of scripts/validate.sh: run pnpm validate.
import { spawnSync } from 'node:child_process';
import process from 'node:process';

console.log('🔍 Running validate...');
const isWin = process.platform === 'win32';
const result = spawnSync(
  isWin ? 'pnpm validate' : 'pnpm',
  isWin ? [] : ['validate'],
  {
    stdio: 'inherit',
    shell: isWin,
  },
);
console.log(result.status === 0 ? '✅ Validate passed!' : '❌ Validate failed.');
process.exit(result.status ?? 1);
