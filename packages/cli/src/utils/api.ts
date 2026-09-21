export interface Site {
  id: string;
  name: string;
  url: string;
  environment?: string;
}

export interface MintedKey {
  key: string;
  kid: string;
  private_key: string;
  key_prefix: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function api(apiUrl: string, token: string) {
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new ApiError(res.status, text.trim() || `${method} ${path} failed with ${res.status}`);
    return text ? JSON.parse(text) : null;
  };

  return {
    async listSites(): Promise<Site[]> {
      const data = await call('GET', '/sites');
      return Array.isArray(data) ? data : (data?.sites ?? []);
    },
    createSite(site: { id: string; name: string; url: string; allowed_domains?: string[] }): Promise<Site> {
      return call('POST', '/sites', { ...site, environment: 'development' });
    },
    createKey(name: string, siteId: string): Promise<MintedKey> {
      return call('POST', '/api/keys', { name, site_id: siteId });
    },
  };
}
