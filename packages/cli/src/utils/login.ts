import http from 'http';
import crypto from 'crypto';
import { openBrowser } from './open';

const TIMEOUT_MS = 2 * 60 * 1000;

export interface Handshake {
  code: string;
  url: string;
  token: Promise<string>;
  close(): void;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 64 * 1024) reject(new Error('payload too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// The token is POSTed from the browser rather than carried in a redirect URL, so
// it never reaches browser history or an access log.
export async function startHandshake(shellUrl: string): Promise<Handshake> {
  const state = crypto.randomBytes(24).toString('hex');
  const code = crypto.randomBytes(3).toString('hex').toUpperCase();
  const origin = new URL(shellUrl).origin;

  let resolveToken: (token: string) => void;
  let rejectToken: (err: Error) => void;
  const token = new Promise<string>((resolve, reject) => {
    resolveToken = resolve;
    rejectToken = reject;
  });

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    if (req.method !== 'POST' || !req.url?.startsWith('/callback')) {
      res.writeHead(404).end();
      return;
    }

    let payload: any = {};
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      res.writeHead(400).end();
      return;
    }

    if (typeof payload.state !== 'string' || payload.state.length !== state.length
      || !crypto.timingSafeEqual(Buffer.from(payload.state), Buffer.from(state))) {
      res.writeHead(403).end();
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');

    if (payload.error === 'denied') rejectToken(new Error('authorization denied in the browser'));
    else if (typeof payload.token === 'string' && payload.token) resolveToken(payload.token);
    else rejectToken(new Error('the browser sent no token'));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const url = `${shellUrl}?port=${port}&state=${state}&code=${code}`;

  const timer = setTimeout(() => rejectToken(new Error('timed out waiting for the browser')), TIMEOUT_MS);
  const close = () => {
    clearTimeout(timer);
    server.close();
  };
  token.then(close, close);

  return { code, url, token, close };
}

export function openLogin(url: string): boolean {
  return openBrowser(url);
}
