// HTTP-facing helpers: errors, input validation for untrusted JSON, and special responses.

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Abort the request with a client error. */
export function bad(message: string, status = 400): never {
  throw new HttpError(status, message);
}

export type Body = Record<string, unknown>;
export const asBody = (v: unknown): Body => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Body) : {});

/** A required string field, trimmed, with a maximum length. */
export function str(v: unknown, max: number, name: string): string {
  if (typeof v !== 'string') bad(`${name} is required`);
  const s = v.trim();
  if (s.length > max) bad(`${name} is too long (max ${max})`);
  return s;
}

/** An optional string field: missing or non-string becomes the fallback. */
export function optStr(v: unknown, max: number, name: string, fallback = ''): string {
  return v === undefined || v === null ? fallback : str(v, max, name);
}

export function int(v: unknown, name: string, lo: number, hi: number): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) bad(`${name} must be a whole number from ${lo} to ${hi}`);
  return n;
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], message: string): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) bad(message);
  return v as T;
}

export interface FileOut { name: string; type: string; data: string | Buffer }

/** A download instead of JSON. */
export class FileResult {
  readonly file: FileOut;
  constructor(file: FileOut) { this.file = file; }
}

/** A JSON body that also sets the session cookie. */
export class CookieResult<T> {
  readonly cookie: string;
  readonly body: T;
  constructor(cookie: string, body: T) { this.cookie = cookie; this.body = body; }
}

export interface ApiRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  ip: string;
}

export interface ApiResponse {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
  file?: FileOut;
}
