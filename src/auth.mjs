// Passwords (scrypt) and sessions (random token, only its SHA-256 is stored).
import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(String(password), salt, 32, SCRYPT);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export function verifyPassword(password, stored) {
  const [kind, salt, hash] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = scryptSync(String(password), Buffer.from(salt, 'base64url'), expected.length, SCRYPT);
  return timingSafeEqual(key, expected);
}

export const newToken = () => randomBytes(32).toString('base64url');
export const tokenHash = t => createHash('sha256').update(String(t)).digest('hex');

/** Readable temporary password, e.g. "maple-river-4821". */
const WORDS = 'amber,anchor,apple,arrow,aspen,birch,bloom,breeze,cedar,cloud,comet,coral,daisy,delta,ember,falcon,fern,flint,frost,grove,harbor,hazel,heron,iris,jade,juniper,lark,lemon,lotus,maple,meadow,mint,nova,oak,olive,onyx,orbit,pearl,pine,plum,quartz,raven,reef,river,sage,sparrow,spruce,stone,summit,thyme,tide,topaz,tulip,velvet,willow,zephyr'.split(',');
export function tempPassword() {
  const b = randomBytes(6);
  return `${WORDS[b[0] % WORDS.length]}-${WORDS[b[1] % WORDS.length]}-${1000 + (b.readUInt16BE(2) % 9000)}`;
}

export function validUsername(u) { return typeof u === 'string' && /^[a-zA-Z0-9._-]{2,32}$/.test(u); }
export function validPassword(p) { return typeof p === 'string' && p.length >= 8 && p.length <= 200; }
