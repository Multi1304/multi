const isBrowser = typeof window !== 'undefined';
export const isLocalDev = isBrowser && (window.location.port === '3000' || window.location.port === '5173');
const defaultLocalApiBaseUrl = 'http://localhost:4000/api';

let cachedApiBaseUrl: string | null = import.meta.env.VITE_API_URL || null;
let apiBaseUrlPromise: Promise<string> | null = null;

function normalizeApiBaseUrl(value: string) {
  return value.replace(/\/+$/, '');
}

async function readDevApiBaseUrl() {
  if (!isLocalDev || typeof fetch === 'undefined') {
    return defaultLocalApiBaseUrl;
  }

  try {
    const response = await fetch(`/dev-api-port.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return defaultLocalApiBaseUrl;

    const data = await response.json();
    const port = Number(data?.port);
    if (!Number.isInteger(port) || port <= 0) return defaultLocalApiBaseUrl;

    return `http://localhost:${port}/api`;
  } catch {
    return defaultLocalApiBaseUrl;
  }
}

export async function resolveApiBaseUrl(forceRefresh = false) {
  if (import.meta.env.VITE_API_URL) {
    return normalizeApiBaseUrl(import.meta.env.VITE_API_URL);
  }

  if (!isLocalDev) {
    cachedApiBaseUrl = '/api';
    return cachedApiBaseUrl;
  }

  if (!forceRefresh && cachedApiBaseUrl) {
    return cachedApiBaseUrl;
  }

  if (!forceRefresh && apiBaseUrlPromise) {
    return apiBaseUrlPromise;
  }

  apiBaseUrlPromise = readDevApiBaseUrl()
    .then((url) => {
      cachedApiBaseUrl = normalizeApiBaseUrl(url);
      return cachedApiBaseUrl;
    })
    .finally(() => {
      apiBaseUrlPromise = null;
    });

  return apiBaseUrlPromise;
}

export async function resolveBackendOrigin(forceRefresh = false) {
  const apiBaseUrl = await resolveApiBaseUrl(forceRefresh);
  return apiBaseUrl.replace(/\/api$/, '');
}

export function getFallbackApiBaseUrl() {
  if (import.meta.env.VITE_API_URL) {
    return normalizeApiBaseUrl(import.meta.env.VITE_API_URL);
  }
  return isLocalDev ? defaultLocalApiBaseUrl : '/api';
}
