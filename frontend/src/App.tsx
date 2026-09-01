import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, NavLink, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { api, ApiError, queryString } from './api';
import type { AuditLog, BudgetAnalysisData, CegAnalysisData, CegAnalysisItem, DashboardData, PaginatedProjects, Project, ProjectInput, ReferenceOption } from './types';

const emptyProject: ProjectInput = {
  project_priority: '', ceg: '', requestor: '', bu: '', request_date: '', budget: '', currency: '', exchange_rate: '', usd_amount: '', exchange_rate_at: '', description: '',
  supplier_name: '', supplier_type: '', procurement_strategy: '', procurement_status: '', procurement_status_notes: '', ec_form: '',
  pr_approved_date: '', estimated_closing_date: '', contract_required: '', po_release_date: '',
};

const CEG_OPTIONS = ['Jessie Lin', 'Warren Joseph Litwin', 'Jerry Chang', 'Abby Ho', 'Yiwen Chen'];

const copy = {
  en: { dashboard: 'Dashboard', projects: 'Projects', analysis: 'Analysis', settings: 'Options', recycleBin: 'Recycle Bin', create: 'Create Project', edit: 'Edit Project', save: 'Save', cancel: 'Cancel', export: 'Export Excel', all: 'All', filters: 'Filters', audit: 'Audit History', active: 'Active', completed: 'Completed', overdue: 'Overdue', totalBudget: 'Total Amount for Active', noProjects: 'No matching projects', conflict: 'This project changed elsewhere. Your entries are preserved; refresh before saving again.' },
  zh: { dashboard: '仪表盘', projects: '项目', analysis: '分析', settings: '选项管理', recycleBin: '回收站', create: '新建项目', edit: '编辑项目', save: '保存', cancel: '取消', export: '导出 Excel', all: '全部', filters: '筛选', audit: '修改历史', active: '进行中', completed: '已完成', overdue: '已逾期', totalBudget: '进行中项目总金额', noProjects: '没有匹配的项目', conflict: '该项目已被其他用户修改。当前输入已保留，请刷新后重新保存。' },
};

type Language = keyof typeof copy;
type Translation = { [K in keyof typeof copy.en]: string };

function NavIcon({ name }: { name: 'dashboard' | 'projects' | 'analysis' | 'options' | 'recycle' }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (name === 'dashboard') return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
  if (name === 'projects') return <svg {...common}><path d="M3 7.5h7l2 2h9v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Z"/><path d="M3 7.5V5a2 2 0 0 1 2-2h4l2 2h4"/><path d="M8 14h8M8 17h6"/></svg>;
  if (name === 'analysis') return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/><path d="m4 7 6-4 6 7 5-4"/></svg>;
  if (name === 'recycle') return <svg {...common}><path d="M4 7h16M9 3h6l1 4H8l1-4ZM6.5 7l.8 14h9.4l.8-14M10 11v6M14 11v6"/></svg>;
  return <svg {...common}><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="14" cy="18" r="2"/></svg>;
}

function ProjectNavigation({ t }: { t: Translation }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const onProjects = location.pathname === '/projects';
  const overdue = onProjects && params.get('overdue') === 'true';
  const completed = onProjects && !overdue && params.get('lifecycle') === 'completed';
  const active = onProjects && !overdue && !completed;
  return <div className="project-nav-group"><NavLink to="/projects" title={t.projects} aria-expanded={onProjects}><NavIcon name="projects"/><span>{t.projects}</span><b className="project-nav-chevron" aria-hidden="true">⌄</b></NavLink><div className="project-subnav"><Link title={t.active} aria-label={t.active} className={`active-projects${active ? ' active' : ''}`} to="/projects?lifecycle=active" aria-current={active ? 'page' : undefined}><i/>{t.active}</Link><Link title={t.completed} aria-label={t.completed} className={`completed-projects${completed ? ' active' : ''}`} to="/projects?lifecycle=completed" aria-current={completed ? 'page' : undefined}><i/>{t.completed}</Link><Link title={t.overdue} aria-label={t.overdue} className={`overdue-projects${overdue ? ' active' : ''}`} to="/projects?lifecycle=active&overdue=true" aria-current={overdue ? 'page' : undefined}><i/>{t.overdue}</Link></div></div>;
}

export function toPayload(values: ProjectInput) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === '' ? null : value]));
}

function Layout({ language, setLanguage }: { language: Language; setLanguage: (value: Language) => void }) {
  const t = copy[language];
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark" role="img" aria-label="Maple leaf">🍁︎</span><span>CARI<br/><small>Procurement Tracking</small></span></div>
      <nav>
        <NavLink to="/" title={t.dashboard}><NavIcon name="dashboard"/><span>{t.dashboard}</span></NavLink>
        <ProjectNavigation t={t}/>
        <NavLink to="/analysis" title={t.analysis}><NavIcon name="analysis"/><span>{t.analysis}</span></NavLink>
        <NavLink to="/recycle-bin" title={t.recycleBin}><NavIcon name="recycle"/><span>{t.recycleBin}</span></NavLink>
      </nav>
      <div className="local-user"><span>LT</span><div>Local Test User<small>Administrator</small></div></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><span className="environment">LOCAL TEST ENVIRONMENT</span><button className="language" onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}>{language === 'en' ? '中文' : 'English'}</button></header>
      <Routes>
        <Route path="/" element={<Dashboard language={language} />} />
        <Route path="/projects" element={<Projects language={language} />} />
        <Route path="/analysis" element={<Analysis language={language} />} />
        <Route path="/budget-analysis" element={<BudgetAnalysis />} />
        <Route path="/recycle-bin" element={<RecycleBin language={language} />} />
        <Route path="/settings" element={<Options language={language} />} />
      </Routes>
    </main>
  </div>;
}

function Dashboard({ language }: { language: Language }) {
  const t = copy[language];
  const [creatingProject, setCreatingProject] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<DashboardData>('/api/dashboard') });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  return <section className="page dashboard-page">
    <div className="page-heading"><div><p className="eyebrow">PROJECT OVERVIEW</p><h1>{t.dashboard}</h1></div><div className="heading-actions"><button className="button primary" type="button" onClick={() => setCreatingProject(true)}>＋ {t.create}</button></div></div>
    <div className="metric-grid">
      <Metric label={t.active} value={data.lifecycle.active || 0} tone="purple" to="/projects?lifecycle=active" />
      <Metric label={t.completed} value={data.lifecycle.completed || 0} tone="green" to="/projects?lifecycle=completed" />
      <Metric label={t.overdue} value={data.overdue} tone="red" to="/projects?lifecycle=active&overdue=true" />
      <Metric label={t.totalBudget} value={`USD ${Number(data.total_budget).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} tone="blue" wide to="/budget-analysis" />
    </div>
    <div className="dashboard-grid">
      <CegOverviewChart items={data.ceg_overview}/>
    </div>
    {creatingProject && <ProjectDialog project={null} language={language} close={() => setCreatingProject(false)} />}
  </section>;
}

function CegOverviewChart({ items }: { items: DashboardData['ceg_overview'] }) {
  const totalProjects = items.reduce((sum, item) => sum + item.project_count, 0);
  const totalAmount = items.reduce((sum, item) => sum + Number(item.usd_amount), 0);
  return <article className="panel ceg-preview"><header><div><h2>CEG Overview</h2><p>All active and completed projects</p></div><Link to="/analysis">View Full Analysis →</Link></header>{items.length ? <div className="ceg-pies"><CegDonut title="Project Count" items={items} values={items.map((item) => item.project_count)} centerValue={String(totalProjects)} centerLabel="Total Projects"/><CegDonut title="USD Amount" items={items} values={items.map((item) => Number(item.usd_amount))} centerValue={`USD ${formatCompactNumber(totalAmount)}`} centerLabel="Total Amount"/></div> : <div className="analysis-empty compact">No CEG data available.</div>}</article>;
}

function cegColor(index: number) { return `hsl(${Math.round((index * 137.508 + 214) % 360)} 68% ${index % 3 === 0 ? 48 : index % 3 === 1 ? 56 : 42}%)`; }

function CegDonut({ title, items, values, centerValue, centerLabel }: { title: string; items: DashboardData['ceg_overview']; values: number[]; centerValue: string; centerLabel: string }) {
  const entries = items.map((item, index) => ({ item, value: values[index], color: cegColor(index) })).filter((entry) => entry.value > 0);
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  let angle = -90;
  const slices = entries.map((entry) => { const start = angle; const end = angle + entry.value / total * 360; angle = end; return { ...entry, start, end, mid: (start + end) / 2 }; });
  const labels = layoutDonutLabels(slices);
  return <div className="ceg-pie-card"><h3>{title}</h3><svg className="ceg-donut-svg" viewBox="0 0 440 320" role="img" aria-label={`${title} by CEG. ${centerLabel} ${centerValue}`}>
    {total <= 0 ? <circle cx="220" cy="155" r="87" fill="none" stroke="#ededf0" strokeWidth="44"/> : slices.length === 1 ? <circle cx="220" cy="155" r="87" fill="none" stroke={slices[0].color} strokeWidth="44"><title>{`${slices[0].item.ceg}: ${formatAmount(slices[0].value)}`}</title></circle> : slices.map((slice) => <path key={slice.item.ceg} d={donutPath(220, 155, 109, 65, slice.start, slice.end)} fill={slice.color} stroke="#fff" strokeWidth="2"><title>{`${slice.item.ceg}: ${formatAmount(slice.value)}`}</title></path>)}
    {labels.map((label) => <g key={label.item.ceg}><polyline points={`${label.x1},${label.y1} ${label.x2},${label.y2} ${label.x3},${label.y3}`} fill="none" stroke={label.color} strokeWidth="1.5"/><circle cx={label.x1} cy={label.y1} r="3" fill={label.color}/><text x={label.textX} y={label.y3 + 3} textAnchor={label.anchor} className="ceg-callout-label">{label.item.ceg}</text></g>)}
    <circle cx="220" cy="155" r="62" fill="#fff"/><text x="220" y="151" textAnchor="middle" className="ceg-donut-total">{centerValue}</text><text x="220" y="170" textAnchor="middle" className="ceg-donut-caption">{centerLabel}</text>
  </svg></div>;
}

function layoutDonutLabels<T extends { item: DashboardData['ceg_overview'][number]; color: string; mid: number }>(slices: T[]) {
  const positioned = slices.map((slice) => { const radians = slice.mid * Math.PI / 180; const right = Math.cos(radians) >= 0; return { ...slice, right, x1: 220 + Math.cos(radians) * 111, y1: 155 + Math.sin(radians) * 111, x2: 220 + Math.cos(radians) * 129, y2: 155 + Math.sin(radians) * 129, y3: 155 + Math.sin(radians) * 142 }; });
  for (const right of [false, true]) { const side = positioned.filter((item) => item.right === right).sort((a, b) => a.y3 - b.y3); side.forEach((item, index) => { item.y3 = Math.max(18 + index * 18, item.y3, index ? side[index - 1].y3 + 18 : 18); }); if (side.length && side[side.length - 1].y3 > 296) { const shift = side[side.length - 1].y3 - 296; side.forEach((item) => { item.y3 -= shift; }); } }
  return positioned.map((item) => ({ ...item, x3: item.right ? 350 : 90, textX: item.right ? 355 : 85, anchor: item.right ? 'start' as const : 'end' as const }));
}

function donutPath(cx: number, cy: number, outer: number, inner: number, start: number, end: number) {
  const point = (radius: number, degrees: number) => { const radians = degrees * Math.PI / 180; return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)]; };
  const [x1, y1] = point(outer, start), [x2, y2] = point(outer, end), [x3, y3] = point(inner, end), [x4, y4] = point(inner, start);
  const large = end - start > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`;
}

function Metric({ label, value, tone, wide = false, to }: { label: string; value: string | number; tone: string; wide?: boolean; to?: string }) {
  const content = <><span>{label}</span><strong>{value}</strong>{to && <small>View projects →</small>}</>;
  return to
    ? <Link className={`metric metric-link ${tone} ${wide ? 'wide' : ''}`} to={to} aria-label={`${label}: ${value}. View projects`}>{content}</Link>
    : <article className={`metric ${tone} ${wide ? 'wide' : ''}`}>{content}</article>;
}

function Analysis({ language }: { language: Language }) {
  const t = copy[language];
  const [reportOpen, setReportOpen] = useState(false);
  const [filters, setFilters] = useState({ from_month: '', to_month: '', ceg: '', lifecycle: '', priority: '' });
  const validRange = !filters.from_month || !filters.to_month || filters.from_month <= filters.to_month;
  const query = queryString(filters);
  const { data, isLoading, error } = useQuery({ queryKey: ['ceg-analysis', filters], queryFn: () => api<CegAnalysisData>(`/api/ceg-analysis?${query}`), enabled: validRange });
  const update = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  return <section className="page analysis-page">
    <div className="page-heading"><div><p className="eyebrow">PORTFOLIO INTELLIGENCE</p><h1>{t.analysis}</h1></div><div className="heading-actions"><button className="button primary" type="button" onClick={() => setReportOpen(true)}>Create Monthly Report</button></div></div>
    <div className="analysis-filters panel">
      <label>From Month<input type="month" value={filters.from_month} onChange={(event) => update('from_month', event.target.value)} /></label>
      <label>To Month<input type="month" value={filters.to_month} onChange={(event) => update('to_month', event.target.value)} /></label>
      <label>CEG<select value={filters.ceg} onChange={(event) => update('ceg', event.target.value)}><option value="">{t.all}</option>{data?.options.ceg.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Lifecycle<select value={filters.lifecycle} onChange={(event) => update('lifecycle', event.target.value)}><option value="">{t.all}</option><option value="active">{t.active}</option><option value="completed">{t.completed}</option></select></label>
      <label>Priority<select value={filters.priority} onChange={(event) => update('priority', event.target.value)}><option value="">{t.all}</option><option>High</option><option>Medium</option><option>Normal</option></select></label>
      <button className="button secondary analysis-clear" type="button" onClick={() => setFilters({ from_month: '', to_month: '', ceg: '', lifecycle: '', priority: '' })}>Clear Filters</button>
    </div>
    {!validRange ? <div className="error-box">From Month cannot be later than To Month.</div> : isLoading ? <Loading /> : error ? <ErrorBox error={error} /> : data && <>
      <div className="analysis-metrics"><article><span>Total Projects</span><strong>{data.totals.project_count}</strong></article><article><span>Total USD Amount</span><strong>USD {formatAmount(data.totals.usd_amount)}</strong></article><article><span>High Priority Projects</span><strong>{data.totals.high_priority_count}</strong></article></div>
      <div className="analysis-chart-grid"><CegValueChart items={data.items} mode="count"/><CegValueChart items={data.items} mode="amount"/></div>
      <PriorityMixChart items={data.items}/>
    </>}
    {reportOpen && <MonthlyReportDialog cegOptions={data?.options.ceg || []} initialCeg={filters.ceg} close={() => setReportOpen(false)}/>}
  </section>;
}

function MonthlyReportDialog({ cegOptions, initialCeg, close }: { cegOptions: string[]; initialCeg: string; close: () => void }) {
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [month, setMonth] = useState(defaultMonth);
  const [ceg, setCeg] = useState(initialCeg);
  const [previewUrl, setPreviewUrl] = useState('');
  const reportQuery = queryString({ month, ceg });
  const preview = () => { if (month) setPreviewUrl(`/api/monthly-report.html?${reportQuery}`); };
  const downloadUrl = `/api/monthly-report.html?${queryString({ month, ceg, download: true })}`;
  return <div className="modal-backdrop"><div className="modal report-modal" role="dialog" aria-modal="true" aria-labelledby="monthly-report-title"><header><div><p className="eyebrow">MONTHLY REPORT</p><h2 id="monthly-report-title">Procurement Project Monthly Report</h2></div><button aria-label="Close" onClick={close}>×</button></header><div className="report-dialog-body"><div className="report-settings"><label>Report Month<input type="month" required value={month} onChange={(event) => { setMonth(event.target.value); setPreviewUrl(''); }} /></label><label>CEG<select value={ceg} onChange={(event) => { setCeg(event.target.value); setPreviewUrl(''); }}><option value="">All</option>{cegOptions.map((name) => <option key={name}>{name}</option>)}</select></label><button className="button secondary" type="button" disabled={!month} onClick={preview}>Preview Report</button><a className={`button primary${!month ? ' disabled' : ''}`} href={month ? downloadUrl : undefined}>Download HTML</a></div><p className="report-scope-note">Projects are included when their PR Approved Date falls within the selected month. Deleted projects are excluded.</p>{previewUrl ? <iframe className="report-preview" title="Procurement Project Monthly Report preview" src={previewUrl}/> : <div className="report-preview-empty"><strong>Preview your report</strong><span>Select the reporting scope, then click Preview Report.</span></div>}</div></div></div>;
}

function CegValueChart({ items, mode }: { items: CegAnalysisItem[]; mode: 'count' | 'amount' }) {
  const shown = [...items].sort((left, right) => {
    const leftValue = mode === 'count' ? left.project_count : Number(left.usd_amount);
    const rightValue = mode === 'count' ? right.project_count : Number(right.usd_amount);
    return rightValue - leftValue || left.ceg.localeCompare(right.ceg);
  }).slice(0, 12);
  const values = shown.map((item) => mode === 'count' ? item.project_count : Number(item.usd_amount));
  const max = Math.max(1, ...values);
  return <article className="panel ceg-chart"><header><h2>{mode === 'count' ? 'Projects by CEG' : 'USD Amount by CEG'}</h2><p>{items.length > 12 ? 'Top 12 CEGs shown' : 'Current filtered portfolio'}</p></header>{!shown.length ? <div className="analysis-empty">No matching CEG data.</div> : <div className="horizontal-bars">{shown.map((item, index) => { const value = values[index]; return <div className="horizontal-bar" key={item.ceg}><span title={item.ceg}>{item.ceg}</span><div><i style={{ width: `${(value / max) * 100}%` }}/></div><strong>{mode === 'count' ? value : `USD ${formatCompactNumber(value)}`}</strong></div>; })}</div>}</article>;
}

function PriorityMixChart({ items }: { items: CegAnalysisItem[] }) {
  const sortedItems = [...items].sort((left, right) => right.high_priority_count - left.high_priority_count || right.project_count - left.project_count || left.ceg.localeCompare(right.ceg));
  return <article className="panel priority-mix"><header><div><h2>Priority Mix by CEG</h2><p>High, Medium, and Normal projects</p></div><div className="priority-legend"><span className="high">High</span><span className="medium">Medium</span><span className="normal">Normal</span></div></header>{!sortedItems.length ? <div className="analysis-empty">No matching priority data.</div> : <div className="priority-stack-list">{sortedItems.slice(0, 15).map((item) => { const total = item.high_priority_count + item.medium_priority_count + item.normal_priority_count; return <div className="priority-stack-row" key={item.ceg}><span title={item.ceg}>{item.ceg}</span><div>{total > 0 && <><i className="high" style={{ width: `${item.high_priority_count / total * 100}%` }} title={`High: ${item.high_priority_count}`}>{item.high_priority_count > 0 && <small>{item.high_priority_count}</small>}</i><i className="medium" style={{ width: `${item.medium_priority_count / total * 100}%` }} title={`Medium: ${item.medium_priority_count}`}>{item.medium_priority_count > 0 && <small>{item.medium_priority_count}</small>}</i><i className="normal" style={{ width: `${item.normal_priority_count / total * 100}%` }} title={`Normal: ${item.normal_priority_count}`}>{item.normal_priority_count > 0 && <small>{item.normal_priority_count}</small>}</i></>}</div></div>; })}</div>}</article>;
}

function formatAmount(value: string | number) { return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatCompactNumber(value: number) { if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`; if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`; return formatAmount(value); }

function BudgetAnalysis() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [fromMonth, setFromMonth] = useState(`${now.getFullYear()}-01`);
  const [toMonth, setToMonth] = useState(currentMonth);
  const validRange = !fromMonth || !toMonth || fromMonth <= toMonth;
  const query = queryString({ from_month: fromMonth, to_month: toMonth });
  const { data, isLoading, error } = useQuery({ queryKey: ['budget-analysis', fromMonth, toMonth], queryFn: () => api<BudgetAnalysisData>(`/api/budget-analysis?${query}`), enabled: validRange });
  return <section className="page budget-analysis-page">
    <div className="page-heading"><div><p className="eyebrow">FINANCIAL OVERVIEW</p><h1>Total Amount for Active</h1><p>Monthly USD Amount for active projects, grouped by PR Approved Date.</p></div></div>
    <div className="budget-month-filters panel"><label>From Month<input type="month" value={fromMonth} onChange={(event) => setFromMonth(event.target.value)} /></label><label>To Month<input type="month" value={toMonth} onChange={(event) => setToMonth(event.target.value)} /></label></div>
    {!validRange ? <div className="error-box">From Month cannot be later than To Month.</div> : isLoading ? <Loading /> : error ? <ErrorBox error={error} /> : data && <>
      <div className="budget-summary"><article><span>Active Project USD Amount</span><strong>USD {Number(data.total_usd_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></article></div>
      <MonthlyBudgetChart data={data.monthly} title="Monthly USD Amount" />
    </>}
  </section>;
}

function MonthlyBudgetChart({ data, title }: { data: BudgetAnalysisData['monthly']; title: string }) {
  const width = 900, height = 300, left = 82, right = 28, top = 28, bottom = 52;
  const chartWidth = width - left - right, chartHeight = height - top - bottom;
  const values = data.map((item) => Number(item.usd_amount));
  const max = Math.max(1, ...values);
  const step = data.length ? chartWidth / data.length : chartWidth;
  const labelEvery = Math.max(1, Math.ceil(data.length / 12));
  const y = (value: number) => top + chartHeight - (value / max) * chartHeight;
  const points = data.map((item, index) => `${left + step * index + step / 2},${y(Number(item.usd_amount))}`).join(' ');
  return <article className="budget-chart panel"><header><div><h2>{title}</h2><p>Grouped by PR Approved month · USD</p></div><div className="chart-legend"><span className="bar-key">Monthly amount</span><span className="line-key">Amount trend</span></div></header>{!data.length ? <div className="chart-empty">No projects have a PR Approved Date in this range.</div> : <div className="chart-scroll"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
    {[0, .25, .5, .75, 1].map((ratio) => { const lineY = top + chartHeight * (1 - ratio); return <g key={ratio}><line x1={left} y1={lineY} x2={width - right} y2={lineY} className="chart-grid"/><text x={left - 12} y={lineY + 4} textAnchor="end" className="chart-y-label">{formatCompactUsd(max * ratio)}</text></g>; })}
    {data.map((item, index) => { const value = Number(item.usd_amount); const barHeight = chartHeight - (y(value) - top); return <rect key={item.month} x={left + step * index + step * .18} y={y(value)} width={step * .64} height={barHeight} rx="5" className="budget-bar"><title>{item.month}: USD {value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</title></rect>; })}
    <polyline points={points} className="budget-line"/>{data.map((item, index) => <circle key={item.month} cx={left + step * index + step / 2} cy={y(Number(item.usd_amount))} r="4" className="budget-point"><title>{item.month}: USD {Number(item.usd_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</title></circle>)}
    {data.map((item, index) => index % labelEvery === 0 && <text key={item.month} x={left + step * index + step / 2} y={height - 20} textAnchor="middle" className="chart-x-label">{item.month}</text>)}
  </svg></div>}</article>;
}

function formatCompactUsd(value: number) {
  if (value >= 1_000_000) return `USD ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `USD ${(value / 1_000).toFixed(0)}K`;
  return `USD ${Math.round(value)}`;
}

function Projects({ language }: { language: Language }) {
  const t = copy[language];
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Project | null | 'new'>(null);
  const [copying, setCopying] = useState<Project | null>(null);
  const [moreFilters, setMoreFilters] = useState(() => Boolean(params.get('ceg') || params.get('requestor') || params.get('procurement_status') || params.get('pr_approved_from') || params.get('pr_approved_to') || params.get('closing_from') || params.get('closing_to') || params.get('po_release_from') || params.get('po_release_to')));
  const { data: filterOptions = [] } = useQuery({ queryKey: ['options', 'active'], queryFn: () => api<ReferenceOption[]>('/api/reference-options') });
  const filters = useMemo(() => ({
    page: Number(params.get('page') || 1), page_size: 20,
    keyword: params.get('keyword') || '', ceg: params.get('ceg') || '', priority: params.get('priority') || '',
    lifecycle: params.has('lifecycle') ? params.get('lifecycle') || '' : 'active', procurement_status: params.get('procurement_status') || '',
    bu: params.get('bu') || '', requestor: params.get('requestor') || '', overdue: params.get('overdue') || '',
    pr_approved_from: params.get('pr_approved_from') || '', pr_approved_to: params.get('pr_approved_to') || '', closing_from: params.get('closing_from') || '', closing_to: params.get('closing_to') || '', po_release_from: params.get('po_release_from') || '', po_release_to: params.get('po_release_to') || '',
  }), [params]);
  const { data, isLoading, error } = useQuery({ queryKey: ['projects', filters], queryFn: () => api<PaginatedProjects>(`/api/projects?${queryString(filters)}`) });
  const updateFilter = (key: string, value: string) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); if (key !== 'page') next.set('page', '1'); setParams(next); };
  const transition = useMutation({
    mutationFn: ({ project, action }: { project: Project; action: string }) => api<Project>(`/api/projects/${project.id}/${action}`, { method: 'POST', body: JSON.stringify({ version: project.version }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['projects'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); },
  });
  const bulkRemove = useMutation({
    mutationFn: (projects: Project[]) => api<{ deleted: number }>('/api/projects/bulk-delete', { method: 'POST', body: JSON.stringify({ projects: projects.map(({ id, version }) => ({ id, version })) }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['projects'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); },
  });
  const activeFilters = [
    ['keyword', 'Search', filters.keyword], ['priority', 'Priority', filters.priority],
    ['bu', 'BU', filters.bu], ['ceg', 'CEG', filters.ceg],
    ['requestor', 'BU Requestor', filters.requestor], ['procurement_status', 'Status', filters.procurement_status],
    ['pr_approved_from', 'PR Approved from', filters.pr_approved_from], ['pr_approved_to', 'PR Approved to', filters.pr_approved_to],
    ['closing_from', 'Closing from', filters.closing_from], ['closing_to', 'Closing to', filters.closing_to],
    ['po_release_from', 'PO Release from', filters.po_release_from], ['po_release_to', 'PO Release to', filters.po_release_to],
  ].filter(([, , value]) => value);
  const projectActions = {
    onEdit: setEditing,
    onCopy: setCopying,
    onTransition: (project: Project, action: string) => { if (confirm(`Confirm ${action}?`)) transition.mutate({ project, action }); },
  };
  const exportUrl = `/api/projects-export.xlsx?${queryString({ ...filters, language })}`;
  return <section className="page projects-page">
    <div className="page-heading"><div><p className="eyebrow">PROJECT PORTFOLIO</p><h1>{t.projects}</h1></div><div className="heading-actions"><a className="button secondary" href={exportUrl}>{t.export}</a></div></div>
    <div className="filters panel"><div className="filter-main">
      <label>Search<input value={filters.keyword} onChange={(e) => updateFilter('keyword', e.target.value)} placeholder="CEG, supplier, description…" /></label>
      <label>Priority<select value={filters.priority} onChange={(e) => updateFilter('priority', e.target.value)}><option value="">{t.all}</option><option>High</option><option>Medium</option><option>Normal</option></select></label>
      <label>BU<input value={filters.bu} onChange={(e) => updateFilter('bu', e.target.value)} /></label>
      <button type="button" className="more-filters" onClick={() => setMoreFilters((value) => !value)}>{moreFilters ? 'Fewer Filters' : 'More Filters'} <span>{moreFilters ? '−' : '+'}</span></button>
    </div>{moreFilters && <div className="filter-advanced">
      <label>CEG<input value={filters.ceg} onChange={(e) => updateFilter('ceg', e.target.value)} /></label>
      <label>BU Requestor<input value={filters.requestor} onChange={(e) => updateFilter('requestor', e.target.value)} /></label>
      <label>Procurement Status<select value={filters.procurement_status} onChange={(e) => updateFilter('procurement_status', e.target.value)}><option value="">{t.all}</option>{filterOptions.filter((item) => item.category === 'procurement_status').map((item) => <option key={item.id} value={item.code}>{language === 'zh' ? item.label_zh : item.label_en}</option>)}</select></label>
      <label>PR Approved From<input type="date" value={filters.pr_approved_from} onChange={(e) => updateFilter('pr_approved_from', e.target.value)} /></label>
      <label>PR Approved To<input type="date" value={filters.pr_approved_to} onChange={(e) => updateFilter('pr_approved_to', e.target.value)} /></label>
      <label>Closing from<input type="date" value={filters.closing_from} onChange={(e) => updateFilter('closing_from', e.target.value)} /></label>
      <label>Closing to<input type="date" value={filters.closing_to} onChange={(e) => updateFilter('closing_to', e.target.value)} /></label>
      <label>PO Release From<input type="date" value={filters.po_release_from} onChange={(e) => updateFilter('po_release_from', e.target.value)} /></label>
      <label>PO Release To<input type="date" value={filters.po_release_to} onChange={(e) => updateFilter('po_release_to', e.target.value)} /></label>
    </div>}{activeFilters.length > 0 && <div className="filter-chips">{activeFilters.map(([key, label, value]) => <button type="button" key={key} onClick={() => updateFilter(key, '')}><span>{label}:</span> {value} ×</button>)}<button type="button" className="clear-filters" onClick={() => setParams({})}>Clear all</button></div>}</div>
    {isLoading ? <Loading /> : error ? <ErrorBox error={error} /> : <ProjectTable data={data!} {...projectActions} onBulkDelete={(projects) => bulkRemove.mutateAsync(projects)} bulkDeleting={bulkRemove.isPending} t={t} setPage={(page) => updateFilter('page', String(page))} />}
    {editing && <ProjectDialog project={editing === 'new' ? null : editing} language={language} close={() => setEditing(null)} />}
    {copying && <ProjectDialog project={copying} copyMode language={language} close={() => setCopying(null)} />}
  </section>;
}

function ProjectTable({ data, onEdit, onCopy, onTransition, onBulkDelete, bulkDeleting, t, setPage }: { data: PaginatedProjects; onEdit: (p: Project) => void; onCopy: (p: Project) => void; onTransition: (p: Project, action: string) => void; onBulkDelete: (projects: Project[]) => Promise<unknown>; bulkDeleting: boolean; t: Translation; setPage: (page: number) => void }) {
  const [openActions, setOpenActions] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const selectedProjects = data.items.filter((project) => selectedIds.has(project.id));
  const allSelected = data.items.length > 0 && data.items.every((project) => selectedIds.has(project.id));
  useEffect(() => { setSelectedIds((current) => new Set([...current].filter((id) => data.items.some((project) => project.id === id)))); }, [data.items]);
  useEffect(() => {
    if (openActions === null) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest('.row-actions details')) setOpenActions(null);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [openActions]);
  if (!data.items.length) return <><div className="panel empty-large">{t.noProjects}</div><div className="project-table-footer"><strong>Total: {data.total} projects</strong></div></>;
  const columns = ['Priority','CEG','BU','BU Requestor','Supplier Name','Amount (excl.tax)','Currency','USD Amount','Procurement Status','Estimated Closing Date','Project Cycle','Actions'];
  const deleteSelected = async () => { if (!selectedProjects.length || !confirm(`Move ${selectedProjects.length} selected project${selectedProjects.length === 1 ? '' : 's'} to the Recycle Bin?`)) return; await onBulkDelete(selectedProjects); setSelectedIds(new Set()); };
  return <><div className="bulk-actions"><span>{selectedProjects.length ? `${selectedProjects.length} selected` : 'Select projects to manage'}</span><button className="button bulk-delete" disabled={!selectedProjects.length || bulkDeleting} onClick={deleteSelected}>{bulkDeleting ? 'Moving…' : `Move to Recycle Bin${selectedProjects.length ? ` (${selectedProjects.length})` : ''}`}</button></div><div className="table-wrap panel"><table className="projects-table"><thead><tr><th className="col-select"><input type="checkbox" aria-label="Select all projects on this page" checked={allSelected} onChange={(event) => setSelectedIds(event.target.checked ? new Set(data.items.map((project) => project.id)) : new Set())}/></th>{columns.map((item) => <th key={item} className={`col-${item.toLowerCase().replaceAll(/[^a-z]+/g, '-')}`}>{item}</th>)}</tr></thead><tbody>{data.items.map((project) => <tr key={project.id} className={project.is_overdue ? 'overdue-row' : ''}>
    <td className="col-select"><input type="checkbox" aria-label={`Select project ${project.ceg || project.id}`} checked={selectedIds.has(project.id)} onChange={(event) => setSelectedIds((current) => { const next = new Set(current); event.target.checked ? next.add(project.id) : next.delete(project.id); return next; })}/></td><td className="col-priority"><span className={`priority ${project.project_priority?.toLowerCase() || ''}`}>{project.project_priority || '—'}</span></td><td className="col-ceg"><b>{project.ceg || '—'}</b></td><td className="col-bu">{project.bu || '—'}</td><td>{project.requestor || '—'}</td><td>{project.supplier_name || '—'}</td><td className="amount-cell">{project.budget ? Number(project.budget).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td><td>{project.currency || '—'}</td><td className="amount-cell">{project.usd_amount ? `USD ${Number(project.usd_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td><td>{project.procurement_status || '—'}</td><td>{project.estimated_closing_date || '—'} {project.is_overdue && <em>Overdue</em>}</td><td>{project.project_cycle_business_days === null ? '—' : `${project.project_cycle_business_days} days`}</td>
    <td className="col-actions"><div className="row-actions">{project.lifecycle === 'active' ? <button className="edit-project" onClick={() => { setOpenActions(null); onTransition(project, 'complete'); }}>Complete</button> : <button className="edit-project" onClick={() => { setOpenActions(null); onTransition(project, 'reopen'); }}>Reopen</button>}<details open={openActions === project.id} onToggle={(event) => { const isOpen = event.currentTarget.open; setOpenActions((current) => isOpen ? project.id : current === project.id ? null : current); }}><summary aria-label="More actions">•••</summary><div><button onClick={() => { setOpenActions(null); onEdit(project); }}>Edit</button><button onClick={() => { setOpenActions(null); onCopy(project); }}>Copy</button></div></details></div></td>
  </tr>)}</tbody></table></div><div className="project-table-footer"><strong>Total: {data.total} projects</strong><div className="pagination"><button disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>← Previous</button><span>Page {data.page} of {data.pages}</span><button disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)}>Next →</button></div></div></>;
}

function RecycleBin({ language }: { language: Language }) {
  const t = copy[language];
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const { data, isLoading, error } = useQuery({ queryKey: ['recycle-bin', page], queryFn: () => api<PaginatedProjects>(`/api/recycle-bin?page=${page}&page_size=20`) });
  const selected = data?.items.filter((project) => selectedIds.has(project.id)) || [];
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['recycle-bin'] }); queryClient.invalidateQueries({ queryKey: ['projects'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); setSelectedIds(new Set()); };
  const restore = useMutation({ mutationFn: (projects: Project[]) => api<{ restored: number }>('/api/recycle-bin/restore', { method: 'POST', body: JSON.stringify({ projects: projects.map(({ id, version }) => ({ id, version })) }) }), onSuccess: refresh });
  const permanentDelete = useMutation({ mutationFn: (projects: Project[]) => api<{ deleted: number }>('/api/recycle-bin/permanent-delete', { method: 'POST', body: JSON.stringify({ projects: projects.map(({ id, version }) => ({ id, version })) }) }), onSuccess: refresh });
  const restoreProjects = (projects: Project[]) => { if (projects.length && confirm(`Restore ${projects.length} selected project${projects.length === 1 ? '' : 's'}?`)) restore.mutate(projects); };
  const permanentlyDelete = (projects: Project[]) => { if (projects.length && confirm(`Permanently delete ${projects.length} selected project${projects.length === 1 ? '' : 's'}? This cannot be undone.`)) permanentDelete.mutate(projects); };
  return <section className="page recycle-page"><div className="page-heading"><div><p className="eyebrow">DELETED PROJECTS</p><h1>{t.recycleBin}</h1><p>Restore projects or permanently delete them. Projects are never removed automatically.</p></div></div>
    {isLoading ? <Loading /> : error ? <ErrorBox error={error} /> : !data?.items.length ? <><div className="panel empty-large">Recycle Bin is empty</div><div className="project-table-footer"><strong>Total: 0 projects</strong></div></> : <>
      <div className="bulk-actions"><span>{selected.length ? `${selected.length} selected` : 'Select projects to manage'}</span><div className="recycle-bulk-buttons"><button className="button secondary" disabled={!selected.length || restore.isPending} onClick={() => restoreProjects(selected)}>Restore selected</button><button className="button bulk-delete" disabled={!selected.length || permanentDelete.isPending} onClick={() => permanentlyDelete(selected)}>Permanently delete</button></div></div>
      <div className="table-wrap panel"><table className="projects-table recycle-table"><thead><tr><th className="col-select"><input type="checkbox" aria-label="Select all recycled projects on this page" checked={data.items.every((project) => selectedIds.has(project.id))} onChange={(event) => setSelectedIds(event.target.checked ? new Set(data.items.map((project) => project.id)) : new Set())}/></th><th>CEG</th><th>Priority</th><th>BU</th><th>Supplier Name</th><th>USD Amount</th><th>Deleted At</th><th>Actions</th></tr></thead><tbody>{data.items.map((project) => <tr key={project.id}><td className="col-select"><input type="checkbox" aria-label={`Select recycled project ${project.ceg || project.id}`} checked={selectedIds.has(project.id)} onChange={(event) => setSelectedIds((current) => { const next = new Set(current); event.target.checked ? next.add(project.id) : next.delete(project.id); return next; })}/></td><td><b>{project.ceg || '—'}</b></td><td>{project.project_priority || '—'}</td><td>{project.bu || '—'}</td><td>{project.supplier_name || '—'}</td><td className="amount-cell">{project.usd_amount ? `USD ${Number(project.usd_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td><td>{project.deleted_at ? new Date(project.deleted_at).toLocaleString() : '—'}</td><td><div className="recycle-row-actions"><button onClick={() => restoreProjects([project])}>Restore</button><button className="permanent-delete" onClick={() => permanentlyDelete([project])}>Delete permanently</button></div></td></tr>)}</tbody></table></div>
      <div className="project-table-footer"><strong>Total: {data.total} projects</strong><div className="pagination"><button disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>← Previous</button><span>Page {data.page} of {data.pages}</span><button disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)}>Next →</button></div></div>
    </>}
    {(restore.error || permanentDelete.error) && <ErrorBox error={restore.error || permanentDelete.error} />}
  </section>;
}

function ProjectDialog({ project, copyMode = false, language, close }: { project: Project | null; copyMode?: boolean; language: Language; close: () => void }) {
  const queryClient = useQueryClient();
  const t = copy[language];
  const { data: options = [] } = useQuery({ queryKey: ['options', 'all'], queryFn: () => api<ReferenceOption[]>('/api/reference-options?include_inactive=true') });
  const defaults: ProjectInput = project ? Object.fromEntries(Object.keys(emptyProject).map((key) => [key, String(project[key as keyof Project] ?? '')])) as unknown as ProjectInput : emptyProject;
  const isExisting = Boolean(project && !copyMode);
  const { register, handleSubmit, setValue, watch, formState: { isDirty } } = useForm<ProjectInput>({ defaultValues: defaults });
  const currency = watch('currency');
  const budget = watch('budget');
  const ceg = watch('ceg');
  const procurementStatus = watch('procurement_status');
  const prApprovedDate = watch('pr_approved_date');
  const estimatedClosingDate = watch('estimated_closing_date');
  const poReleaseDate = watch('po_release_date');
  const { data: liveRate, isFetching: rateLoading, error: rateError } = useQuery({
    queryKey: ['exchange-rate', currency],
    queryFn: () => api<{ rate: string; fetched_at: string }>(`/api/exchange-rate?currency=${currency}`),
    enabled: Boolean(currency), staleTime: 5 * 60 * 1000,
  });
  useEffect(() => {
    if (!liveRate) return;
    setValue('exchange_rate', liveRate.rate, { shouldDirty: true });
    setValue('exchange_rate_at', liveRate.fetched_at, { shouldDirty: true });
  }, [liveRate, setValue]);
  useEffect(() => {
    const amount = Number(budget); const rate = Number(liveRate?.rate || watch('exchange_rate'));
    setValue('usd_amount', budget && rate ? (Math.round((amount * rate + Number.EPSILON) * 100) / 100).toFixed(2) : '', { shouldDirty: Boolean(budget) });
  }, [budget, liveRate, setValue, watch]);
  const capitalizeOnBlur = (field: 'ceg' | 'bu' | 'requestor' | 'description' | 'supplier_name' | 'procurement_status_notes') => (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.currentTarget.value.trim();
    const formatted = /^[a-z]/.test(value) ? value[0].toUpperCase() + value.slice(1) : value;
    event.currentTarget.value = formatted;
    setValue(field, formatted, { shouldDirty: true, shouldValidate: true });
  };
  const mutation = useMutation({
    mutationFn: (values: ProjectInput) => api<Project>(isExisting ? `/api/projects/${project!.id}` : '/api/projects', { method: isExisting ? 'PUT' : 'POST', body: JSON.stringify({ ...toPayload(values), ...(isExisting ? { version: project!.version } : {}) }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['projects'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); close(); },
  });
  const optionList = (category: string) => options.filter((item) => item.category === category && (item.active || project?.[category as keyof Project] === item.code));
  return <div className="modal-backdrop"><div className="modal"><header><div><p className="eyebrow">PROCUREMENT PROJECT</p><h2>{copyMode ? 'Copy Project' : project ? t.edit : t.create}</h2></div><button aria-label="Close" onClick={() => { if (!isDirty || confirm('Discard unsaved changes?')) close(); }}>×</button></header>
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))}><div className="form-sections">
      <section className="form-section"><SectionHeading number="01" title="Project Basics" description="Ownership, priority and request context" /><div className="form-grid">
        <Field label="Priority"><select {...register('project_priority')}><option value="">Select</option><option>High</option><option>Medium</option><option>Normal</option></select></Field>
        <Field label="CEG"><select {...register('ceg')}><option value="">Select</option>{ceg && !CEG_OPTIONS.includes(ceg) && <option value={ceg}>{ceg} (Existing)</option>}{CEG_OPTIONS.map((name) => <option key={name} value={name}>{name}</option>)}</select></Field><Field label="BU"><input {...register('bu')} onBlur={capitalizeOnBlur('bu')} /></Field><Field label="BU Requestor"><input {...register('requestor')} onBlur={capitalizeOnBlur('requestor')} /></Field>
        <Field label="Request Date"><input type="date" {...register('request_date')} /></Field><Field label="Description" wide><textarea rows={4} {...register('description')} onBlur={capitalizeOnBlur('description')} /></Field>
      </div></section>
      <section className="form-section financial-section"><SectionHeading number="02" title="Budget" description="Original budget and live USD conversion" /><div className="form-grid">
        <Field label="Amount (excl.tax)"><input type="text" inputMode="decimal" pattern="[0-9]+([.][0-9]*)?" placeholder="0.00" {...register('budget')} onBlur={(event) => { const value = event.currentTarget.value.trim(); if (value && /^\d+(\.\d*)?$/.test(value)) { const formatted = (Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2); event.currentTarget.value = formatted; setValue('budget', formatted, { shouldDirty: true, shouldValidate: true }); } }} /></Field>
        <Field label="Currency"><select {...register('currency')}><option value="">Select</option><option>CAD</option><option>USD</option><option>CNY</option><option>EUR</option></select></Field>
        <Field label="Exchange Rate"><input readOnly {...register('exchange_rate')} placeholder={rateLoading ? 'Loading exchange rate…' : 'Select currency'} />{rateError && <small className="field-error">Exchange rate service unavailable</small>}<small className="rate-source">Rate source: {currency === 'USD' ? 'USD base rate' : 'Huawei iData Finance'}</small></Field>
        <Field label="USD Amount"><input readOnly {...register('usd_amount')} placeholder="0.00" /></Field>
        <input type="hidden" {...register('exchange_rate_at')} />
      </div></section>
      <section className="form-section"><SectionHeading number="03" title="Supplier & Procurement" description="Supplier profile, sourcing approach and current status" /><ProcurementProgress status={procurementStatus} /><div className="form-grid">
        <Field label="Supplier Name"><input {...register('supplier_name')} onBlur={capitalizeOnBlur('supplier_name')} /></Field>
        <Field label="Supplier Type"><select {...register('supplier_type')}><option value="">Select</option>{optionList('supplier_type').map((o) => <option key={o.id} value={o.code}>{language === 'zh' ? o.label_zh : o.label_en}{!o.active ? ' (inactive)' : ''}</option>)}</select></Field>
        <Field label="Procurement Strategy"><select {...register('procurement_strategy')}><option value="">Select</option>{optionList('procurement_strategy').map((o) => <option key={o.id} value={o.code}>{language === 'zh' ? o.label_zh : o.label_en}{!o.active ? ' (inactive)' : ''}</option>)}</select></Field>
        <Field label="Procurement Status"><select {...register('procurement_status')}><option value="">Select</option>{optionList('procurement_status').map((o) => <option key={o.id} value={o.code}>{language === 'zh' ? o.label_zh : o.label_en}{!o.active ? ' (inactive)' : ''}</option>)}</select></Field>
        <Field label="Procurement Status Notes" wide><textarea rows={3} {...register('procurement_status_notes')} onBlur={capitalizeOnBlur('procurement_status_notes')} /></Field>
      </div></section>
      <section className="form-section timeline-section"><SectionHeading number="04" title="Timeline & Compliance" description="Approval milestones, compliance and final PO release" /><ProjectTimeline prApproved={prApprovedDate} estimatedClosing={estimatedClosingDate} poReleased={poReleaseDate} lifecycle={copyMode ? 'active' : project?.lifecycle || 'active'} /><div className="form-grid">
        <Field label="PR Approved Date"><input type="date" {...register('pr_approved_date')} /></Field>
        <Field label="Estimated Project Closing Date"><input type="date" {...register('estimated_closing_date')} /></Field>
        <Field label="EC Form"><select {...register('ec_form')}><option value="">Select</option><option>Y</option><option>N</option><option>N/A</option></select></Field>
        <Field label="Contract Required"><select {...register('contract_required')}><option value="">Select</option><option>Y</option><option>N</option><option>N/A</option></select></Field>
        <Field label="PO Release Date" wide emphasis><input type="date" {...register('po_release_date')} /></Field>
      </div></section>
    </div>{mutation.error && <ErrorBox error={mutation.error instanceof ApiError && mutation.error.status === 409 ? new Error(t.conflict) : mutation.error} />}<footer><button type="button" className="button secondary" onClick={close}>{t.cancel}</button><button className="button primary" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : t.save}</button></footer></form>
  </div></div>;
}

function Field({ label, wide = false, emphasis = false, children }: { label: string; wide?: boolean; emphasis?: boolean; children: React.ReactNode }) { return <label className={`field${wide ? ' wide' : ''}${emphasis ? ' field-emphasis' : ''}`}><span>{label}{emphasis && <small>FINAL</small>}</span>{children}</label>; }

function SectionHeading({ number, title, description }: { number: string; title: string; description: string }) { return <div className="section-heading"><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div></div>; }

function ProcurementProgress({ status }: { status: string }) {
  const steps = [{ value: 'Sourcing', label: 'Sourcing' }, { value: 'Qualification', label: 'Qualification' }, { value: 'Supplier Selection', label: 'Selection' }, { value: 'Contract Review', label: 'Contract' }, { value: 'PO Release', label: 'PO Release' }];
  const activeIndex = steps.findIndex((step) => step.value === status);
  return <div className="procurement-progress" aria-label="Procurement progress">{steps.map((step, index) => <div className={`progress-step ${activeIndex > index ? 'done' : activeIndex === index ? 'current' : ''}`} key={step.value}><i>{activeIndex > index ? '✓' : index + 1}</i><span>{step.label}</span></div>)}</div>;
}

function ProjectTimeline({ prApproved, estimatedClosing, poReleased, lifecycle }: { prApproved: string; estimatedClosing: string; poReleased: string; lifecycle: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const lifecycleDays = prApproved && poReleased && poReleased >= prApproved ? businessDays(prApproved, poReleased) : null;
  const overdueDays = lifecycle === 'active' && estimatedClosing && estimatedClosing < today ? businessDays(estimatedClosing, today) : null;
  const metrics = [
    { label: 'Project Lifecycle', value: lifecycleDays, tone: '' },
    { label: 'Overdue Days', value: overdueDays, tone: overdueDays !== null ? 'overdue' : '' },
  ];
  return <div className="timeline-metrics" aria-label="Project timeline day summary">{metrics.map((metric) => <div className={`timeline-metric ${metric.tone}${metric.value === null ? ' empty' : ''}`} key={metric.label}><span>{metric.label}</span><strong>{metric.value === null ? '—' : metric.value}</strong><small>{metric.value === null ? 'Not available' : 'business days'}</small></div>)}</div>;
}

function businessDays(startValue: string, endValue: string) {
  const current = new Date(`${startValue}T00:00:00`); const end = new Date(`${endValue}T00:00:00`); let total = 0;
  while (current < end) { if (current.getDay() !== 0 && current.getDay() !== 6) total += 1; current.setDate(current.getDate() + 1); }
  return total;
}

function AuditDrawer({ project, close }: { project: Project; close: () => void }) {
  const { data, isLoading, error } = useQuery({ queryKey: ['audit', project.id], queryFn: () => api<AuditLog[]>(`/api/projects/${project.id}/audit-logs`) });
  return <div className="drawer-backdrop" onClick={close}><aside className="drawer" onClick={(e) => e.stopPropagation()}><header><div><p className="eyebrow">{project.ceg || `PROJECT ${project.id}`}</p><h2>Audit History</h2></div><button onClick={close}>×</button></header>{isLoading ? <Loading /> : error ? <ErrorBox error={error} /> : <div className="timeline">{data?.map((log) => <article key={log.id}><i /><div><strong>{log.action}</strong><small>{log.actor_name} · {new Date(log.created_at).toLocaleString()}</small>{Object.entries(log.changes).map(([field, change]) => <p key={field}><b>{field.replaceAll('_', ' ')}</b>: {String(change.before ?? '—')} → {String(change.after ?? '—')}</p>)}</div></article>)}</div>}</aside></div>;
}

function Options({ language }: { language: Language }) {
  const queryClient = useQueryClient();
  const { data = [], isLoading, error } = useQuery({ queryKey: ['options', 'all'], queryFn: () => api<ReferenceOption[]>('/api/reference-options?include_inactive=true') });
  const [draft, setDraft] = useState({ category: 'supplier_type', code: '', label_en: '', label_zh: '', sort_order: 0 });
  const create = useMutation({ mutationFn: () => api('/api/reference-options', { method: 'POST', body: JSON.stringify(draft) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['options'] }); setDraft({ category: 'supplier_type', code: '', label_en: '', label_zh: '', sort_order: 0 }); } });
  const toggle = useMutation({ mutationFn: (option: ReferenceOption) => api(`/api/reference-options/${option.id}`, { method: 'PUT', body: JSON.stringify({ label_en: option.label_en, label_zh: option.label_zh, sort_order: option.sort_order, active: !option.active }) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['options'] }) });
  const edit = useMutation({ mutationFn: (option: ReferenceOption) => {
    const labelEn = prompt('English label', option.label_en);
    if (labelEn === null) return Promise.resolve();
    const labelZh = prompt('中文标签', option.label_zh);
    if (labelZh === null) return Promise.resolve();
    const order = prompt('Sort order', String(option.sort_order));
    if (order === null) return Promise.resolve();
    return api(`/api/reference-options/${option.id}`, { method: 'PUT', body: JSON.stringify({ label_en: labelEn, label_zh: labelZh, sort_order: Number(order) || 0, active: option.active }) });
  }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['options'] }) });
  const remove = useMutation({
    mutationFn: (option: ReferenceOption) => api<void>(`/api/reference-options/${option.id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['options'] }),
  });
  const deleteOption = (option: ReferenceOption) => {
    if (confirm(`Permanently delete "${option.label_en}"? This cannot be undone.`)) remove.mutate(option);
  };
  return <section className="page"><div className="page-heading"><div><p className="eyebrow">REFERENCE DATA</p><h1>{copy[language].settings}</h1><p>Manage selectable business values without redeploying the application.</p></div></div>
    <div className="panel option-create"><select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}><option value="supplier_type">Supplier Type</option><option value="procurement_strategy">Procurement Strategy</option><option value="procurement_status">Procurement Status</option></select><input placeholder="Code" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })}/><input placeholder="English label" value={draft.label_en} onChange={(e) => setDraft({ ...draft, label_en: e.target.value })}/><input placeholder="中文标签" value={draft.label_zh} onChange={(e) => setDraft({ ...draft, label_zh: e.target.value })}/><button className="button primary" disabled={!draft.code || !draft.label_en || !draft.label_zh} onClick={() => create.mutate()}>Add option</button></div>
    {isLoading ? <Loading /> : error ? <ErrorBox error={error} /> : <div className="panel options-list">{data.map((option) => <div key={option.id}><span className="option-category">{option.category.replaceAll('_', ' ')}</span><b>{option.label_en}</b><span>{option.label_zh}</span><code>{option.code}</code><span className="option-buttons"><button onClick={() => edit.mutate(option)}>Edit</button><button className={option.active ? 'active-toggle' : ''} onClick={() => toggle.mutate(option)}>{option.active ? 'Active' : 'Inactive'}</button><button className="delete-option" onClick={() => deleteOption(option)}>Delete</button></span></div>)}</div>}
    {(create.error || edit.error || toggle.error || remove.error) && <ErrorBox error={create.error || edit.error || toggle.error || remove.error} />}
  </section>;
}

function Loading() { return <div className="loading">Loading…</div>; }
function ErrorBox({ error }: { error: unknown }) { return <div className="error-box">{error instanceof Error ? error.message : 'Something went wrong.'}</div>; }

export default function App() {
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('cari-language') as Language) || 'en');
  const changeLanguage = (value: Language) => { setLanguage(value); localStorage.setItem('cari-language', value); document.documentElement.lang = value === 'zh' ? 'zh-CN' : 'en'; };
  return <Layout language={language} setLanguage={changeLanguage} />;
}
