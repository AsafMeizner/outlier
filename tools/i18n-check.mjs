#!/usr/bin/env node
// Lists translation keys used in public/*.js that have no Hebrew text yet.
// Usage: node tools/i18n-check.mjs
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const root = resolve(import.meta.dirname, '..', 'public');
const { DICTS } = await import(pathToFileURL(join(root, 'i18n.js')).href);

const keys = new Set();
for (const f of ['app.js', 'admin.js']) {
  const src = readFileSync(join(root, f), 'utf8');
  // t('literal' ...) and t("literal" ...)
  for (const m of src.matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) keys.add(m[2].replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n'));
  // label arrays passed through t(label): ['key', 'Label'] pairs and [v, 'Label'] option lists
  for (const m of src.matchAll(/\[\s*'[\w-]*'\s*,\s*'([^']+)'\s*\]/g)) keys.add(m[1]);
}
const missing = [...keys].filter(k => !(k in DICTS.he) && !/^tier\d|^where\d/.test(k));
for (const k of missing) console.log(JSON.stringify(k));
console.log(`\n${keys.size} keys used, ${missing.length} without Hebrew`);
process.exit(missing.length ? 1 : 0);
