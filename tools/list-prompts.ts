#!/usr/bin/env node
// Lists every prompt in bank/packs as "file | category | text", for spotting near-duplicates before writing a pack.
//   node tools/list-prompts.ts            all prompts
//   node tools/list-prompts.ts he         Hebrew only (or "en")
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseJson, parseText } from '../server/packs.ts';

const dir = resolve(import.meta.dirname, '..', 'bank', 'packs');
const lang = process.argv[2];
const hebrew = (s: string): boolean => /[א-ת]/.test(s);
let n = 0;
for (const file of readdirSync(dir).filter(f => /\.(json|txt)$/i.test(f)).sort()) {
  const text = readFileSync(join(dir, file), 'utf8');
  const pack = file.endsWith('.json') ? parseJson(text) : parseText(text);
  for (const p of pack.prompts) {
    if (lang === 'he' && !hebrew(p.text)) continue;
    if (lang === 'en' && hebrew(p.text)) continue;
    console.log(`${file} | ${p.category} | ${p.text}`);
    n++;
  }
}
console.error(`${n} prompts`);
