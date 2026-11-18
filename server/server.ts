#!/usr/bin/env node
// Outlier server + admin command line. Runs on Node 24 directly (TypeScript types are stripped at load).
//
//   node server/server.ts                          start the server
//   node server/server.ts import <file> [--update]  add questions from a .json/.txt/.csv pack
//   node server/server.ts reset-password <user>    print a new temporary password
//   node server/server.ts make-admin <user>        give a user admin rights
//   node server/server.ts backup <file.db>         write a consistent copy of the database
import { createServer as createHttp, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createHttps } from 'node:https';
import { readFileSync, existsSync, readdirSync, statSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, resolve, extname, normalize as normPath, sep } from 'node:path';
import { networkInterfaces } from 'node:os';
import { openDb } from './db.ts';
import { createApp } from './app.ts';
import { clientIp, trustProxy } from './proxy.ts';
import { hashPassword, tempPassword } from './auth.ts';
import type { UserRow, Count } from './rows.ts';

const ROOT = resolve(import.meta.dirname, '..');
const WEB = join(ROOT, 'dist', 'web');

interface Config { port: number; host: string; dataDir: string; tlsCert: string; tlsKey: string }

function loadConfig(): Config {
  const file = join(ROOT, 'config.json');
  let c: Partial<Record<keyof Config, unknown>> = {};
  if (existsSync(file)) {
    try { c = JSON.parse(readFileSync(file, 'utf8')) as typeof c; }
    catch (e) { console.error(`config.json is not valid JSON: ${(e as Error).message}`); process.exit(1); }
  }
  const env = process.env;
  const s = (v: unknown): string => (typeof v === 'string' ? v : '');
  return {
    port: Number(env['OUTLIER_PORT'] || c.port || 8080),
    host: env['OUTLIER_HOST'] || s(c.host) || '0.0.0.0',
    dataDir: resolve(ROOT, env['OUTLIER_DATA'] || s(c.dataDir) || 'data'),
    tlsCert: env['OUTLIER_TLS_CERT'] || s(c.tlsCert),
    tlsKey: env['OUTLIER_TLS_KEY'] || s(c.tlsKey),
  };
}

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });
const logFile = join(config.dataDir, 'outlier.log');
const log = (msg: string): void => {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  try { appendFileSync(logFile, line + '\n'); } catch { /* the log file is best effort */ }
};

const db = openDb(join(config.dataDir, 'outlier.db'));
const secure = !!(config.tlsCert && config.tlsKey);
// Behind a reverse proxy that terminates HTTPS (a Kubernetes Ingress, ...): mark cookies Secure, and read the client
// address from X-Forwarded-For when the request comes from a trusted proxy (see server/proxy.ts).
const secureCookies = secure || process.env['OUTLIER_SECURE_COOKIES'] === '1';
const trusted = trustProxy(process.env['OUTLIER_TRUST_PROXY']);
const app = createApp({ db, secure: secureCookies, log });

// Starter packs (bank/packs) are imported once per file, so packs shipped in an update reach existing servers on the
// next start. The list of imported files lives in the settings table under "starterPacks". Prompts already in the
// bank (same text) are skipped, and a file is never imported twice, so admins' edits and deletions stay.
function importStarterBank(): void {
  const dir = join(ROOT, 'bank', 'packs');
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter(n => /.(json|txt|csv)$/i.test(n)).sort();
  const row = db.get<{ value: string }>("SELECT value FROM settings WHERE key='starterPacks'");
  const done = new Set<string>(row ? (JSON.parse(row.value) as string[]) : []);
  // A server from before this list existed: a file counts as imported if any of its prompts is already in the bank.
  const untracked = !row && !!db.get<Count>('SELECT COUNT(*) AS n FROM prompts WHERE owner_id IS NULL')?.n;
  for (const f of files) {
    if (done.has(f)) continue;
    try {
      const text = readFileSync(join(dir, f), 'utf8');
      if (untracked && app.importPack(text, f, { dryRun: true }).skipped > 0) { done.add(f); continue; }
      const r = app.importPack(text, f);
      log(`Imported starter pack ${f}: ${r.added} prompts${r.skipped ? `, ${r.skipped} already in the bank` : ''}${r.errors.length ? `, ${r.errors.length} errors` : ''}`);
      for (const e of r.errors) log(`  ${e}`);
      done.add(f);
    } catch (e) { log(`Skipped starter pack ${f}: ${(e as Error).message}`); }
  }
  db.run("INSERT INTO settings(key,value) VALUES('starterPacks',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify([...done].sort()));
}

// ---------- CLI ----------
const [cmd, ...args] = process.argv.slice(2);
if (cmd && cmd !== 'start') {
  const userArg = (): UserRow => {
    const u = db.get<UserRow>('SELECT * FROM users WHERE username=?', args[0] ?? '');
    if (!u) { console.error(`No user called "${args[0] ?? ''}"`); process.exit(1); }
    return u;
  };
  if (cmd === 'import') {
    const file = args[0];
    if (!file) { console.error('Usage: import <file> [--update]'); process.exit(1); }
    const r = app.importPack(readFileSync(resolve(file), 'utf8'), file, { mode: args.includes('--update') ? 'update' : 'skip' });
    console.log(`Added ${r.added}, updated ${r.updated}, skipped ${r.skipped} (already in the bank)`);
    for (const e of r.errors) console.log(`  ERROR ${e}`);
    process.exit(r.errors.length ? 1 : 0);
  } else if (cmd === 'reset-password') {
    const u = userArg(), pw = tempPassword();
    db.run('UPDATE users SET pass_hash=?, must_change=1, disabled=0 WHERE id=?', hashPassword(pw), u.id);
    db.run('DELETE FROM sessions WHERE user_id=?', u.id);
    console.log(`Temporary password for ${u.username}: ${pw}\n(They will be asked to choose a new one.)`);
  } else if (cmd === 'make-admin') {
    const u = userArg();
    db.run("UPDATE users SET role='admin', disabled=0 WHERE id=?", u.id);
    console.log(`${u.username} is now an admin.`);
  } else if (cmd === 'backup') {
    const out = resolve(args[0] ?? `outlier-backup-${app.today()}.db`);
    if (existsSync(out)) { console.error(`${out} already exists`); process.exit(1); }
    db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
    console.log(`Backup written to ${out}`);
  } else {
    console.error(`Unknown command "${cmd}". Commands: start, import, reset-password, make-admin, backup`);
    process.exit(1);
  }
  db.close();
  process.exit(0);
}

// ---------- HTTP ----------
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};
const SECURITY: Record<string, string> = {
  // Nothing loads from outside this server: the game works on an air-gapped network.
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function send(res: ServerResponse, status: number, headers: Record<string, string>, body?: string | Buffer): void {
  res.writeHead(status, { ...SECURITY, ...headers });
  res.end(body);
}

function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): void {
  if (!existsSync(join(WEB, 'index.html'))) return send(res, 503, { 'Content-Type': 'text/plain; charset=utf-8' }, 'The web app is not built. Run "npm run build".');
  const rel = pathname === '/' ? '/index.html' : pathname;
  let file: string;
  try { file = normPath(join(WEB, decodeURIComponent(rel))); } catch { return send(res, 400, {}, 'Bad path'); }
  if (!file.startsWith(WEB + sep)) return send(res, 403, {}, 'Forbidden');
  if (!existsSync(file) || !statSync(file).isFile()) {
    if (extname(rel)) return send(res, 404, { 'Content-Type': 'text/plain' }, 'Not found');
    file = join(WEB, 'index.html'); // client-side route
  }
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
  const cache = rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
  send(res, 200, { 'Content-Type': type, 'Cache-Control': cache }, req.method === 'HEAD' ? undefined : readFileSync(file));
}

class TooLarge extends Error {}
async function readBody(req: IncomingMessage, limit = 8 * 1024 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req as AsyncIterable<Buffer>) {
    size += c.length;
    if (size > limit) throw new TooLarge('Request too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void =>
  send(res, status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }, JSON.stringify(body));

async function onRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const started = Date.now();
  let url: URL;
  try { url = new URL(req.url ?? '/', 'http://local'); } catch { return send(res, 400, {}, 'Bad request'); }
  const method = req.method ?? 'GET';
  if (!url.pathname.startsWith('/api/')) {
    if (method !== 'GET' && method !== 'HEAD') return send(res, 405, {}, 'Method not allowed');
    return serveStatic(req, res, url.pathname);
  }
  // Same-origin check for state-changing requests (on top of the custom header the app requires).
  const origin = req.headers.origin;
  if (method !== 'GET' && origin) {
    let host = '';
    try { host = new URL(origin).host; } catch { /* treated as cross-site */ }
    if (host !== req.headers.host) return json(res, 403, { error: 'Cross-site request blocked' });
  }
  let body: unknown = {};
  if (method !== 'GET' && method !== 'HEAD') {
    try {
      const text = await readBody(req);
      if (text) body = JSON.parse(text);
    } catch (e) {
      return json(res, e instanceof TooLarge ? 413 : 400, { error: e instanceof TooLarge ? e.message : 'Invalid JSON' });
    }
  }
  const out = await app.handle({ method, path: url.pathname, query: url.searchParams, headers: req.headers, body, ip: clientIp(req.socket.remoteAddress ?? '', req.headers['x-forwarded-for'], trusted) });
  if (out.file) {
    send(res, 200, { 'Content-Type': out.file.type, 'Content-Disposition': `attachment; filename="${out.file.name}"`, 'Cache-Control': 'no-store' }, out.file.data);
  } else {
    json(res, out.status, out.body, out.headers);
  }
  if (out.status >= 500 || process.env['OUTLIER_DEBUG']) log(`${method} ${url.pathname} ${out.status} ${Date.now() - started}ms`);
}

importStarterBank();
const history = app.backfillHistory(Number(process.env['OUTLIER_HISTORY_DAYS'] ?? 30));
if (history) log(`Created ${history} past days for the archive`);

const handler = (req: IncomingMessage, res: ServerResponse): void => {
  onRequest(req, res).catch((e: unknown) => {
    log(`ERROR ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
    try { send(res, 500, {}, 'Server error'); } catch { /* response already sent */ }
  });
};
const server = secure
  ? createHttps({ cert: readFileSync(resolve(ROOT, config.tlsCert)), key: readFileSync(resolve(ROOT, config.tlsKey)) }, handler)
  : createHttp(handler);

server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') console.error(`\nPort ${config.port} is already in use. Change "port" in config.json and start again.`);
  else console.error(e);
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  const scheme = secure ? 'https' : 'http';
  const addrs = config.host === '0.0.0.0' || config.host === '::'
    ? Object.values(networkInterfaces()).flat().filter(i => i?.family === 'IPv4').map(i => i?.address ?? '')
    : [config.host];
  log(`${app.settings().siteName} is running. Data: ${config.dataDir}`);
  console.log('\n  Open one of these in a browser:');
  for (const a of addrs) console.log(`    ${scheme}://${a}:${config.port}/`);
  const token = app.ensureSetupToken();
  if (token) {
    console.log('\n  FIRST-TIME SETUP: create the admin account here:');
    console.log(`    ${scheme}://${addrs.find(a => a !== '127.0.0.1') ?? addrs[0]}:${config.port}/setup/${token}`);
    console.log(`    (setup code: ${token})`);
  }
  console.log('\n  Press Ctrl+C to stop.\n');
});

const stop = (): void => { log('Shutting down'); server.close(); try { db.close(); } catch { /* closing anyway */ } process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
