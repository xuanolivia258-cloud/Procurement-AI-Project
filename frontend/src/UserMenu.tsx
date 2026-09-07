import { useState } from 'react';
import { appUrl } from './api';
import type { Actor, AuthStatus } from './types';

export function userInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (/^\p{Script=Han}/u.test(words[0])) return Array.from(words[0])[0];
  return (words.length > 1
    ? `${Array.from(words[0])[0]}${Array.from(words[words.length - 1])[0]}`
    : Array.from(words[0]).slice(0, 2).join('')).toUpperCase();
}

export function safeAvatarUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  const source = value.trim();
  if (!/^https:\/\/[^/]/i.test(source) || new TextEncoder().encode(source).length > 512 || /[\s\\\u0000-\u001f\u007f]/u.test(source)) return undefined;
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash || (url.port && url.port !== '443')) return undefined;
    const sensitive = new Set(['token', 'access_token', 'refresh_token', 'id_token', 'client_secret', 'secret', 'authorization', 'code']);
    if (Array.from(url.searchParams.keys()).some((key) => sensitive.has(key.toLowerCase()))) return undefined;
    return source;
  } catch {
    return undefined;
  }
}

export function UserAvatar({ name, source }: { name: string; source?: string }) {
  const [failed, setFailed] = useState(false);
  return <span className="user-avatar" aria-hidden="true">
    <span>{userInitials(name)}</span>
    {source && !failed && <img src={source} alt="" referrerPolicy="no-referrer" decoding="async" onError={() => setFailed(true)} />}
  </span>;
}

export function englishDisplayName(actor: Actor): string {
  // Do not translate or invent a person's name when an older session lacks name_en.
  const name = [actor.name_en, actor.name].find((value) =>
    value?.trim() && /\p{Script=Latin}/u.test(value) && !/\p{Script=Han}/u.test(value));
  return name?.trim() || actor.id.trim() || 'User';
}

export default function UserMenu({ actor, authMode, language }: {
  actor: Actor; authMode: AuthStatus['mode']; language: 'en' | 'zh';
}) {
  const zh = language === 'zh';
  const name = englishDisplayName(actor);
  const avatar = safeAvatarUrl(actor.avatar_url);
  return <div className="user-menu">
    <div className="user-identity" title={name}>
      <UserAvatar key={`${actor.id}:${avatar || ''}`} name={name} source={avatar} />
      <span className="user-menu-name">{name}</span>
    </div>
    {authMode === 'w3' && <a className="user-signout" href={appUrl('/api/auth/logout')}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M9 5H5v14h4M9 12h12m-4-4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {zh ? '退出' : 'Sign out'}
    </a>}
  </div>;
}
