export interface OAuthConfig {
  enabled: boolean;
  issuer: string;
  clientId: string;
  treasury: string;
  redirectUri: string;
  scopes: string[];
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

const CONFIG_URL = `/config/oauth.${__VERONA_ENVIRONMENT__.network}.jsonc`;
const STATE_KEY = 'xion_explorer_oauth_state';
const VERIFIER_KEY = 'xion_explorer_oauth_verifier';
const RETURN_TO_KEY = 'xion_explorer_oauth_return_to';
const TOKENS_KEY = 'xion_explorer_oauth_tokens';

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomValue(size = 32): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

export async function loadOAuthConfig(): Promise<OAuthConfig> {
  const response = await fetch(CONFIG_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`OAuth configuration failed to load (${response.status})`);
  const config = (await response.json()) as OAuthConfig;
  if (!config.enabled || !config.clientId || !config.treasury) {
    throw new Error(`OAuth login is not configured for ${__VERONA_ENVIRONMENT__.network}`);
  }
  return config;
}

export async function beginOAuthLogin(returnTo = window.location.pathname + window.location.search) {
  const config = await loadOAuthConfig();
  const state = randomValue();
  const verifier = randomValue(64);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(RETURN_TO_KEY, returnTo.startsWith('/') ? returnTo : '/');

  const url = new URL('/oauth/authorize', config.issuer);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(' '),
    state,
    code_challenge: await sha256(verifier),
    code_challenge_method: 'S256',
  }).toString();
  window.location.assign(url.toString());
}

export async function completeOAuthLogin(code: string, state: string): Promise<OAuthTokens> {
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!expectedState || !state || state !== expectedState) throw new Error('OAuth state validation failed');
  if (!verifier) throw new Error('OAuth PKCE verifier is missing');

  const config = await loadOAuthConfig();
  const response = await fetch(new URL('/oauth/token', config.issuer), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      code_verifier: verifier,
    }),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== 'string') {
    throw new Error(typeof body.error_description === 'string' ? body.error_description : 'OAuth token exchange failed');
  }
  const tokens = {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
    expiresAt: Date.now() + Number(body.expires_in || 86400) * 1000,
  };
  sessionStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  return tokens;
}

export function getOAuthTokens(): OAuthTokens | null {
  const raw = sessionStorage.getItem(TOKENS_KEY);
  if (!raw) return null;
  try {
    const tokens = JSON.parse(raw) as OAuthTokens;
    return tokens.accessToken && tokens.expiresAt > Date.now() ? tokens : null;
  } catch {
    return null;
  }
}

export async function fetchOAuthAccount(accessToken: string): Promise<{ id: string }> {
  const config = await loadOAuthConfig();
  const response = await fetch(new URL('/api/v1/me', config.issuer), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof body.id !== 'string') throw new Error('Unable to load the connected XION account');
  return { id: body.id };
}

export function consumeOAuthReturnTo(): string {
  const returnTo = sessionStorage.getItem(RETURN_TO_KEY) || '/';
  sessionStorage.removeItem(RETURN_TO_KEY);
  return returnTo;
}

export function clearOAuthSession() {
  sessionStorage.removeItem(TOKENS_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(RETURN_TO_KEY);
}
