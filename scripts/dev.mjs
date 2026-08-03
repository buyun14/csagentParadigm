#!/usr/bin/env node
// Cross-platform dev launcher (Windows / macOS / Linux).
// Equivalent of scripts/dev.sh without bash-specific tools (ss/awk/xargs).
import { spawn, execSync } from 'node:child_process';
import process from 'node:process';

const PORT = process.env.DEPLOY_RUN_PORT || process.env.PORT || '5000';

/** Find PIDs listening on the given TCP port. */
function findPidsOnPort(port) {
  if (process.platform === 'win32') {
    // netstat -ano output:  Proto  Local Address  Foreign Address  State  PID
    let out = '';
    try {
      out = execSync('netstat -ano', { encoding: 'utf8' });
    } catch {
      return [];
    }
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) continue;
      const [proto, local, , state, pid] = parts;
      if (
        proto.toUpperCase() === 'TCP' &&
        state.toUpperCase() === 'LISTENING' &&
        local.endsWith(`:${port}`) &&
        /^\d+$/.test(pid)
      ) {
        pids.add(pid);
      }
    }
    return [...pids];
  }
  // Unix: lsof -ti :port
  try {
    const out = execSync(`lsof -ti:${port}`, { encoding: 'utf8' });
    return out.split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}

/** Force-kill a list of PIDs (best effort). */
function killPids(pids) {
  for (const pid of pids) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      } else {
        execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
      }
      console.log(`  Port ${PORT} in use by PID ${pid} — killed.`);
    } catch {
      console.warn(`  Warning: failed to kill PID ${pid}`);
    }
  }
}

const pids = findPidsOnPort(PORT);
if (pids.length > 0) {
  console.log(`Port ${PORT} in use by PIDs: ${pids.join(', ')} (SIGKILL)`);
  killPids(pids);
  await new Promise(resolve => setTimeout(resolve, 1000));
  const still = findPidsOnPort(PORT);
  if (still.length > 0) {
    console.warn(`Warning: port ${PORT} still busy after SIGKILL, PIDs: ${still.join(', ')}`);
  } else {
    console.log(`Port ${PORT} cleared.`);
  }
} else {
  console.log(`Port ${PORT} is free.`);
}

console.log(`Starting HTTP service on port ${PORT} for dev...`);
const isWin = process.platform === 'win32';
// Windows: pnpm resolves to pnpm.cmd which needs a shell to launch.
const child = spawn(
  isWin ? 'pnpm tsx watch src/server.ts' : 'pnpm',
  isWin ? [] : ['tsx', 'watch', 'src/server.ts'],
  {
    stdio: 'inherit',
    env: { ...process.env, PORT },
    shell: isWin,
  },
);
child.on('exit', code => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (!child.killed) child.kill(sig);
  });
}
