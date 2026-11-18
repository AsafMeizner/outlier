// Builds release/outlier-offline-<date>.zip: everything needed to run, rebuild and change Outlier on a network
// with no internet. Run it on a Windows machine that has the vendor files (see below):
//
//   node tools/build-bundle.ts [--docker path/to/outlier-image.tar.gz]
//
// It needs, in vendor-dl/ (not in git):
//   win/node-v24.22.3-win-x64/            Node.js for Windows, unpacked
//   node-v24.22.3-linux-x64.tar.xz         Node.js for Linux, as downloaded from nodejs.org
//   npm/*.tgz                              the Linux builds of the native packages in node_modules
//                                          (npm pack @rolldown/binding-linux-x64-gnu@<v> lightningcss-linux-x64-gnu@<v>)
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync, readFileSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const NODE_VERSION = 'v24.22.3';
const VENDOR = join(ROOT, 'vendor-dl');
const WIN_NODE = join(VENDOR, 'win', `node-${NODE_VERSION}-win-x64`);
const LINUX_NODE = join(VENDOR, `node-${NODE_VERSION}-linux-x64.tar.xz`);
const NPM_DIR = join(VENDOR, 'npm');

const args = process.argv.slice(2);
const dockerArg = args.includes('--docker') ? args[args.indexOf('--docker') + 1] : undefined;
const date = new Date().toISOString().slice(0, 10);
const NAME = `outlier-offline-${date}`;
const OUT = join(ROOT, 'release');
const STAGE = join(OUT, NAME);
const APP = join(STAGE, 'outlier');

const tarExe = process.platform === 'win32' ? join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
function run(cmd: string, argv: string[], cwd = ROOT): void {
  const r = spawnSync(cmd, argv, { cwd, stdio: 'inherit' });
  if (r.status !== 0) { console.error(`\nFailed: ${cmd} ${argv.join(' ')}`); process.exit(1); }
}
function need(path: string, what: string): void { if (!existsSync(path)) { console.error(`Missing ${what}: ${path}`); process.exit(1); } }
const sha256 = (file: string): Promise<string> => new Promise((ok, fail) => {
  const h = createHash('sha256'); createReadStream(file).on('data', d => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', fail);
});

need(WIN_NODE, 'Node.js for Windows (unpacked)');
need(LINUX_NODE, 'Node.js for Linux (.tar.xz)');
need(NPM_DIR, 'Linux native packages (vendor-dl/npm)');
if (dockerArg) need(dockerArg, 'Docker image');

console.log('1/5  Checking the question bank and building the web app');
run(process.execPath, ['tools/validate-bank.ts']);
run(process.execPath, ['node_modules/vite/bin/vite.js', 'build']);

console.log('2/5  Copying the source, the build and node_modules');
rmSync(STAGE, { recursive: true, force: true });
mkdirSync(APP, { recursive: true });
const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\0').filter(Boolean);
for (const f of tracked) { if (!existsSync(join(ROOT, f))) continue; mkdirSync(dirname(join(APP, f)), { recursive: true }); cpSync(join(ROOT, f), join(APP, f)); }
cpSync(join(ROOT, '.git'), join(APP, '.git'), { recursive: true });
cpSync(join(ROOT, 'dist', 'web'), join(APP, 'dist', 'web'), { recursive: true });
cpSync(join(ROOT, 'node_modules'), join(APP, 'node_modules'), { recursive: true });
// Linux builds of the native packages, so the web app can be rebuilt on Linux too
for (const tgz of readdirSync(NPM_DIR).filter(f => f.endsWith('.tgz'))) {
  const pkg = JSON.parse(spawnSync(tarExe, ['-xzOf', join(NPM_DIR, tgz), 'package/package.json'], { encoding: 'utf8' }).stdout) as { name: string };
  const dest = join(APP, 'node_modules', ...pkg.name.split('/'));
  mkdirSync(dest, { recursive: true });
  run(tarExe, ['-xzf', join(NPM_DIR, tgz), '-C', dest, '--strip-components=1']);
}

console.log('3/5  Adding Node.js for Windows and Linux');
cpSync(WIN_NODE, join(STAGE, 'runtime', 'win-x64'), { recursive: true });
cpSync(LINUX_NODE, join(STAGE, 'runtime', basename(LINUX_NODE)));
if (dockerArg) { mkdirSync(join(STAGE, 'docker'), { recursive: true }); cpSync(dockerArg, join(STAGE, 'docker', 'outlier-image.tar.gz')); }
// The Helm chart, next to the image it deploys (it is also in outlier/deploy/helm)
cpSync(join(ROOT, 'deploy', 'helm', 'outlier'), join(STAGE, 'kubernetes', 'outlier'), { recursive: true });

console.log('4/5  Writing start scripts and instructions');
writeFileSync(join(STAGE, 'start-windows.bat'), [
  '@echo off',
  'rem Starts Outlier with the bundled Node.js. Close this window or press Ctrl+C to stop it.',
  'rem Admin commands work too, for example:  start-windows.bat reset-password dana',
  'cd /d "%~dp0outlier"',
  `"%~dp0runtime\\win-x64\\node.exe" server\\server.ts %*`,
  'if "%~1"=="" pause',
  '',
].join('\r\n'));
writeFileSync(join(STAGE, 'start-linux.sh'), [
  '#!/bin/sh',
  '# Starts Outlier with the bundled Node.js (Linux x64). Press Ctrl+C to stop it.',
  '# Admin commands work too, for example:  sh start-linux.sh reset-password dana',
  'cd "$(dirname "$0")" || exit 1',
  'RT="$PWD/runtime/linux-x64"',
  'if [ ! -x "$RT/bin/node" ]; then',
  '  echo "Unpacking Node.js (first run only)..."',
  `  mkdir -p "$RT" && tar -xJf runtime/node-${NODE_VERSION}-linux-x64.tar.xz -C "$RT" --strip-components=1 || exit 1`,
  'fi',
  'cd outlier || exit 1',
  'exec "$RT/bin/node" server/server.ts "$@"',
  '',
].join('\n'));
if (dockerArg) writeFileSync(join(STAGE, 'docker', 'docker-compose.yml'), [
  '# docker load -i outlier-image.tar.gz   (once), then:  docker compose up -d',
  'services:',
  '  outlier:',
  '    image: outlier:offline',
  '    ports:',
  '      - "8080:8080"',
  '    environment:',
  '      TZ: Asia/Jerusalem   # the new daily puzzle starts at midnight in this time zone',
  '    volumes:',
  '      - outlier-data:/data',
  '    restart: unless-stopped',
  'volumes:',
  '  outlier-data: {}',
  '',
].join('\n'));
const prompts = readdirSync(join(ROOT, 'bank', 'packs')).filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(readFileSync(join(ROOT, 'bank', 'packs', f), 'utf8')) as { prompts: Array<{ text: string }> });
const count = prompts.reduce((n, p) => n + p.prompts.length, 0);
const he = prompts.reduce((n, p) => n + p.prompts.filter(q => /[\u05D0-\u05EA]/.test(q.text)).length, 0);
writeFileSync(join(STAGE, 'README.txt'), readFileSync(join(ROOT, 'tools', 'offline-readme.txt'), 'utf8')
  .replaceAll('{DATE}', date).replaceAll('{NODE}', NODE_VERSION).replaceAll('{PROMPTS}', String(count))
  .replaceAll('{EN}', String(count - he)).replaceAll('{HE}', String(he)).replaceAll('{DOCKER}', dockerArg ? 'yes' : 'no')
  .replace(/\r?\n/g, '\r\n'));

console.log('5/5  Zipping');
const sums: string[] = [];
for (const f of ['start-windows.bat', 'start-linux.sh', `runtime/${basename(LINUX_NODE)}`, 'runtime/win-x64/node.exe', ...(dockerArg ? ['docker/outlier-image.tar.gz'] : [])])
  sums.push(`${await sha256(join(STAGE, f))}  ${f}`);
writeFileSync(join(STAGE, 'SHA256SUMS.txt'), sums.join('\n') + '\n');
const zip = join(OUT, `${NAME}.zip`);
rmSync(zip, { force: true });
if (process.platform === 'win32') run(tarExe, ['-a', '-cf', zip, '-C', OUT, NAME]);
else run('zip', ['-qr', zip, NAME], OUT);
console.log(`\nDone: ${zip} (${(statSync(zip).size / 1024 / 1024).toFixed(0)} MB, ${count} prompts)`);
