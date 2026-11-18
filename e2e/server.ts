// Starts a throwaway server for the browser tests: fresh data folder, port 8199, and the first-time setup code
// saved to a file so the tests can create the admin account. Playwright starts and stops it (playwright.config.ts).
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { E2E_DATA, SETUP_CODE_FILE } from './paths.ts';

rmSync(E2E_DATA, { recursive: true, force: true });
mkdirSync(E2E_DATA, { recursive: true });
const child = spawn(process.execPath, ['server/server.ts'], {
  env: { ...process.env, OUTLIER_DATA: E2E_DATA, OUTLIER_PORT: '8199', OUTLIER_HOST: '127.0.0.1', OUTLIER_HISTORY_DAYS: '3' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
child.stdout.on('data', (chunk: Buffer) => {
  process.stdout.write(chunk);
  const code = /setup code: (\S+)\)/.exec(chunk.toString())?.[1];
  if (code) writeFileSync(SETUP_CODE_FILE, code);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill());
child.on('exit', code => process.exit(code ?? 0));
