import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import App, { CegDonut, cegColor } from './App';
import { SIDEBAR_STORAGE_KEY } from './sidebarState';
import type { AuthStatus, DashboardData } from './types';

const clients: QueryClient[] = [];
afterEach(() => { clients.forEach((c) => c.clear()); clients.length = 0; vi.unstubAllGlobals(); });
const rows = [
  { ceg: 'Morgan Alexander Thompson', project_count: 3, usd_amount: '123456.78' },
  { ceg: 'Jamie Chen', project_count: 1, usd_amount: '43210.99' },
];
const dashboard: DashboardData = { lifecycle: { active: 3, completed: 1 }, overdue: 1,
  total_budget: '123456.78', priority: {}, procurement_status: {}, ceg_overview: rows };

describe('executive workspace presentation', () => {
  it.each([
    { language: 'en', collapsed: false }, { language: 'zh', collapsed: false },
    { language: 'en', collapsed: true }, { language: 'zh', collapsed: true },
  ])('keeps live figures and navigation in the $language workspace (collapsed=$collapsed)', ({ language, collapsed }) => {
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === SIDEBAR_STORAGE_KEY ? String(collapsed) : language });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, refetchOnMount: false } } });
    clients.push(client);
    client.setQueryData<AuthStatus>(['auth-status'], { authenticated: true, mode: 'w3',
      actor: { id: 'test.user', name: 'Test User', name_en: 'Alex Morgan', role: 'viewer' } });
    client.setQueryData(['dashboard'], dashboard);
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><App /></MemoryRouter></QueryClientProvider>);
    expect(html).toContain('123,456.78');
    expect(html).toContain('Morgan Alexander Thompson');
    expect(html).toContain('Alex Morgan');
    expect(html).toContain('href="/ai_procurement/api/auth/logout"');
    expect(html).toContain('id="workspace"');
    expect(html).not.toContain('class="topbar"');
    const sidebar = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
    expect(sidebar).toContain('user-menu-name">Alex Morgan');
    expect(sidebar).not.toContain('account-preferences');
    expect(sidebar).toContain('account-language');
    expect(sidebar).toContain('aria-haspopup="menu"');
    expect(html).toContain(`class="app-shell${collapsed ? ' sidebar-collapsed' : ''}"`);
    const toggleLabel = language === 'zh' ? (collapsed ? '展开侧栏' : '收起侧栏') : (collapsed ? 'Open sidebar' : 'Close sidebar');
    expect(sidebar).toContain(`aria-label="${toggleLabel}" aria-expanded="${!collapsed}" aria-controls="workspace-navigation"`);
    expect(sidebar).toContain(`aria-label="${language === 'zh' ? '仪表盘' : 'Dashboard'}"`);
    expect(sidebar).toContain('id="workspace-navigation"');
    expect(html).toContain('class="skip-link"');
    expect(html).toContain('href="/projects?lifecycle=active&amp;overdue=true"');
    expect(html).toContain('href="/budget-analysis"');
    expect(html).toContain(language === 'zh' ? '新建项目' : 'Create Project');
    expect(html).not.toContain('LOCAL TEST ENVIRONMENT');
    expect(html).not.toContain('Administrator');
  });

  it('retains full names and exact counts alongside the donut instead of clipped callouts', () => {
    const html = renderToStaticMarkup(<CegDonut title="Project Count" items={rows} values={[3, 1]} centerValue="4" centerLabel="Total Projects" />);
    expect(html).toContain('Morgan Alexander Thompson');
    expect(html).toContain('<small>3</small>');
    expect(html).toContain('75.0%');
    expect(html).toContain('25.0%');
    expect(html).toContain('aria-label="Project Count — CEG"');
    expect(html).not.toContain('ceg-callout-label');
  });

  it('labels exact currency amounts without changing their values', () => {
    const html = renderToStaticMarkup(<CegDonut kind="amount" title="USD Amount" items={rows} values={[123456.78, 43210.99]} centerValue="USD 166.7K" centerLabel="Total Amount" />);
    expect(html).toContain('USD 123,456.78');
    expect(html).toContain('USD 43,210.99');
  });

  it.each([{ values: [] }, { values: [0, 0] }, { values: [1, 0] }])('renders empty or single-category portfolios without NaN: $values', ({ values }) => {
    const html = renderToStaticMarkup(<CegDonut title="Count" items={rows.slice(0, values.length)} values={values} centerValue={String(values.reduce((a, b) => a + b, 0))} centerLabel="Projects" />);
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
    expect(html).toContain('<circle');
  });

  it('uses stable valid categorical colors without changing source records', () => {
    const before = structuredClone(rows);
    for (let i = 0; i < 30; i++) expect(cegColor(i)).toMatch(/^#[0-9a-f]{6}$/);
    expect(cegColor(0)).not.toBe(cegColor(1));
    renderToStaticMarkup(<CegDonut title="Count" items={rows} values={[3, 1]} centerValue="4" centerLabel="Projects" />);
    expect(rows).toEqual(before);
  });
});
