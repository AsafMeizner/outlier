// The real client address behind a reverse proxy (a Kubernetes Ingress, nginx, ...).
// Rate limits and the login lockout are keyed on the client address, so behind a proxy they must not all collapse
// onto the proxy's own address. X-Forwarded-For is only believed when the connection comes from a trusted proxy.
//
// OUTLIER_TRUST_PROXY:
//   (empty)      trust no proxy: the socket address is the client (the default)
//   private      trust loopback and private networks (10/8, 172.16/12, 192.168/16, 169.254/16, ::1, fc00::/7, fe80::/10)
//   a list       comma-separated addresses and IPv4 CIDRs, e.g. "10.42.0.0/16,192.168.1.5"

export type TrustCheck = (ip: string) => boolean;

const bare = (ip: string): string => ip.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '').replace(/^\[|\]$/g, '');

function ipv4(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some(n => n > 255)) return null;
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function inCidr(ip: string, cidr: string): boolean {
  const [base = '', bitsText] = cidr.split('/');
  const a = ipv4(ip), b = ipv4(base);
  if (a === null || b === null) return false;
  const bits = Number(bitsText ?? 32);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

const PRIVATE_V4 = ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16'];
function isPrivate(ip: string): boolean {
  if (ipv4(ip) !== null) return PRIVATE_V4.some(c => inCidr(ip, c));
  const v6 = ip.toLowerCase();
  return v6 === '::1' || /^f[cd][0-9a-f]{2}:/.test(v6) || /^fe[89ab][0-9a-f]:/.test(v6);
}

/** Parses OUTLIER_TRUST_PROXY into a check, or null when no proxy is trusted. */
export function trustProxy(spec: string | undefined): TrustCheck | null {
  const items = (spec ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (!items.length) return null;
  return ip => {
    const a = bare(ip);
    return items.some(item => (item === 'private' ? isPrivate(a) : item.includes('/') ? inCidr(a, item) : bare(item) === a));
  };
}

/**
 * The client address: the socket peer, unless the peer is a trusted proxy. Then X-Forwarded-For is read from the
 * right, skipping trusted proxies, and the first address that is not one is the client. (Entries further left were
 * written by the client itself and can be forged, so they are never used while an untrusted hop exists.)
 */
export function clientIp(remote: string, forwardedFor: string | string[] | undefined, trusted: TrustCheck | null): string {
  const peer = bare(remote);
  if (!trusted || !forwardedFor || !trusted(peer)) return peer;
  const hops = (Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor).split(',').map(bare).filter(Boolean);
  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = hops[i] ?? '';
    if (!trusted(hop)) return hop;
  }
  return hops[0] ?? peer;
}
