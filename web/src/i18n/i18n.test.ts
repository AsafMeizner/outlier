// The type checker already makes every English key exist in Hebrew. These tests catch what it can't:
// placeholders that went missing in a translation, and server error messages with no Hebrew text.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from './en.ts';
import { he, heServerMessages } from './he.ts';
import { adminEn } from './admin-en.ts';
import { adminHe } from './admin-he.ts';

const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1] ?? '').sort();

describe('translations', () => {
  it.each([['player', en, he], ['admin', adminEn, adminHe]] as const)('%s strings keep every {placeholder}', (_name, source, target) => {
    const broken = Object.entries(source)
      .filter(([k, v]) => placeholders(v).join() !== placeholders((target as Record<string, string>)[k] ?? '').join())
      .map(([k]) => k);
    expect(broken).toEqual([]);
  });

  it('every error message the server sends has a Hebrew translation', () => {
    // tests run from the repo root (npm test) or from web/ (vitest's root)
    const dir = existsSync('server') ? 'server' : join('..', 'server');
    const messages = new Set<string>();
    for (const file of readdirSync(dir).filter(f => f.endsWith('.ts'))) {
      const code = readFileSync(join(dir, file), 'utf8');
      for (const m of code.matchAll(/\bbad\(\s*'((?:[^'\\]|\\.)+)'/g)) messages.add((m[1] ?? '').replace(/\\'/g, "'"));
    }
    expect(messages.size).toBeGreaterThan(50);
    expect([...messages].filter(m => !(m in heServerMessages))).toEqual([]);
  });
});
