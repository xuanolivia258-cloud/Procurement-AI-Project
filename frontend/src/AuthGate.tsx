import { useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { api, appUrl, AUTH_REQUIRED_EVENT } from './api';
import type { Actor, AuthStatus } from './types';

export default function AuthGate({ language, children }: {
  language: 'en' | 'zh';
  children: (actor: Actor, mode: AuthStatus['mode']) => ReactNode;
}) {
  const zh = language === 'zh';
  const location = useLocation();
  const queryClient = useQueryClient();
  const authError = new URLSearchParams(location.search).get('auth_error');
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ['auth-status'],
    queryFn: ({ signal }) => api<AuthStatus>('/api/auth/status', { signal, cache: 'no-store' }),
    retry: false,
    staleTime: 0,
    // Recheck while the sign-in/error screen is visible. Turning login off
    // on the server releases this screen without a frontend rebuild.
    refetchInterval: (query) => query.state.data?.authenticated ? false : 5000,
  });

  useEffect(() => {
    const recheck = () => { void queryClient.invalidateQueries({ queryKey: ['auth-status'] }); };
    window.addEventListener(AUTH_REQUIRED_EVENT, recheck);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, recheck);
  }, [queryClient]);

  if (data?.authenticated && data.actor) return <>{children(data.actor, data.mode)}</>;

  const recheckButton = <button type="button" className="auth-recheck" disabled={isFetching}
    onClick={() => { void refetch(); }}>
    {isFetching ? (zh ? '正在检查…' : 'Checking…') : (zh ? '重新检查登录状态' : 'Check sign-in status')}
  </button>;

  if (isPending) return <div className="auth-stage"><div className="auth-card" role="status">
    <div className="auth-mark">C</div><p>{zh ? '正在检查登录状态…' : 'Checking your session…'}</p>
  </div></div>;

  if (error) return <div className="auth-stage"><div className="auth-card">
    <div className="auth-mark">!</div><h1>{zh ? '暂时无法连接服务' : 'Cannot reach the service'}</h1>
    <p role="status">{zh ? '正在尝试重新连接，你也可以点击下方按钮重试。' : 'We will check again shortly. You can also retry below.'}</p>
    {recheckButton}
  </div></div>;

  // Keep the in-app destination when a session expires or a bookmarked page
  // requires sign-in, but do not carry callback errors into the next visit.
  const nextParams = new URLSearchParams(location.search);
  nextParams.delete('auth_error');
  const nextQuery = nextParams.toString();
  const next = `${location.pathname}${nextQuery ? `?${nextQuery}` : ''}${location.hash}`;
  const loginUrl = `${appUrl(data?.login_url || '/api/auth/login')}?next=${encodeURIComponent(next)}`;
  const messages: Record<string, string> = {
    w3_cancelled: zh ? 'W3 登录已取消，请重试。' : 'W3 sign-in was cancelled. Please try again.',
    invalid_state: zh ? '登录状态已失效，请重新发起登录。' : 'The login state expired. Please start again.',
    missing_code: zh ? 'W3 没有返回授权码，请重新登录。' : 'W3 did not return an authorization code. Please try again.',
    w3_login_failed: zh ? 'W3 登录失败，请稍后重试。' : 'W3 sign-in failed. Please try again later.',
    w3_not_configured: zh ? '登录服务尚未就绪，请联系管理员。' : 'Sign-in is not ready yet. Please contact your administrator.',
  };

  return <div className="auth-stage"><div className="auth-card">
    <div className="auth-brand"><div className="auth-mark">C</div><div><strong>CARI</strong><small>Procurement Tracking</small></div></div>
    <h1>{zh ? '登录 CARI' : 'Sign in to CARI'}</h1>
    <p role="status">{messages[authError || ''] || (zh ? '使用 Huawei W3 企业账号继续。' : 'Continue with your Huawei W3 corporate account.')}</p>
    <a className="auth-button" href={loginUrl}><span aria-hidden="true">H</span>{zh ? 'Huawei W3 账号登录' : 'Sign in with Huawei W3'}</a>
    {recheckButton}
    <small className="auth-security">{zh ? 'W3 令牌由服务端处理，不会存储在浏览器中。' : 'W3 tokens are handled by the server and are not stored in your browser.'}</small>
  </div></div>;
}
