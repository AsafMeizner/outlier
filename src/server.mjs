#!/usr/bin/env node
// Outlier server + admin command line. No dependencies beyond Node 24.
//
//   node src/server.mjs                         start the server
//   node src/server.mjs import <file> [--update] add questions from a .json/.txt/.csv pack
//   node src/server.mjs reset-password <user>   print a new temporary password
//   node src/server.mjs make-admin <user>       give a user admin rights
//   node src/server.mjs backup <file.db>        write a consistent copy of the database
import { createServer as createHttp } from 'node:http';
import { createServer as createHttps } from 'node:https';
import { readFileSync, existsSync, readdirSync, statSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, resolve, extname, normalize as normPath, sep } from 'node:path';
import { networkInterfaces } from 'node:os';
import { openDb } from './db.mjs';
import { createApp } from './app.mjs';
import { hashPassword, tempPassword } from './auth.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const PUBLIC = join(ROOT, 'public');

function loadConfig() {
  const file = join(ROOT, 'config.json');
  let c = {};
  if (existsSync(file)) {
    try { c = JSON.parse(readFileSync(file, 'utf8')); }
    catch (e) { console.error(`config.json is not valid JSON: ${e.message}`); process.exit(1); }
  }
  const env = process.env;
  return {
    port: Number(env.OUTLIER_PORT || c.port || 8080),
    host: env.OUTLIER_HOST || c.host || '0.0.0.0',
    dataDir: resolve(ROOT, env.OUTLIER_DATA || c.dataDir || 'data'),
    tlsCert: env.OUTLIER_TLS_CERT || c.tlsCert || '',
    tlsKey: env.OUTLIER_TLS_KEY || c.tlsKey || '',
  };
}

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });
const logFile = join(config.dataDir, 'outlier.log');
const log = msg => {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  try { appendFileSync(logFile, line + '\n'); } catch { /* log file is best effort */ }
};

const db = openDb(join(config.dataDir, 'outlier.db'));
const secure = !!(config.tlsCert && config.tlsKey);
const app = createApp({ db, secure, log });

function importStarterBank() {
  if (db.get('SELECT COUNT(*) AS n FROM prompts').n) return;
  const dir = join(ROOT, 'bank', 'packs');
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir).filter(f => /\.(json|txt|csv)$/i.test(f)).sort()) {
    try {
      const r = app.importPack(readFileSync(join(dir, f), 'utf8'), f);
      log(`Imported starter pack ${f}: ${r.added} prompts${r.errors.length ? `, ${r.errors.length} errors` : ''}`);
      for (const e of r.errors) log(`  ${e}`);
    } catch (e) { log(`Skipped starter pack ${f}: ${e.message}`); }
  }
}

// ---------- CLI ----------
const [cmd, ...args] = process.argv.slice(2);
if (cmd && cmd !== 'start') {
  const userArg = () => {
    const u = db.get('SELECT * FROM users WHERE username=?', args[0] || '');
    if (!u) { console.error(`No user called "${args[0] || ''}"`); process.exit(1); }
    return u;
  };
  if (cmd === 'import') {
    if (!args[0]) { console.error('Usage: import <file> [--update]'); process.exit(1); }
    const r = app.importPack(readFileSync(resolve(args[0]), 'utf8'), args[0], { mode: args.includes('--update') ? 'update' : 'skip' });
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
    const out = resolve(args[0] || `outlier-backup-${app.today()}.db`);
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
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};
const SECURITY = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function send(res, status, headers, body) {
  res.writeHead(status, { ...SECURITY, ...headers });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  let file;
  try { file = normPath(join(PUBLIC, decodeURIComponent(rel))); } catch { return send(res, 400, {}, 'Bad path'); }
  if (!file.startsWith(PUBLIC + sep)) return send(res, 403, {}, 'Forbidden');
  if (!existsSync(file) || !statSync(file).isFile()) {
    if (extname(rel)) return send(res, 404, { 'Content-Type': 'text/plain' }, 'Not found');
    file = join(PUBLIC, 'index.html');
  }
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  send(res, 200, { 'Content-Type': type, 'Cache-Control': 'no-cache' }, req.method === 'HEAD' ? undefined : readFileSync(file));
}

async function readBody(req, limit = 8 * 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('Request too large'), { status: 413 }); chunks.push(c); }
  return Buffer.concat(chunks).toString('utf8');
}

async function onRequest(req, res) {
  const started = Date.now();
  let url;
  try { url = new URL(req.url, 'http://local'); } catch { return send(res, 400, {}, 'Bad request'); }
  if (!url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, {}, 'Method not allowed');
    return serveStatic(req, res, url.pathname);
  }
  // Same-origin check for state-changing requests (on top of the custom header the app requires).
  const origin = req.headers.origin;
  if (req.method !== 'GET' && origin && new URL(origin).host !== req.headers.host) {
    return send(res, 403, { 'Content-Type': 'application/json' }, JSON.stringify({ error: 'Cross-site request blocked' }));
  }
  let body = {};
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const text = await readBody(req);
      if (text) body = JSON.parse(text);
    }
  } catch (e) {
    return send(res, e.status || 400, { 'Content-Type': 'application/json' }, JSON.stringify({ error: e.status ? e.message : 'Invalid JSON' }));
  }
  const out = await app.handle({ method: req.method, path: url.pathname, query: url.searchParams, headers: req.headers, body, ip: req.socket.remoteAddress });
  if (out.file) {
    send(res, 200, { 'Content-Type': out.file.type, 'Content-Disposition': `attachment; filename="${out.file.name}"`, 'Cache-Control': 'no-store' }, out.file.data);
  } else {
    send(res, out.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(out.headers || {}) }, JSON.stringify(out.body));
  }
  if (out.status >= 500 || process.env.OUTLIER_DEBUG) log(`${req.method} ${url.pathname} ${out.status} ${Date.now() - started}ms`);
}

importStarterBank();
const handler = (req, res) => onRequest(req, res).catch(e => { log(`ERROR ${e.stack || e}`); try { send(res, 500, {}, 'Server error'); } catch { /* already sent */ } });
const server = secure
  ? createHttps({ cert: readFileSync(resolve(ROOT, config.tlsCert)), key: readFileSync(resolve(ROOT, config.tlsKey)) }, handler)
  : createHttp(handler);

server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`\nPort ${config.port} is already in use. Change "port" in config.json and start again.`);
  else console.error(e);
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  const scheme = secure ? 'https' : 'http';
  const addrs = config.host === '0.0.0.0' || config.host === '::'
    ? Object.values(networkInterfaces()).flat().filter(i => i && i.family === 'IPv4').map(i => i.address)
    : [config.host];
  const s = app.settings();
  log(`${s.siteName} is running. Data: ${config.dataDir}`);
  console.log('\n  Open one of these in a browser:');
  for (const a of addrs) console.log(`    ${scheme}://${a}:${config.port}/`);
  const token = app.ensureSetupToken();
  if (token) {
    console.log('\n  FIRST-TIME SETUP: create the admin account here:');
    console.log(`    ${scheme}://${addrs.find(a => a !== '127.0.0.1') || addrs[0]}:${config.port}/#/setup/${token}`);
    console.log(`    (setup code: ${token})`);
  }
  console.log('\n  Press Ctrl+C to stop.\n');
});

const stop = () => { log('Shutting down'); server.close(); try { db.close(); } catch { /* closing anyway */ } process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
