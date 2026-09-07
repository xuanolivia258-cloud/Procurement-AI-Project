import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { api, appUrl, AUTH_REQUIRED_EVENT } from './api';
import type { Actor, AuthStatus } from './types';
import { fetchOwnerProfile } from './ownerProfile';

export function signInUrl(status: AuthStatus | undefined, location: { pathname: string; search: string; hash: string }) {
  const params = new URLSearchParams(location.search);
  params.delete('auth_error');
  params.delete('signed_out');
  const query = params.toString();
  const next = `${location.pathname}${query ? `?${query}` : ''}${location.hash}`;
  const base = status?.login_url && /^https?:\/\//.test(status.login_url)
    ? status.login_url : appUrl(status?.login_url || '/api/auth/login');
  return `${base}?next=${encodeURIComponent(next)}`;
}

export function shouldAutoSignIn(status: AuthStatus | undefined, search: string): boolean {
  const params = new URLSearchParams(search);
  return status?.mode === 'w3' && !status.authenticated && status.login_ready !== false
    && !params.has('auth_error') && params.get('signed_out') !== '1';
}

export function profileForActor(actor: Actor, profile: Actor | undefined): Actor {
  if (!profile || profile.id !== actor.id) return actor;
  return { ...actor, name_en: profile.name_en || actor.name_en, avatar_url: profile.avatar_url || actor.avatar_url };
}

export default function AuthGate({ language, children }: {
  language: 'en' | 'zh';
  children: (actor: Actor, mode: AuthStatus['mode']) => ReactNode;
}) {
  const zh = language === 'zh';
  const location = useLocation();
  const queryClient = useQueryClient();
  const [openingLogin, setOpeningLogin] = useState(false);
  const redirectingTo = useRef<string | null>(null);
  const authError = new URLSearchParams(location.search).get('auth_error');
  const signedOut = new URLSearchParams(location.search).get('signed_out') === '1';
  const { data, dataUpdatedAt, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ['auth-status'],
    queryFn: ({ signal }) => api<AuthStatus>('/api/auth/status', { signal, cache: 'no-store' }),
    retry: false,
    staleTime: 0,
    // Recheck while the sign-in/error screen is visible. Turning login off
    // on the server releases this screen without a frontend rebuild.
    refetchInterval: (query) => query.state.data?.authenticated ? false : 5000,
  });
  const profileEnabled = data?.mode === 'w3' && data.authenticated && !!data.actor;
  const { data: profile } = useQuery({
    queryKey: ['auth-profile', data?.mode, data?.actor?.id],
    queryFn: ({ signal }) => fetchOwnerProfile(data!.actor!, signal),
    enabled: profileEnabled,
    staleTime: 10 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const recheck = () => { void queryClient.invalidateQueries({ queryKey: ['auth-status'] }); };
    window.addEventListener(AUTH_REQUIRED_EVENT, recheck);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, recheck);
  }, [queryClient]);

  useEffect(() => {
    const reset = () => {
      setOpeningLogin(false);
      redirectingTo.current = null;
      void queryClient.invalidateQueries({ queryKey: ['auth-status'] });
    };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, [queryClient]);

  const loginUrl = signInUrl(data, location);
  const autoSignIn = !error && !isPending && shouldAutoSignIn(data, location.search);
  useEffect(() => {
    if (autoSignIn && redirectingTo.current !== loginUrl) {
      redirectingTo.current = loginUrl;
      // Replace the intermediate app entry in history; Back must not bounce through it.
      window.location.replace(loginUrl);
    }
  }, [autoSignIn, loginUrl, dataUpdatedAt]);

  // Owner lookup is presentation-only and must never delay access to the workspace.
  if (data?.authenticated && data.actor) return <>{children(profileEnabled ? profileForActor(data.actor, profile) : data.actor, data.mode)}</>;

  const recheckButton = <button type="button" className="auth-recheck" disabled={isFetching}
    onClick={() => { void refetch(); }}>
    {isFetching ? (zh ? '正在检查…' : 'Checking…') : (zh ? '重新检查登录状态' : 'Check sign-in status')}
  </button>;

  if (isPending || autoSignIn) return <div className="auth-stage"><div className="auth-card" role="status">
    <div className="auth-mark">C</div><p>{autoSignIn
      ? (zh ? '正在前往 Huawei W3…' : 'Redirecting to Huawei W3…')
      : (zh ? '正在检查登录状态…' : 'Checking your session…')}</p>
  </div></div>;

  if (error) return <div className="auth-stage"><div className="auth-card">
    <div className="auth-mark">!</div><h1>{zh ? '暂时无法连接服务' : 'Cannot reach the service'}</h1>
    <p role="status">{zh ? '正在尝试重新连接，你也可以点击下方按钮重试。' : 'We will check again shortly. You can also retry below.'}</p>
    {recheckButton}
  </div></div>;

  const loginUnavailable = data?.login_ready === false;
  const messages: Record<string, string> = {
    w3_cancelled: zh ? 'W3 登录已取消，请重试。' : 'W3 sign-in was cancelled. Please try again.',
    invalid_state: zh ? '登录状态已失效，请重新发起登录。' : 'The login state expired. Please start again.',
    missing_code: zh ? 'W3 没有返回授权码，请重新登录。' : 'W3 did not return an authorization code. Please try again.',
    w3_login_failed: zh ? 'W3 登录失败，请稍后重试。' : 'W3 sign-in failed. Please try again later.',
    w3_not_configured: zh ? '登录服务尚未就绪，请联系管理员。' : 'Sign-in is not ready yet. Please contact your administrator.',
  };

  return <div className="auth-stage"><div className="auth-card">
    <div className="auth-brand"><div className="auth-mark">C</div><div><strong>CARI</strong><small>Procurement Tracking</small></div></div>
    <h1>{signedOut ? (zh ? '已退出登录' : 'You are signed out') : (zh ? '无法完成 W3 登录' : 'W3 sign-in needs attention')}</h1>
    <p role="status">{messages[authError || ''] || (signedOut
      ? (zh ? '采购系统会话已清除，需要时可重新登录。' : 'Your procurement session has been cleared. You can sign in again when ready.')
      : (zh ? '请重试登录，或联系管理员。' : 'Please retry sign-in or contact your administrator.'))}</p>
    {loginUnavailable && <div className="auth-config-error" role="alert" id="auth-config-error">
      <strong>{zh ? 'W3 登录配置未完成' : 'W3 sign-in is not configured'}</strong>
      <p>{zh ? '请管理员补齐以下配置后重试；当前还无法跳转到 W3。' : 'Ask your administrator to complete the settings below. W3 sign-in cannot start yet.'}</p>
      <code>{data?.configuration_issues?.join(', ') || 'W3_CLIENT_ID / W3_CLIENT_SECRET'}</code>
    </div>}
    {loginUnavailable
      ? <button className="auth-button" type="button" disabled aria-describedby="auth-config-error"><span aria-hidden="true">H</span>{zh ? 'Huawei W3 账号登录' : 'Sign in with Huawei W3'}</button>
      : <a className="auth-button" href={loginUrl} aria-busy={openingLogin} onClick={(event) => {
        if (openingLogin) { event.preventDefault(); return; }
        setOpeningLogin(true);
      }}><span aria-hidden="true">H</span>{openingLogin ? (zh ? '正在打开 W3…' : 'Opening Huawei W3…') : (zh ? 'Huawei W3 账号登录' : 'Sign in with Huawei W3')}</a>}
    {recheckButton}
    <small className="auth-security">{zh ? 'W3 令牌由服务端处理，不会存储在浏览器中。' : 'W3 tokens are handled by the server and are not stored in your browser.'}</small>
  </div></div>;
}
