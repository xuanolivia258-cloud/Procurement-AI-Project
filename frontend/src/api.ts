export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message); this.status = status; this.code = code;
  }
}

export const AUTH_REQUIRED_EVENT = 'cari:authentication-required';

export const appBase = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

export function appUrl(path: string) {
  if (!appBase || path === appBase || path.startsWith(`${appBase}/`)) return path;
  return `${appBase}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(appUrl(path), {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = body.error || body.detail || body;
    if (
      response.status === 401
      && !path.startsWith('/api/auth/')
      && detail.code === 'AUTHENTICATION_REQUIRED'
      && typeof window !== 'undefined'
    ) {
      // Recheck the server switch and show the sign-in button. A failed W3
      // rollout can then be disabled without sending the user back to W3.
      window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
    }
    throw new ApiError(response.status, detail.message || 'Request failed.', detail.code);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export function queryString(values: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return params.toString();
}
