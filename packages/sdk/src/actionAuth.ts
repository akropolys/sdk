/** Existing provider clients; adapters add no auth-library dependency. */
export interface ClerkActionTokenOptions {
  template?: string;
  organizationId?: string;
}

interface ClerkTokenSource {
  getToken(options?: ClerkActionTokenOptions): Promise<string | null>;
}

export type ClerkActionClient =
  | (ClerkTokenSource & { isLoaded?: boolean; isSignedIn?: boolean })
  | { readonly session?: ClerkTokenSource | null; isLoaded?: boolean };

export interface Auth0ActionParams {
  audience?: string;
  scope?: string;
  organization?: string;
}

interface Auth0ActionOptions { authorizationParams?: Auth0ActionParams }

export type Auth0ActionClient = (
  | { getAccessTokenSilently(options?: Auth0ActionOptions): Promise<string | undefined> }
  | { getTokenSilently(options?: Auth0ActionOptions): Promise<string | undefined> }
) & { isLoading?: boolean; isAuthenticated?: boolean | (() => Promise<boolean>) };

export interface SupabaseActionClient {
  auth: {
    getSession(): Promise<{
      data: { session: { access_token: string } | null };
      error?: unknown;
    }>;
  };
}

interface ActionAuthOrigins {
  /** Exact trusted API origins. Defaults to the page's origin. */
  origins?: readonly string[];
}

/** Connect an already initialized auth client once; tokens are read per action. */
export type ActionAuth = ActionAuthOrigins & (
  | { provider: 'clerk'; client: ClerkActionClient; tokenOptions?: ClerkActionTokenOptions }
  | { provider: 'auth0'; client: Auth0ActionClient; authorizationParams?: Auth0ActionParams }
  | { provider: 'supabase'; client: SupabaseActionClient }
);

export class ActionAuthError extends Error {
  constructor(message: string, readonly needsSignIn = false) { super(message); }
}

const signInError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const value = error as { error?: string; code?: string; name?: string };
  return ['login_required', 'interaction_required', 'consent_required'].includes(value.error || value.code || '')
    || value.name === 'AuthSessionMissingError';
};

// The provider owns token renewal and revocation. Never cache a token or silently
// retry a site mutation after its API has rejected an authorization header.
export async function actionAuthorization(
  auth: ActionAuth,
  url: string,
  requiresSignIn: boolean,
  signal: AbortSignal,
): Promise<string | undefined> {
  const origin = new URL(url).origin;
  const origins = auth.origins ?? [new URL(window.location.href).origin];
  if (!origins.some(value => {
    try {
      const trusted = new URL(value);
      return ['http:', 'https:'].includes(trusted.protocol) && !trusted.username && !trusted.password
        && !trusted.search && !trusted.hash && (trusted.pathname === '/' || trusted.pathname === '')
        && trusted.origin === origin;
    } catch { return false; }
  })) {
    throw new ActionAuthError('Add this API origin to actionAuth.origins before sending action credentials.');
  }
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  let token: string | null | undefined;
  try {
    switch (auth.provider) {
      case 'clerk': {
        const client = auth.client;
        if (client.isLoaded === false) throw new ActionAuthError('Wait for the site login to finish loading, then try again.');
        if ('getToken' in client) {
          token = client.isSignedIn === false ? null : await client.getToken(auth.tokenOptions);
          if (client.isSignedIn === false) token = null;
        } else {
          const session = client.session;
          token = session ? await session.getToken(auth.tokenOptions) : null;
          // Do not use an answer from a session replaced during token retrieval.
          if (client.session !== session) token = null;
        }
        break;
      }
      case 'auth0': {
        const client = auth.client;
        if (client.isLoading === true) throw new ActionAuthError('Wait for the site login to finish loading, then try again.');
        if (client.isAuthenticated === false) { token = null; break; }
        const options = auth.authorizationParams ? { authorizationParams: auth.authorizationParams } : undefined;
        token = 'getAccessTokenSilently' in client
          ? await client.getAccessTokenSilently(options)
          : await client.getTokenSilently(options);
        if ((client.isAuthenticated as unknown) === false) token = null;
        break;
      }
      case 'supabase': {
        const { data, error } = await auth.client.auth.getSession();
        if (error) throw error;
        token = data.session?.access_token;
        break;
      }
      default: throw new ActionAuthError('Unsupported site action authentication provider.');
    }
  } catch (error) {
    if (error instanceof ActionAuthError) throw error;
    if (signInError(error)) token = null;
    else throw new ActionAuthError('Could not get authorization from the site login provider. Try again when the login connection is available.');
  }
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  if (token == null || token === '') {
    if (requiresSignIn) throw new ActionAuthError('Sign in on this site to use this action.', true);
    return undefined;
  }
  if (typeof token !== 'string' || /\s/.test(token)) throw new ActionAuthError('The site login provider returned an invalid access token.');
  return `Bearer ${token}`;
}
