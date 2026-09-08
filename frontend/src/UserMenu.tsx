import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
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

export default function UserMenu({ actor, authMode, language, onLanguageChange }: {
  actor: Actor; authMode: AuthStatus['mode']; language: 'en' | 'zh';
  onLanguageChange: (language: 'en' | 'zh') => void;
}) {
  const zh = language === 'zh';
  const name = englishDisplayName(actor);
  const avatar = safeAvatarUrl(actor.avatar_url);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const firstFocus = useRef<'first' | 'last'>('first');
  const menuId = useId();
  const location = useLocation();
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };
  const items = () => Array.from(popup.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || [])
    .filter((item) => item.getClientRects().length > 0);

  useEffect(() => { setOpen(false); }, [location]);
  useEffect(() => {
    if (!open) return;
    const actions = items();
    actions[firstFocus.current === 'last' ? actions.length - 1 : 0]?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const switchLanguage = () => { onLanguageChange(zh ? 'en' : 'zh'); close(true); };
  const languageIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>;
  return <div className="user-menu" ref={root} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <div className="account-preferences">
      <button className="language" type="button" onClick={switchLanguage} aria-label={zh ? '切换到英文' : 'Switch to Chinese'}>
        {languageIcon}<span>{zh ? 'English' : '中文'}</span>
      </button>
      {authMode !== 'w3' && <span className="environment">{zh ? '本地测试' : 'Local test'}</span>}
    </div>
    <button className="user-identity" type="button" ref={trigger} title={name}
      aria-label={`${zh ? '账户菜单' : 'Account menu'}: ${name}`} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId}
      onClick={() => { firstFocus.current = 'first'; setOpen(!open); }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          firstFocus.current = event.key === 'ArrowUp' ? 'last' : 'first';
          if (open) { const actions = items(); actions[firstFocus.current === 'last' ? actions.length - 1 : 0]?.focus({ preventScroll: true }); }
          else setOpen(true);
        }
      }}>
      <UserAvatar key={`${actor.id}:${avatar || ''}`} name={name} source={avatar} />
      <span className="user-menu-name">{name}</span>
      <svg className="account-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m8 14 4-4 4 4" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
    <div className="account-popup" id={menuId} role="menu" aria-label={zh ? '账户操作' : 'Account actions'} hidden={!open} ref={popup}
      onKeyDown={(event) => {
        const actions = items();
        const current = actions.indexOf(document.activeElement as HTMLElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? actions.length - 1
          : event.key === 'ArrowDown' ? (current + 1) % actions.length
          : event.key === 'ArrowUp' ? (current - 1 + actions.length) % actions.length : undefined;
        if (next !== undefined) { event.preventDefault(); actions[next]?.focus({ preventScroll: true }); }
        // Tab follows the normal document order; onBlur closes after focus leaves.
      }}>
      <Link className="account-action" role="menuitem" to="/settings" onClick={() => close(true)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m9 3-1 3-3 1v4l2 1-2 1v4l3 1 1 3h6l1-3 3-1v-4l-2-1 2-1V7l-3-1-1-3Z" strokeLinejoin="round"/><circle cx="12" cy="12" r="3"/></svg>
        {zh ? '设置' : 'Settings'}
      </Link>
      <button className="account-action account-mobile-language" role="menuitem" type="button" onClick={switchLanguage}>
        {languageIcon}{zh ? '语言：English' : 'Language: 中文'}
      </button>
      {authMode === 'w3' && <><div className="account-divider" role="separator"/><a className="account-action account-signout" role="menuitem" href={appUrl('/api/auth/logout')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M9 5H5v14h4M9 12h12m-4-4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {zh ? '退出登录' : 'Sign out'}
      </a></>}
    </div>
  </div>;
}
