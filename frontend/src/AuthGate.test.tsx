import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import AuthGate from './AuthGate';
import type { AuthStatus } from './types';

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
      <AuthGate language="zh">{(actor, mode) => <div>Project workspace: {actor.id} / {mode}</div>}</AuthGate>
    </MemoryRouter>
  </QueryClientProvider>);
}

describe('environment-controlled sign-in gate', () => {
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
    expect(renderGate(client)).toContain('Huawei W3 账号登录');
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
});
