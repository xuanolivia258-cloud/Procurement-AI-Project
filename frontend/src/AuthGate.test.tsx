import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import AuthGate, { profileForActor, shouldAutoSignIn, signInUrl } from './AuthGate';
import UserMenu from './UserMenu';
import type { AuthStatus } from './types';
import { ApiError } from './api';

const clients: QueryClient[] = [];
function newClient() {
  // Render settled query states; network/polling behavior is not run during SSR.
  const client = new QueryClient({ defaultOptions: { queries: {
    retry: false, gcTime: Infinity, refetchOnMount: false, retryOnMount: false,
  } } });
  clients.push(client);
  return client;
}
afterEach(() => { clients.splice(0).forEach((client) => client.clear()); });

function renderGate(client: QueryClient, path = '/') {
  return renderToStaticMarkup(<QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[path]}>
      <AuthGate language="zh">{(actor, mode) => <div>Project workspace: {actor.id} / {mode}<UserMenu actor={actor} authMode={mode} language="en" onLanguageChange={() => {}} /></div>}</AuthGate>
    </MemoryRouter>
  </QueryClientProvider>);
}

describe('environment-controlled sign-in gate', () => {
  it('shows an actionable configuration error instead of a repeating login link', () => {
    const client = newClient();
    client.setQueryData<AuthStatus>(['auth-status'], {
      authenticated: false, mode: 'w3', actor: null, login_ready: false,
      configuration_issues: ['W3_CLIENT_ID', 'W3_CLIENT_SECRET'],
    });
    const html = renderGate(client, '/?auth_error=w3_not_configured');
    expect(html).toContain('W3 登录配置未完成');
    expect(html).toContain('W3_CLIENT_ID, W3_CLIENT_SECRET');
    expect(html).toContain('role="alert"');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('<a class="auth-button"');
    expect(html).not.toContain('Project workspace');
  });

  it('uses the canonical HTTPS login URL without adding the app prefix again', () => {
    const client = newClient();
    client.setQueryData<AuthStatus>(['auth-status'], {
      authenticated: false, mode: 'w3', actor: null, login_ready: true,
      login_url: 'https://ai4news.rnd.huawei.com/ai_procurement/api/auth/login',
    });
    const status = client.getQueryData<AuthStatus>(['auth-status']);
    expect(signInUrl(status, { pathname: '/projects', search: '', hash: '' })).toBe('https://ai4news.rnd.huawei.com/ai_procurement/api/auth/login?next=%2Fprojects');
    const html = renderGate(client, '/projects');
    expect(html).toContain('正在前往 Huawei W3');
    expect(html).not.toContain('Huawei W3 账号登录');
    expect(html).not.toContain('重新检查登录状态');
  });

  it('shows the W3 button and preserves the requested page without callback errors', () => {
    const client = newClient();
    client.setQueryData<AuthStatus>(['auth-status'], {
      authenticated: false, mode: 'w3', actor: null, login_url: '/api/auth/login',
    });
    const html = renderGate(client, '/projects?lifecycle=active&auth_error=w3_not_configured#budget');
    expect(html).toContain('Huawei W3 账号登录');
    expect(html).toContain('登录服务尚未就绪');
    expect(html).toContain('重新检查登录状态');
    expect(html).toContain('/ai_procurement/api/auth/login?next=%2Fprojects%3Flifecycle%3Dactive%23budget');
    expect(html).not.toContain('Project workspace');
  });

  it('opens the workspace after disabling login, even from a failed sign-in page', () => {
    const client = newClient();
    client.setQueryData<AuthStatus>(['auth-status'], { authenticated: false, mode: 'w3', actor: null });
    expect(renderGate(client)).toContain('正在前往 Huawei W3');
    client.setQueryData<AuthStatus>(['auth-status'], {
      authenticated: true, mode: 'disabled',
      actor: { id: 'local-test-user', name: 'Local Test User', role: 'admin' },
    });
    const html = renderGate(client, '/?auth_error=w3_login_failed');
    expect(html).toContain('Project workspace: local-test-user / disabled');
    expect(html).not.toContain('Huawei W3 账号登录');
    expect(html).not.toContain('W3 登录失败');
  });

  it('lets an authenticated W3 user continue without a sign-in button', () => {
    const client = newClient();
    client.setQueryData<AuthStatus>(['auth-status'], {
      authenticated: true, mode: 'w3', actor: { id: 'w3-user', name: 'User', role: 'admin' },
    });
    expect(renderGate(client)).toContain('Project workspace: w3-user / w3');
    expect(renderGate(client)).not.toContain('Huawei W3 账号登录');
  });

  it('offers a retry on a service failure without granting local access', async () => {
    const client = newClient();
    await client.fetchQuery({ queryKey: ['auth-status'], queryFn: () => {
      throw new Error('Service offline');
    } }).catch(() => {});
    const html = renderGate(client);
    expect(html).toContain('暂时无法连接服务');
    expect(html).toContain('重新检查登录状态');
    expect(html).not.toContain('Project workspace');
  });

  it('shows a dedicated access-denied page for an unassigned W3 account', async () => {
    const client = newClient();
    await client.fetchQuery({ queryKey: ['auth-status'], queryFn: () => {
      throw new ApiError(403, 'Access denied.', 'ACCESS_DENIED');
    } }).catch(() => {});
    const html = renderGate(client);
    expect(html).toContain('没有系统访问权限');
    expect(html).toContain('如需使用，请联系 Olivia Fang 84416467 开通权限');
    expect(html).not.toContain('/ai_procurement/api/auth/logout');
    expect(html).not.toContain('退出当前账号');
    expect(html).not.toContain('已退出登录');
    expect(html).not.toContain('Project workspace');
  });

  it('enriches the current header without changing the authenticated identity or audit name', () => {
    const actor = { id: 'l00123456', name: '王小明', role: 'viewer' as const };
    const profile = { ...actor, name: 'Other audit name', role: 'admin' as const, name_en: 'Alex Wang',
      avatar_url: 'https://w3.huawei.com/w3lab/rest/yellowpage/face/00123456/45' };
    expect(profileForActor(actor, profile)).toEqual({ ...actor, name_en: profile.name_en, avatar_url: profile.avatar_url });
    expect(profileForActor(actor, { ...profile, id: 'other.user' })).toBe(actor);
    const client = newClient();
    client.setQueryData<AuthStatus>(['auth-status'], { authenticated: true, mode: 'w3', actor });
    client.setQueryData(['auth-profile', 'w3', actor.id], profile);
    expect(renderGate(client)).toContain('user-menu-name">Alex Wang');
    expect(renderGate(client)).toContain('/face/00123456/45');
    client.setQueryData(['auth-profile', 'w3', actor.id], { ...profile, id: 'other.user' });
    expect(renderGate(client)).not.toContain('Alex Wang');
    client.setQueryData<AuthStatus>(['auth-status'], { authenticated: true, mode: 'disabled', actor });
    expect(renderGate(client)).not.toContain('Alex Wang');
  });

  it('opens the authenticated workspace while optional profile data is missing or failed', async () => {
    const client = newClient();
    client.setQueryData<AuthStatus>(['auth-status'], { authenticated: true, mode: 'w3',
      actor: { id: 'l00123456', name: 'W3 Fallback', role: 'viewer' } });
    expect(renderGate(client)).toContain('Project workspace');
    await client.fetchQuery({ queryKey: ['auth-profile', 'w3', 'l00123456'], queryFn: () => { throw new Error('Directory offline'); } }).catch(() => {});
    const html = renderGate(client);
    expect(html).toContain('Project workspace');
    expect(html).toContain('user-menu-name">W3 Fallback');
    expect(html).not.toContain('暂时无法连接服务');
  });

  it('does not silently sign back in after explicit logout', () => {
    const client = newClient();
    client.setQueryData<AuthStatus>(['auth-status'], { authenticated: false, mode: 'w3', actor: null, login_ready: true });
    const html = renderGate(client, '/?signed_out=1');
    expect(html).toContain('已退出登录');
    expect(html).toContain('Huawei W3 账号登录');
    expect(html).not.toContain('正在前往 Huawei W3');
    expect(html).toContain('/api/auth/login?next=%2F');
  });

  it('automatically signs in only for a ready, unauthenticated W3 session', () => {
    const ready: AuthStatus = { authenticated: false, mode: 'w3', actor: null, login_ready: true };
    expect(shouldAutoSignIn(ready, '?lifecycle=active')).toBe(true);
    expect(shouldAutoSignIn(undefined, '')).toBe(false);
    expect(shouldAutoSignIn({ ...ready, mode: 'disabled' }, '')).toBe(false);
    expect(shouldAutoSignIn({ ...ready, authenticated: true }, '')).toBe(false);
    expect(shouldAutoSignIn({ ...ready, login_ready: false }, '')).toBe(false);
    for (const search of ['?signed_out=1', '?auth_error=invalid_state', '?auth_error=w3_login_failed', '?auth_error=']) {
      expect(shouldAutoSignIn(ready, search)).toBe(false);
    }
    expect(signInUrl(ready, { pathname: '/projects', search: '?signed_out=1&auth_error=invalid_state&lifecycle=active', hash: '#budget' }))
      .toBe('/ai_procurement/api/auth/login?next=%2Fprojects%3Flifecycle%3Dactive%23budget');
  });
});
