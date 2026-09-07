import { api } from './api';
import type { Actor } from './types';

export const DIRECTORY_ENDPOINTS = new Set([
  'https://wework-digitalspace-g.rnd.huawei.com/gw/etipublicconfig/etipublicconfig/v1/w3',
  'https://wework-digitalspace.hissit.huawei.com/gw/etipublicconfig/etipublicconfig/publicservices/public/api/v1/w3',
]);

export interface OwnerProfile extends Actor {
  directory_lookup?: { url: string; account: string; timeout_ms: number };
}

export function directoryEnglishName(payload: unknown, account: string): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const body = payload as Record<string, unknown>;
  // Match MRVP's response contract; the directory does not document a business-status enum.
  if (!Array.isArray(body.result)) return undefined;
  const matches = body.result.filter((row) => row && typeof row === 'object'
    && typeof row.w3Name === 'string' && row.w3Name.trim().toLowerCase() === account.toLowerCase());
  // The Owner API is a fuzzy search. Never select a similar account or an ambiguous match.
  if (matches.length !== 1) return undefined;
  const row = matches[0];
  if (typeof row.fullName !== 'string' || row.fullName.length > 400 || /[\u0000-\u001f\u007f]/u.test(row.fullName)) return undefined;
  const escaped = account.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let name: string = row.fullName.trim().replace(new RegExp(`(?:\\s+|\\s*[（(])${escaped}[）)]?\\s*$`, 'i'), '').trim();
  if (typeof row.cnName === 'string' && row.cnName.trim() && name.startsWith(row.cnName.trim())) {
    name = name.slice(row.cnName.trim().length).trim();
  }
  const letters = name.match(/\p{L}/gu) || [];
  if (!letters.length || letters.some((letter) => !/\p{Script=Latin}/u.test(letter))) return undefined;
  return name.slice(0, 200) || undefined;
}

export async function fetchOwnerProfile(actor: Actor, signal: AbortSignal): Promise<Actor> {
  const profile = await api<OwnerProfile>('/api/auth/profile', { signal, cache: 'no-store' });
  if (profile.id !== actor.id) return actor;
  const fallback: Actor = {
    ...actor, name_en: profile.name_en || actor.name_en, avatar_url: profile.avatar_url || actor.avatar_url,
  };
  const lookup = profile.directory_lookup;
  if (!lookup || !DIRECTORY_ENDPOINTS.has(lookup.url) || lookup.account !== actor.id.trim().toLowerCase()
      || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(lookup.account)) return fallback;

  signal.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  const timeout = Number.isFinite(lookup.timeout_ms) ? Math.max(100, Math.min(lookup.timeout_ms, 10000)) : 3000;
  const timer = setTimeout(cancel, timeout);
  try {
    const url = new URL(lookup.url);
    url.searchParams.set('userInfo', lookup.account);
    const response = await fetch(url.toString(), {
      method: 'GET', credentials: 'include', mode: 'cors', redirect: 'error',
      headers: { 'x-user-name': lookup.account, Accept: 'application/json' },
      signal: controller.signal,
    });
    // Directory 401/403 is not a procurement-session failure. Never redirect or log the user out.
    if (!response.ok) return fallback;
    const body = await response.text();
    if (body.length > 65536) return fallback;
    const name = directoryEnglishName(JSON.parse(body), lookup.account);
    return name ? { ...fallback, name_en: name } : fallback;
  } catch {
    signal.throwIfAborted();
    // No directory records or SSO details go into browser logs, localStorage, or session cookies.
    return fallback;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}
