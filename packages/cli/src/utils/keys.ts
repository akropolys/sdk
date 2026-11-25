/** The site a public key belongs to. */
export function siteFromKey(key?: string | null): string {
  const k = (key ?? '').trim();
  const dot = k.lastIndexOf('.');
  if (!/^sk_(live|test)_/.test(k) || dot < 0 || dot === k.length - 1) return '';
  try {
    const site = Buffer.from(k.slice(dot + 1), 'base64url').toString('utf8');
    return /^[\x21-\x7e]{1,200}$/.test(site) ? site : '';
  } catch {
    return '';
  }
}
