/**
 * Subdomain Authentication Service
 * 
 * Handles cross-subdomain authentication flow:
 * 1. Detect if subdomain routing is active
 * 2. On non-login subdomains: redirect to login.koodh.com if not authenticated
 * 3. On login subdomain: after login, create exchange token and redirect back
 * 4. On target subdomain: redeem exchange token for real JWT
 */

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * Get the current hostname's subdomain relative to the base domain.
 * e.g. "login.koodh.com" with base "koodh.com" returns "login"
 * e.g. "clara.koodh.com" returns "clara"
 * e.g. "localhost" returns null (not a subdomain)
 */
export function getCurrentSubdomain(baseDomain) {
  const hostname = window.location.hostname;
  if (!baseDomain || hostname === 'localhost' || hostname.includes('preview.emergentagent.com')) {
    return null; // Not on a subdomain setup
  }
  if (hostname.endsWith(`.${baseDomain}`)) {
    return hostname.replace(`.${baseDomain}`, '');
  }
  return null;
}

/**
 * Check if we're currently on the login subdomain.
 */
export function isOnLoginSubdomain(config) {
  if (!config?.enabled || !config?.login_subdomain) return false;
  const sub = getCurrentSubdomain(config.base_domain);
  return sub === config.login_subdomain;
}

/**
 * Check if we're currently on the app subdomain.
 */
export function isOnAppSubdomain(config) {
  if (!config?.enabled || !config?.app_subdomain) return false;
  const sub = getCurrentSubdomain(config.base_domain);
  return sub === config.app_subdomain;
}

/**
 * Fetch subdomain routing configuration from the backend.
 */
export async function fetchSubdomainConfig() {
  try {
    const res = await fetch(`${API}/api/auth/subdomain-config`);
    if (res.ok) return await res.json();
  } catch {
    // Silently fail - subdomain routing is optional
  }
  return { enabled: false };
}

/**
 * Create an exchange token after successful login.
 * Returns the token that can be passed via URL to the target subdomain.
 */
export async function createExchangeToken(jwtToken, redirectUrl) {
  try {
    const res = await fetch(`${API}/api/auth/exchange-token/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ redirect_url: redirectUrl }),
    });
    if (res.ok) return await res.json();
  } catch {
    // Fall through
  }
  return null;
}

/**
 * Redeem an exchange token for a real JWT.
 * Called on the target subdomain after receiving the token via URL.
 */
export async function redeemExchangeToken(exchangeToken) {
  try {
    const res = await fetch(`${API}/api/auth/exchange-token/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exchange_token: exchangeToken }),
    });
    if (res.ok) return await res.json();
    const err = await res.json();
    console.error('Exchange token redeem failed:', err.detail);
  } catch (e) {
    console.error('Exchange token redeem error:', e);
  }
  return null;
}

/**
 * Build the login redirect URL with return path.
 * e.g. https://login.koodh.com/login?redirect=https://clara.koodh.com/network
 */
export function buildLoginRedirectUrl(config) {
  if (!config?.login_url) return '/login';
  const currentUrl = window.location.href;
  return `${config.login_url}/login?redirect=${encodeURIComponent(currentUrl)}`;
}

/**
 * Build the app redirect URL with exchange token.
 * e.g. https://clara.koodh.com?exchange_token=xxx
 */
export function buildAppRedirectUrl(config, exchangeToken, originalRedirect) {
  const baseUrl = originalRedirect || config?.app_url || '/';
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}exchange_token=${exchangeToken}`;
}

/**
 * Check URL for exchange_token parameter and clean it up.
 * Returns the token if found, null otherwise.
 */
export function extractAndCleanExchangeToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('exchange_token');
  if (token) {
    // Remove exchange_token from URL without reload
    params.delete('exchange_token');
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
    window.history.replaceState({}, '', newUrl);
  }
  return token;
}

/**
 * Get the redirect URL from URL parameters (used on login subdomain).
 */
export function getRedirectParam() {
  const params = new URLSearchParams(window.location.search);
  return params.get('redirect');
}
