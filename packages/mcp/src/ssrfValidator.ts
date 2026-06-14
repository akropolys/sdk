import dns from 'dns';
import { promisify } from 'util';

const lookup = promisify(dns.lookup);

export function isPrivateIp(ip: string): boolean {
  const ipv4MappedMatch = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const normalizedIp = ipv4MappedMatch ? ipv4MappedMatch[1] : ip;

  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalizedIp)) {
    const parts = normalizedIp.split('.').map(Number);
    if (parts.some(isNaN) || parts.length !== 4) return true;

    if (parts[0] === 127) return true;
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true; // link-local
    if (parts[0] === 0) return true;

    return false;
  }

  // IPv6 checks
  if (normalizedIp === '::1' || normalizedIp === '::') return true;
  if (/^fe[89ab]/i.test(normalizedIp)) return true; // link-local (fe80::/10)
  if (/^f[cd]/i.test(normalizedIp)) return true;    // ULA (fc00::/7)

  return false;
}

/**
 * Validates that the target URL does not resolve to a private/loopback address
 * (SSRF protection) and returns a **safe fetch URL** where the hostname has been
 * replaced by the pre-validated IP address.
 *
 * Using the returned safeUrl for the actual fetch() call closes the DNS-rebinding
 * window: the hostname cannot re-resolve to a different (private) IP between the
 * validation check and the connection.
 *
 * @returns An object with `safeUrl` (connect to this) and `hostHeader` (send as Host:).
 */
export async function assertSafeUrl(urlStr: string): Promise<{ safeUrl: string; hostHeader: string }> {
  const url = new URL(urlStr);
  const hostname = url.hostname;

  // Resolve once — we use this resolved IP for the actual connection.
  const res = await lookup(hostname);

  if (isPrivateIp(res.address)) {
    throw new Error(`SSRF Prevention: outbound requests to private IP address ${res.address} (resolved from "${hostname}") are prohibited`);
  }

  // Build a URL that connects directly to the resolved IP so DNS cannot rebind.
  const safeUrl = new URL(urlStr);
  safeUrl.hostname = res.address;

  return {
    safeUrl: safeUrl.toString(),
    hostHeader: hostname, // caller must forward this as the Host header
  };
}

