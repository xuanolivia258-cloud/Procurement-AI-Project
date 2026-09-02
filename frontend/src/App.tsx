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

const zhLabels: Record<string, string> = {
  'Procurement Tracking': '采购项目跟踪', 'Local Test User': '本地测试用户', Administrator: '管理员', 'LOCAL TEST ENVIRONMENT': '本地测试环境',
  'PROJECT OVERVIEW': '项目概览', 'CEG Overview': 'CEG 概览', 'All active and completed projects': '所有进行中及已完成项目', 'View Full Analysis →': '查看完整分析 →',
  'Project Count': '项目数量', 'Total Projects': '项目总数', 'USD Amount': '美元金额', 'Total Amount': '总金额', 'View projects →': '查看项目 →',
  'PORTFOLIO INTELLIGENCE': '项目组合分析', 'Create Monthly Report': '创建月报', 'From Month': '开始月份', 'To Month': '结束月份', Lifecycle: '项目状态', Priority: '优先级',
  'Clear Filters': '清除筛选', 'From Month cannot be later than To Month.': '开始月份不能晚于结束月份。', 'Total USD Amount': '美元总金额', 'High Priority Projects': '高优先级项目',
  'Projects by CEG': '各 CEG 项目数量', 'USD Amount by CEG': '各 CEG 美元金额', 'Top 12 CEGs shown': '显示前 12 个 CEG', 'Current filtered portfolio': '当前筛选的项目组合',
  'No matching CEG data.': '没有匹配的 CEG 数据。', 'Priority Mix by CEG': '各 CEG 优先级分布', 'High, Medium, and Normal projects': '高、中、普通优先级项目', 'No matching priority data.': '没有匹配的优先级数据。',
  High: '高', Medium: '中', Normal: '普通', 'MONTHLY REPORT': '月度报告', 'Project Tracking Monthly Report': '项目跟踪月度报告', 'Report Month': '报告月份',
  'Preview Report': '预览报告', 'Download HTML': '下载 HTML', 'Projects are included when their PR Approved Date falls within the selected month. Deleted projects are excluded.': '统计 PR 批准日期位于所选月份内的项目，不包含已删除项目。',
  'Preview your report': '预览月报', 'Select the reporting scope, then click Preview Report.': '选择报告范围后，点击“预览报告”。', 'FINANCIAL OVERVIEW': '财务概览',
  'Total Amount for Active': '进行中项目总金额', 'Monthly USD Amount for active projects, grouped by PR Approved Date.': '按 PR 批准日期月份统计进行中项目的美元金额。',
  'Active Project USD Amount': '进行中项目美元金额', 'Monthly USD Amount': '每月美元金额', 'Grouped by PR Approved month · USD': '按 PR 批准月份汇总 · 美元', 'Monthly amount': '月度金额', 'Amount trend': '金额趋势',
  'No projects have a PR Approved Date in this range.': '该时间范围内没有填写 PR 批准日期的项目。', 'PROJECT PORTFOLIO': '项目组合', Search: '搜索', 'Fewer Filters': '收起筛选', 'More Filters': '更多筛选',
  'BU Requestor': 'BU 申请人', 'Procurement Status': '采购状态', 'PR Approved From': 'PR 批准日期起', 'PR Approved To': 'PR 批准日期止', 'Closing from': '预计结束日期起', 'Closing to': '预计结束日期止',
  'PO Release From': 'PO 发布日期起', 'PO Release To': 'PO 发布日期止', 'Clear all': '全部清除', Status: '状态', 'Supplier Name': '供应商名称', 'Amount (excl.tax)': '金额（不含税）', Currency: '币种',
  'Estimated Closing Date': '预计结束日期', 'Project Cycle': '项目周期', Actions: '操作', 'Select projects to manage': '请选择要管理的项目', selected: '已选择', 'Move to Recycle Bin': '移至回收站', Moving: '正在移动',
  Complete: '完成', Reopen: '重新打开', Edit: '编辑', Copy: '复制', Overdue: '已逾期', days: '天', Total: '总计', projects: '个项目', Previous: '上一页', Next: '下一页', Page: '第', of: '页，共',
  'DELETED PROJECTS': '已删除项目', 'Restore projects or permanently delete them. Projects are never removed automatically.': '可恢复项目或永久删除；系统不会自动清除项目。', 'Recycle Bin is empty': '回收站为空',
  'Restore selected': '恢复所选项目', 'Permanently delete': '永久删除', 'Deleted At': '删除时间', Restore: '恢复', 'Delete permanently': '永久删除',
  'PROCUREMENT PROJECT': '采购项目', 'Copy Project': '复制项目', Close: '关闭', 'Discard unsaved changes?': '确定放弃未保存的更改吗？', Select: '请选择', Existing: '现有', Saving: '正在保存', FINAL: '最终节点',
  'Project Basics': '项目基本信息', 'Ownership, priority and request context': '负责人、优先级及申请信息', BU: 'BU', 'Request Date': '申请日期', Description: '项目描述', Budget: '预算',
  'Original budget and live USD conversion': '原始预算及实时美元换算', 'Exchange Rate': '汇率', 'Loading exchange rate…': '正在加载汇率…', 'Select currency': '请选择币种', 'Exchange rate service unavailable': '汇率服务暂不可用', 'Rate source': '汇率来源', 'USD base rate': '美元基准汇率',
  'Supplier & Procurement': '供应商与采购', 'Supplier profile, sourcing approach and current status': '供应商信息、采购策略和当前状态', 'Supplier Type': '供应商类型', 'Procurement Strategy': '采购策略', 'Procurement Status Notes': '采购状态备注', inactive: '已停用',
  'Timeline & Compliance': '时间与合规', 'Approval milestones, compliance and final PO release': '审批节点、合规信息及最终 PO 发布', 'PR Approved Date': 'PR 批准日期', 'Estimated Project Closing Date': '预计项目结束日期', 'EC Form': 'EC 表单', 'Contract Required': '是否需要合同', 'PO Release Date': 'PO 发布日期',
  Sourcing: '寻源', Qualification: '资格审查', Selection: '供应商选择', Contract: '合同审核', 'PO Release': 'PO 发布', 'Project Lifecycle': '项目生命周期', 'Overdue Days': '逾期天数', 'Not available': '暂无', 'business days': '个工作日',
  Loading: '正在加载', 'Something went wrong.': '系统出现错误。', 'More actions': '更多操作',
  'REFERENCE DATA': '参考数据', 'Manage selectable business values without redeploying the application.': '管理系统下拉选项，无需重新部署应用。', Code: '代码', 'English label': '英文标签', 'Add option': '添加选项', Active: '启用', Inactive: '停用', Delete: '删除',
};
const tr = (language: Language, value: string) => language === 'zh' ? zhLabels[value] || value : value;
const displaySystemValue = (language: Language, value: string | null | undefined) => value ? tr(language, value) : '—';

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
      <div className="brand"><span className="brand-mark" role="img" aria-label={language === 'zh' ? '枫叶' : 'Maple leaf'}>🍁︎</span><span>CARI<br/><small>{tr(language, 'Procurement Tracking')}</small></span></div>
      <nav>
        <NavLink to="/" title={t.dashboard}><NavIcon name="dashboard"/><span>{t.dashboard}</span></NavLink>
        <ProjectNavigation t={t}/>
        <NavLink to="/analysis" title={t.analysis}><NavIcon name="analysis"/><span>{t.analysis}</span></NavLink>
        <NavLink to="/recycle-bin" title={t.recycleBin}><NavIcon name="recycle"/><span>{t.recycleBin}</span></NavLink>
      </nav>
      <div className="local-user"><span>LT</span><div>{tr(language, 'Local Test User')}<small>{tr(language, 'Administrator')}</small></div></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><span className="environment">{tr(language, 'LOCAL TEST ENVIRONMENT')}</span><button className="language" onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}>{language === 'en' ? '中文' : 'English'}</button></header>
      <Routes>
        <Route path="/" element={<Dashboard language={language} />} />
        <Route path="/projects" element={<Projects language={language} />} />
        <Route path="/analysis" element={<Analysis language={language} />} />
        <Route path="/budget-analysis" element={<BudgetAnalysis language={language} />} />
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
  if (isLoading) return <Loading language={language} />;
  if (error || !data) return <ErrorBox error={error} language={language} />;
  return <section className="page dashboard-page">
    <div className="page-heading"><div><p className="eyebrow">{tr(language, 'PROJECT OVERVIEW')}</p><h1>{t.dashboard}</h1></div><div className="heading-actions"><button className="button primary" type="button" onClick={() => setCreatingProject(true)}>＋ {t.create}</button></div></div>
    <div className="metric-grid">
      <Metric language={language} label={t.active} value={data.lifecycle.active || 0} tone="purple" to="/projects?lifecycle=active" />
      <Metric language={language} label={t.completed} value={data.lifecycle.completed || 0} tone="green" to="/projects?lifecycle=completed" />
      <Metric language={language} label={t.overdue} value={data.overdue} tone="red" to="/projects?lifecycle=active&overdue=true" />
      <Metric language={language} label={t.totalBudget} value={`USD ${Number(data.total_budget).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} tone="blue" wide to="/budget-analysis" />
    </div>
    <div className="dashboard-grid">
      <CegOverviewChart language={language} items={data.ceg_overview}/>
    </div>
    {creatingProject && <ProjectDialog project={null} language={language} close={() => setCreatingProject(false)} />}
  </section>;
}

function CegOverviewChart({ items, language }: { items: DashboardData['ceg_overview']; language: Language }) {
  const totalProjects = items.reduce((sum, item) => sum + item.project_count, 0);
  const totalAmount = items.reduce((sum, item) => sum + Number(item.usd_amount), 0);
  return <article className="panel ceg-preview"><header><div><h2>{tr(language, 'CEG Overview')}</h2><p>{tr(language, 'All active and completed projects')}</p></div><Link to="/analysis">{tr(language, 'View Full Analysis →')}</Link></header>{items.length ? <div className="ceg-pies"><CegDonut title={tr(language, 'Project Count')} items={items} values={items.map((item) => item.project_count)} centerValue={String(totalProjects)} centerLabel={tr(language, 'Total Projects')}/><CegDonut title={tr(language, 'USD Amount')} items={items} values={items.map((item) => Number(item.usd_amount))} centerValue={`USD ${formatCompactNumber(totalAmount)}`} centerLabel={tr(language, 'Total Amount')}/></div> : <div className="analysis-empty compact">{language === 'zh' ? '暂无 CEG 数据。' : 'No CEG data available.'}</div>}</article>;
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

function Metric({ label, value, tone, wide = false, to, language }: { label: string; value: string | number; tone: string; wide?: boolean; to?: string; language: Language }) {
  const content = <><span>{label}</span><strong>{value}</strong>{to && <small>{tr(language, 'View projects →')}</small>}</>;
  return to
    ? <Link className={`metric metric-link ${tone} ${wide ? 'wide' : ''}`} to={to} aria-label={`${label}: ${value}. ${tr(language, 'View projects →')}`}>{content}</Link>
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
    <div className="page-heading"><div><p className="eyebrow">{tr(language, 'PORTFOLIO INTELLIGENCE')}</p><h1>{t.analysis}</h1></div><div className="heading-actions"><button className="button primary" type="button" onClick={() => setReportOpen(true)}>{tr(language, 'Create Monthly Report')}</button></div></div>
    <div className="analysis-filters panel">
      <label>{tr(language, 'PR Approved From')}<input type="month" value={filters.from_month} onChange={(event) => update('from_month', event.target.value)} /></label>
      <label>{tr(language, 'PR Approved To')}<input type="month" value={filters.to_month} onChange={(event) => update('to_month', event.target.value)} /></label>
      <label>CEG<select value={filters.ceg} onChange={(event) => update('ceg', event.target.value)}><option value="">{t.all}</option>{data?.options.ceg.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>{tr(language, 'Lifecycle')}<select value={filters.lifecycle} onChange={(event) => update('lifecycle', event.target.value)}><option value="">{t.all}</option><option value="active">{t.active}</option><option value="completed">{t.completed}</option></select></label>
      <label>{tr(language, 'Priority')}<select value={filters.priority} onChange={(event) => update('priority', event.target.value)}><option value="">{t.all}</option><option value="High">{tr(language, 'High')}</option><option value="Medium">{tr(language, 'Medium')}</option><option value="Normal">{tr(language, 'Normal')}</option></select></label>
      <button className="button secondary analysis-clear" type="button" onClick={() => setFilters({ from_month: '', to_month: '', ceg: '', lifecycle: '', priority: '' })}>{tr(language, 'Clear Filters')}</button>
    </div>
    {!validRange ? <div className="error-box">{tr(language, 'From Month cannot be later than To Month.')}</div> : isLoading ? <Loading language={language} /> : error ? <ErrorBox error={error} language={language} /> : data && <>
      <div className="analysis-metrics"><article><span>{tr(language, 'Total Projects')}</span><strong>{data.totals.project_count}</strong></article><article><span>{tr(language, 'Total USD Amount')}</span><strong>USD {formatAmount(data.totals.usd_amount)}</strong></article><article><span>{tr(language, 'High Priority Projects')}</span><strong>{data.totals.high_priority_count}</strong></article></div>
      <div className="analysis-chart-grid"><CegValueChart language={language} items={data.items} mode="count"/><CegValueChart language={language} items={data.items} mode="amount"/></div>
      <PriorityMixChart language={language} items={data.items}/>
    </>}
    {reportOpen && <MonthlyReportDialog language={language} cegOptions={data?.options.ceg || []} initialCeg={filters.ceg} close={() => setReportOpen(false)}/>}
  </section>;
}

function MonthlyReportDialog({ cegOptions, initialCeg, close, language }: { cegOptions: string[]; initialCeg: string; close: () => void; language: Language }) {
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [month, setMonth] = useState(defaultMonth);
  const [ceg, setCeg] = useState(initialCeg);
  const [previewUrl, setPreviewUrl] = useState('');
  const reportQuery = queryString({ month, ceg, language });
  const preview = () => { if (month) setPreviewUrl(`/api/monthly-report.html?${reportQuery}`); };
  const downloadUrl = `/api/monthly-report.html?${queryString({ month, ceg, language, download: true })}`;
  return <div className="modal-backdrop"><div className="modal report-modal" role="dialog" aria-modal="true" aria-labelledby="monthly-report-title"><header><div><p className="eyebrow">{tr(language, 'MONTHLY REPORT')}</p><h2 id="monthly-report-title">{tr(language, 'Project Tracking Monthly Report')}</h2></div><button aria-label={tr(language, 'Close')} onClick={close}>×</button></header><div className="report-dialog-body"><div className="report-settings"><label>{tr(language, 'Report Month')}<input type="month" required value={month} onChange={(event) => { setMonth(event.target.value); setPreviewUrl(''); }} /></label><label>CEG<select value={ceg} onChange={(event) => { setCeg(event.target.value); setPreviewUrl(''); }}><option value="">{copy[language].all}</option>{cegOptions.map((name) => <option key={name}>{name}</option>)}</select></label><button className="button secondary" type="button" disabled={!month} onClick={preview}>{tr(language, 'Preview Report')}</button><a className={`button primary${!month ? ' disabled' : ''}`} href={month ? downloadUrl : undefined}>{tr(language, 'Download HTML')}</a></div><p className="report-scope-note">{tr(language, 'Projects are included when their PR Approved Date falls within the selected month. Deleted projects are excluded.')}</p>{previewUrl ? <iframe className="report-preview" title={`${tr(language, 'Project Tracking Monthly Report')} ${tr(language, 'Preview Report')}`} src={previewUrl}/> : <div className="report-preview-empty"><strong>{tr(language, 'Preview your report')}</strong><span>{tr(language, 'Select the reporting scope, then click Preview Report.')}</span></div>}</div></div></div>;
}

function CegValueChart({ items, mode, language }: { items: CegAnalysisItem[]; mode: 'count' | 'amount'; language: Language }) {
  const shown = [...items].sort((left, right) => {
    const leftValue = mode === 'count' ? left.project_count : Number(left.usd_amount);
    const rightValue = mode === 'count' ? right.project_count : Number(right.usd_amount);
    return rightValue - leftValue || left.ceg.localeCompare(right.ceg);
  }).slice(0, 12);
  const values = shown.map((item) => mode === 'count' ? item.project_count : Number(item.usd_amount));
  const max = Math.max(1, ...values);
  return <article className="panel ceg-chart"><header><h2>{tr(language, mode === 'count' ? 'Projects by CEG' : 'USD Amount by CEG')}</h2><p>{tr(language, items.length > 12 ? 'Top 12 CEGs shown' : 'Current filtered portfolio')}</p></header>{!shown.length ? <div className="analysis-empty">{tr(language, 'No matching CEG data.')}</div> : <div className="horizontal-bars">{shown.map((item, index) => { const value = values[index]; return <div className="horizontal-bar" key={item.ceg}><span title={item.ceg}>{item.ceg}</span><div><i style={{ width: `${(value / max) * 100}%` }}/></div><strong>{mode === 'count' ? value : `USD ${formatCompactNumber(value)}`}</strong></div>; })}</div>}</article>;
}

function PriorityMixChart({ items, language }: { items: CegAnalysisItem[]; language: Language }) {
  const sortedItems = [...items].sort((left, right) => right.high_priority_count - left.high_priority_count || right.project_count - left.project_count || left.ceg.localeCompare(right.ceg));
  return <article className="panel priority-mix"><header><div><h2>{tr(language, 'Priority Mix by CEG')}</h2><p>{tr(language, 'High, Medium, and Normal projects')}</p></div><div className="priority-legend"><span className="high">{tr(language, 'High')}</span><span className="medium">{tr(language, 'Medium')}</span><span className="normal">{tr(language, 'Normal')}</span></div></header>{!sortedItems.length ? <div className="analysis-empty">{tr(language, 'No matching priority data.')}</div> : <div className="priority-stack-list">{sortedItems.slice(0, 15).map((item) => { const total = item.high_priority_count + item.medium_priority_count + item.normal_priority_count; return <div className="priority-stack-row" key={item.ceg}><span title={item.ceg}>{item.ceg}</span><div>{total > 0 && <><i className="high" style={{ width: `${item.high_priority_count / total * 100}%` }} title={`${tr(language, 'High')}: ${item.high_priority_count}`}>{item.high_priority_count > 0 && <small>{item.high_priority_count}</small>}</i><i className="medium" style={{ width: `${item.medium_priority_count / total * 100}%` }} title={`${tr(language, 'Medium')}: ${item.medium_priority_count}`}>{item.medium_priority_count > 0 && <small>{item.medium_priority_count}</small>}</i><i className="normal" style={{ width: `${item.normal_priority_count / total * 100}%` }} title={`${tr(language, 'Normal')}: ${item.normal_priority_count}`}>{item.normal_priority_count > 0 && <small>{item.normal_priority_count}</small>}</i></>}</div></div>; })}</div>}</article>;
}

function formatAmount(value: string | number) { return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatCompactNumber(value: number) { if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`; if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`; return formatAmount(value); }

function BudgetAnalysis({ language }: { language: Language }) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [fromMonth, setFromMonth] = useState(`${now.getFullYear()}-01`);
  const [toMonth, setToMonth] = useState(currentMonth);
  const validRange = !fromMonth || !toMonth || fromMonth <= toMonth;
  const query = queryString({ from_month: fromMonth, to_month: toMonth });
  const { data, isLoading, error } = useQuery({ queryKey: ['budget-analysis', fromMonth, toMonth], queryFn: () => api<BudgetAnalysisData>(`/api/budget-analysis?${query}`), enabled: validRange });
  return <section className="page budget-analysis-page">
    <div className="page-heading"><div><p className="eyebrow">{tr(language, 'FINANCIAL OVERVIEW')}</p><h1>{tr(language, 'Total Amount for Active')}</h1><p>{tr(language, 'Monthly USD Amount for active projects, grouped by PR Approved Date.')}</p></div></div>
    <div className="budget-month-filters panel"><label>{tr(language, 'From Month')}<input type="month" value={fromMonth} onChange={(event) => setFromMonth(event.target.value)} /></label><label>{tr(language, 'To Month')}<input type="month" value={toMonth} onChange={(event) => setToMonth(event.target.value)} /></label></div>
    {!validRange ? <div className="error-box">{tr(language, 'From Month cannot be later than To Month.')}</div> : isLoading ? <Loading language={language} /> : error ? <ErrorBox error={error} language={language} /> : data && <>
      <div className="budget-summary"><article><span>{tr(language, 'Active Project USD Amount')}</span><strong>USD {Number(data.total_usd_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></article></div>
      <MonthlyBudgetChart language={language} data={data.monthly} title={tr(language, 'Monthly USD Amount')} />
    </>}
  </section>;
}

function MonthlyBudgetChart({ data, title, language }: { data: BudgetAnalysisData['monthly']; title: string; language: Language }) {
  const width = 900, height = 300, left = 82, right = 28, top = 28, bottom = 52;
  const chartWidth = width - left - right, chartHeight = height - top - bottom;
  const values = data.map((item) => Number(item.usd_amount));
  const max = Math.max(1, ...values);
  const step = data.length ? chartWidth / data.length : chartWidth;
  const labelEvery = Math.max(1, Math.ceil(data.length / 12));
  const y = (value: number) => top + chartHeight - (value / max) * chartHeight;
  const points = data.map((item, index) => `${left + step * index + step / 2},${y(Number(item.usd_amount))}`).join(' ');
  return <article className="budget-chart panel"><header><div><h2>{title}</h2><p>{tr(language, 'Grouped by PR Approved month · USD')}</p></div><div className="chart-legend"><span className="bar-key">{tr(language, 'Monthly amount')}</span><span className="line-key">{tr(language, 'Amount trend')}</span></div></header>{!data.length ? <div className="chart-empty">{tr(language, 'No projects have a PR Approved Date in this range.')}</div> : <div className="chart-scroll"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
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
    ['keyword', tr(language, 'Search'), filters.keyword], ['priority', tr(language, 'Priority'), filters.priority],
    ['bu', 'BU', filters.bu], ['ceg', 'CEG', filters.ceg],
    ['requestor', tr(language, 'BU Requestor'), filters.requestor], ['procurement_status', tr(language, 'Status'), filters.procurement_status],
    ['pr_approved_from', tr(language, 'PR Approved From'), filters.pr_approved_from], ['pr_approved_to', tr(language, 'PR Approved To'), filters.pr_approved_to],
    ['closing_from', tr(language, 'Closing from'), filters.closing_from], ['closing_to', tr(language, 'Closing to'), filters.closing_to],
    ['po_release_from', tr(language, 'PO Release From'), filters.po_release_from], ['po_release_to', tr(language, 'PO Release To'), filters.po_release_to],
  ].filter(([, , value]) => value);
  const projectActions = {
    onEdit: setEditing,
    onCopy: setCopying,
    onTransition: (project: Project, action: string) => { if (confirm(language === 'zh' ? `确定要${action === 'complete' ? '完成' : '重新打开'}此项目吗？` : `Confirm ${action}?`)) transition.mutate({ project, action }); },
  };
  const exportUrl = `/api/projects-export.xlsx?${queryString({ ...filters, language })}`;
  return <section className="page projects-page">
    <div className="page-heading"><div><p className="eyebrow">{tr(language, 'PROJECT PORTFOLIO')}</p><h1>{t.projects}</h1></div><div className="heading-actions"><a className="button secondary" href={exportUrl}>{t.export}</a></div></div>
    <div className="filters panel"><div className="filter-main">
      <label>{tr(language, 'Search')}<input value={filters.keyword} onChange={(e) => updateFilter('keyword', e.target.value)} placeholder={language === 'zh' ? 'CEG、供应商、项目描述…' : 'CEG, supplier, description…'} /></label>
      <label>{tr(language, 'Priority')}<select value={filters.priority} onChange={(e) => updateFilter('priority', e.target.value)}><option value="">{t.all}</option><option value="High">{tr(language, 'High')}</option><option value="Medium">{tr(language, 'Medium')}</option><option value="Normal">{tr(language, 'Normal')}</option></select></label>
      <label>BU<input value={filters.bu} onChange={(e) => updateFilter('bu', e.target.value)} /></label>
      <button type="button" className="more-filters" onClick={() => setMoreFilters((value) => !value)}>{tr(language, moreFilters ? 'Fewer Filters' : 'More Filters')} <span>{moreFilters ? '−' : '+'}</span></button>
    </div>{moreFilters && <div className="filter-advanced">
      <label>CEG<input value={filters.ceg} onChange={(e) => updateFilter('ceg', e.target.value)} /></label>
      <label>{tr(language, 'BU Requestor')}<input value={filters.requestor} onChange={(e) => updateFilter('requestor', e.target.value)} /></label>
      <label>{tr(language, 'Procurement Status')}<select value={filters.procurement_status} onChange={(e) => updateFilter('procurement_status', e.target.value)}><option value="">{t.all}</option>{filterOptions.filter((item) => item.category === 'procurement_status').map((item) => <option key={item.id} value={item.code}>{language === 'zh' ? item.label_zh : item.label_en}</option>)}</select></label>
      <label>{tr(language, 'PR Approved From')}<input type="date" value={filters.pr_approved_from} onChange={(e) => updateFilter('pr_approved_from', e.target.value)} /></label>
      <label>{tr(language, 'PR Approved To')}<input type="date" value={filters.pr_approved_to} onChange={(e) => updateFilter('pr_approved_to', e.target.value)} /></label>
      <label>{tr(language, 'Closing from')}<input type="date" value={filters.closing_from} onChange={(e) => updateFilter('closing_from', e.target.value)} /></label>
      <label>{tr(language, 'Closing to')}<input type="date" value={filters.closing_to} onChange={(e) => updateFilter('closing_to', e.target.value)} /></label>
      <label>{tr(language, 'PO Release From')}<input type="date" value={filters.po_release_from} onChange={(e) => updateFilter('po_release_from', e.target.value)} /></label>
      <label>{tr(language, 'PO Release To')}<input type="date" value={filters.po_release_to} onChange={(e) => updateFilter('po_release_to', e.target.value)} /></label>
    </div>}{activeFilters.length > 0 && <div className="filter-chips">{activeFilters.map(([key, label, value]) => <button type="button" key={key} onClick={() => updateFilter(key, '')}><span>{label}:</span> {value} ×</button>)}<button type="button" className="clear-filters" onClick={() => setParams({})}>{tr(language, 'Clear all')}</button></div>}</div>
    {isLoading ? <Loading language={language} /> : error ? <ErrorBox error={error} language={language} /> : <ProjectTable language={language} referenceOptions={filterOptions} data={data!} {...projectActions} onBulkDelete={(projects) => bulkRemove.mutateAsync(projects)} bulkDeleting={bulkRemove.isPending} t={t} setPage={(page) => updateFilter('page', String(page))} />}
    {editing && <ProjectDialog project={editing === 'new' ? null : editing} language={language} close={() => setEditing(null)} />}
    {copying && <ProjectDialog project={copying} copyMode language={language} close={() => setCopying(null)} />}
  </section>;
}

function ProjectTable({ data, onEdit, onCopy, onTransition, onBulkDelete, bulkDeleting, t, setPage, language, referenceOptions }: { data: PaginatedProjects; onEdit: (p: Project) => void; onCopy: (p: Project) => void; onTransition: (p: Project, action: string) => void; onBulkDelete: (projects: Project[]) => Promise<unknown>; bulkDeleting: boolean; t: Translation; setPage: (page: number) => void; language: Language; referenceOptions: ReferenceOption[] }) {
  const [openActions, setOpenActions] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const selectedProjects = data.items.filter((project) => selectedIds.has(project.id));
  const allSelected = data.items.length > 0 && data.items.every((project) => selectedIds.has(project.id));
  const statusLabel = (value: string | null) => language === 'zh' && value ? referenceOptions.find((option) => option.category === 'procurement_status' && option.code === value)?.label_zh || value : value || '—';
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
  if (!data.items.length) return <><div className="panel empty-large">{t.noProjects}</div><div className="project-table-footer"><strong>{language === 'zh' ? `总计：${data.total} 个项目` : `Total: ${data.total} projects`}</strong></div></>;
  const columns = ['Priority','CEG','BU','Description','Supplier Name','Amount (excl.tax)','Currency','USD Amount','Procurement Status','Estimated Closing Date','Project Cycle','Actions'];
  const deleteSelected = async () => { if (!selectedProjects.length || !confirm(language === 'zh' ? `确定将选中的 ${selectedProjects.length} 个项目移至回收站吗？` : `Move ${selectedProjects.length} selected project${selectedProjects.length === 1 ? '' : 's'} to the Recycle Bin?`)) return; await onBulkDelete(selectedProjects); setSelectedIds(new Set()); };
  return <><div className="bulk-actions"><span>{selectedProjects.length ? (language === 'zh' ? `已选择 ${selectedProjects.length} 个项目` : `${selectedProjects.length} selected`) : tr(language, 'Select projects to manage')}</span><button className="button bulk-delete" disabled={!selectedProjects.length || bulkDeleting} onClick={deleteSelected}>{bulkDeleting ? `${tr(language, 'Moving')}…` : `${tr(language, 'Move to Recycle Bin')}${selectedProjects.length ? ` (${selectedProjects.length})` : ''}`}</button></div><div className="table-wrap panel"><table className="projects-table"><thead><tr><th className="col-select"><input type="checkbox" aria-label={language === 'zh' ? '选择本页全部项目' : 'Select all projects on this page'} checked={allSelected} onChange={(event) => setSelectedIds(event.target.checked ? new Set(data.items.map((project) => project.id)) : new Set())}/></th>{columns.map((item) => <th key={item} className={`col-${item.toLowerCase().replaceAll(/[^a-z]+/g, '-')}`}>{tr(language, item)}</th>)}</tr></thead><tbody>{data.items.map((project) => <tr key={project.id} className={project.is_overdue ? 'overdue-row' : ''}>
    <td className="col-select"><input type="checkbox" aria-label={language === 'zh' ? `选择项目 ${project.ceg || project.id}` : `Select project ${project.ceg || project.id}`} checked={selectedIds.has(project.id)} onChange={(event) => setSelectedIds((current) => { const next = new Set(current); event.target.checked ? next.add(project.id) : next.delete(project.id); return next; })}/></td><td className="col-priority"><span className={`priority ${project.project_priority?.toLowerCase() || ''}`}>{displaySystemValue(language, project.project_priority)}</span></td><td className="col-ceg"><b>{project.ceg || '—'}</b></td><td className="col-bu">{project.bu || '—'}</td><td>{project.description || '—'}</td><td>{project.supplier_name || '—'}</td><td className="amount-cell">{project.budget ? Number(project.budget).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td><td>{project.currency || '—'}</td><td className="amount-cell">{project.usd_amount ? `USD ${Number(project.usd_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td><td>{statusLabel(project.procurement_status)}</td><td>{project.estimated_closing_date || '—'} {project.is_overdue && <em>{tr(language, 'Overdue')}</em>}</td><td>{project.project_cycle_business_days === null ? '—' : `${project.project_cycle_business_days} ${tr(language, 'days')}`}</td>
    <td className="col-actions"><div className="row-actions">{project.lifecycle === 'active' ? <button className="edit-project" onClick={() => { setOpenActions(null); onTransition(project, 'complete'); }}>{tr(language, 'Complete')}</button> : <button className="edit-project" onClick={() => { setOpenActions(null); onTransition(project, 'reopen'); }}>{tr(language, 'Reopen')}</button>}<details open={openActions === project.id} onToggle={(event) => { const isOpen = event.currentTarget.open; setOpenActions((current) => isOpen ? project.id : current === project.id ? null : current); }}><summary aria-label={tr(language, 'More actions')}>•••</summary><div><button onClick={() => { setOpenActions(null); onEdit(project); }}>{tr(language, 'Edit')}</button><button onClick={() => { setOpenActions(null); onCopy(project); }}>{tr(language, 'Copy')}</button></div></details></div></td>
  </tr>)}</tbody></table></div><div className="project-table-footer"><strong>{language === 'zh' ? `总计：${data.total} 个项目` : `Total: ${data.total} projects`}</strong><div className="pagination"><button disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>← {tr(language, 'Previous')}</button><span>{language === 'zh' ? `第 ${data.page} 页，共 ${data.pages} 页` : `Page ${data.page} of ${data.pages}`}</span><button disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)}>{tr(language, 'Next')} →</button></div></div></>;
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
  const restoreProjects = (projects: Project[]) => { if (projects.length && confirm(language === 'zh' ? `确定恢复选中的 ${projects.length} 个项目吗？` : `Restore ${projects.length} selected project${projects.length === 1 ? '' : 's'}?`)) restore.mutate(projects); };
  const permanentlyDelete = (projects: Project[]) => { if (projects.length && confirm(language === 'zh' ? `确定永久删除选中的 ${projects.length} 个项目吗？此操作无法撤销。` : `Permanently delete ${projects.length} selected project${projects.length === 1 ? '' : 's'}? This cannot be undone.`)) permanentDelete.mutate(projects); };
  return <section className="page recycle-page"><div className="page-heading"><div><p className="eyebrow">{tr(language, 'DELETED PROJECTS')}</p><h1>{t.recycleBin}</h1><p>{tr(language, 'Restore projects or permanently delete them. Projects are never removed automatically.')}</p></div></div>
    {isLoading ? <Loading language={language} /> : error ? <ErrorBox error={error} language={language} /> : !data?.items.length ? <><div className="panel empty-large">{tr(language, 'Recycle Bin is empty')}</div><div className="project-table-footer"><strong>{language === 'zh' ? '总计：0 个项目' : 'Total: 0 projects'}</strong></div></> : <>
      <div className="bulk-actions"><span>{selected.length ? (language === 'zh' ? `已选择 ${selected.length} 个项目` : `${selected.length} selected`) : tr(language, 'Select projects to manage')}</span><div className="recycle-bulk-buttons"><button className="button secondary" disabled={!selected.length || restore.isPending} onClick={() => restoreProjects(selected)}>{tr(language, 'Restore selected')}</button><button className="button bulk-delete" disabled={!selected.length || permanentDelete.isPending} onClick={() => permanentlyDelete(selected)}>{tr(language, 'Permanently delete')}</button></div></div>
      <div className="table-wrap panel"><table className="projects-table recycle-table"><thead><tr><th className="col-select"><input type="checkbox" aria-label={language === 'zh' ? '选择本页回收站内全部项目' : 'Select all recycled projects on this page'} checked={data.items.every((project) => selectedIds.has(project.id))} onChange={(event) => setSelectedIds(event.target.checked ? new Set(data.items.map((project) => project.id)) : new Set())}/></th><th>CEG</th><th>{tr(language, 'Priority')}</th><th>BU</th><th>{tr(language, 'Supplier Name')}</th><th>{tr(language, 'USD Amount')}</th><th>{tr(language, 'Deleted At')}</th></tr></thead><tbody>{data.items.map((project) => <tr key={project.id}><td className="col-select"><input type="checkbox" aria-label={language === 'zh' ? `选择回收站项目 ${project.ceg || project.id}` : `Select recycled project ${project.ceg || project.id}`} checked={selectedIds.has(project.id)} onChange={(event) => setSelectedIds((current) => { const next = new Set(current); event.target.checked ? next.add(project.id) : next.delete(project.id); return next; })}/></td><td><b>{project.ceg || '—'}</b></td><td>{displaySystemValue(language, project.project_priority)}</td><td>{project.bu || '—'}</td><td>{project.supplier_name || '—'}</td><td className="amount-cell">{project.usd_amount ? `USD ${Number(project.usd_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td><td>{project.deleted_at ? new Date(project.deleted_at).toLocaleString(language === 'zh' ? 'zh-CN' : undefined) : '—'}</td></tr>)}</tbody></table></div>
      <div className="project-table-footer"><strong>{language === 'zh' ? `总计：${data.total} 个项目` : `Total: ${data.total} projects`}</strong><div className="pagination"><button disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>← {tr(language, 'Previous')}</button><span>{language === 'zh' ? `第 ${data.page} 页，共 ${data.pages} 页` : `Page ${data.page} of ${data.pages}`}</span><button disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)}>{tr(language, 'Next')} →</button></div></div>
    </>}
    {(restore.error || permanentDelete.error) && <ErrorBox error={restore.error || permanentDelete.error} language={language} />}
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
  return <div className="modal-backdrop"><div className="modal"><header><div><p className="eyebrow">{tr(language, 'PROCUREMENT PROJECT')}</p><h2>{copyMode ? tr(language, 'Copy Project') : project ? t.edit : t.create}</h2></div><button aria-label={tr(language, 'Close')} onClick={() => { if (!isDirty || confirm(tr(language, 'Discard unsaved changes?'))) close(); }}>×</button></header>
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))}><div className="form-sections">
      <section className="form-section"><SectionHeading number="01" title={tr(language, 'Project Basics')} description={tr(language, 'Ownership, priority and request context')} /><div className="form-grid">
        <Field label={tr(language, 'Priority')}><select {...register('project_priority')}><option value="">{tr(language, 'Select')}</option><option value="High">{tr(language, 'High')}</option><option value="Medium">{tr(language, 'Medium')}</option><option value="Normal">{tr(language, 'Normal')}</option></select></Field>
        <Field label="CEG"><select {...register('ceg')}><option value="">{tr(language, 'Select')}</option>{ceg && !CEG_OPTIONS.includes(ceg) && <option value={ceg}>{ceg} ({tr(language, 'Existing')})</option>}{CEG_OPTIONS.map((name) => <option key={name} value={name}>{name}</option>)}</select></Field><Field label="BU"><input {...register('bu')} onBlur={capitalizeOnBlur('bu')} /></Field><Field label={tr(language, 'BU Requestor')}><input {...register('requestor')} onBlur={capitalizeOnBlur('requestor')} /></Field>
        <Field label={tr(language, 'Request Date')}><input type="date" {...register('request_date')} /></Field><Field label={tr(language, 'Description')} wide><textarea rows={4} {...register('description')} onBlur={capitalizeOnBlur('description')} /></Field>
      </div></section>
      <section className="form-section financial-section"><SectionHeading number="02" title={tr(language, 'Budget')} description={tr(language, 'Original budget and live USD conversion')} /><div className="form-grid">
        <Field label={tr(language, 'Amount (excl.tax)')}><input type="text" inputMode="decimal" pattern="[0-9]+([.][0-9]*)?" placeholder="0.00" {...register('budget')} onBlur={(event) => { const value = event.currentTarget.value.trim(); if (value && /^\d+(\.\d*)?$/.test(value)) { const formatted = (Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2); event.currentTarget.value = formatted; setValue('budget', formatted, { shouldDirty: true, shouldValidate: true }); } }} /></Field>
        <Field label={tr(language, 'Currency')}><select {...register('currency')}><option value="">{tr(language, 'Select')}</option><option>CAD</option><option>USD</option><option>CNY</option><option>EUR</option></select></Field>
        <Field label={tr(language, 'Exchange Rate')}><input readOnly {...register('exchange_rate')} placeholder={tr(language, rateLoading ? 'Loading exchange rate…' : 'Select currency')} />{rateError && <small className="field-error">{tr(language, 'Exchange rate service unavailable')}</small>}<small className="rate-source">{tr(language, 'Rate source')}: {currency === 'USD' ? tr(language, 'USD base rate') : 'Huawei iData Finance'}</small></Field>
        <Field label={tr(language, 'USD Amount')}><input readOnly {...register('usd_amount')} placeholder="0.00" /></Field>
        <input type="hidden" {...register('exchange_rate_at')} />
      </div></section>
      <section className="form-section"><SectionHeading number="03" title={tr(language, 'Supplier & Procurement')} description={tr(language, 'Supplier profile, sourcing approach and current status')} /><ProcurementProgress language={language} status={procurementStatus} /><div className="form-grid">
        <Field label={tr(language, 'Supplier Name')}><input {...register('supplier_name')} onBlur={capitalizeOnBlur('supplier_name')} /></Field>
        <Field label={tr(language, 'Supplier Type')}><select {...register('supplier_type')}><option value="">{tr(language, 'Select')}</option>{optionList('supplier_type').map((o) => <option key={o.id} value={o.code}>{language === 'zh' ? o.label_zh : o.label_en}{!o.active ? ` (${tr(language, 'inactive')})` : ''}</option>)}</select></Field>
        <Field label={tr(language, 'Procurement Strategy')}><select {...register('procurement_strategy')}><option value="">{tr(language, 'Select')}</option>{optionList('procurement_strategy').map((o) => <option key={o.id} value={o.code}>{language === 'zh' ? o.label_zh : o.label_en}{!o.active ? ` (${tr(language, 'inactive')})` : ''}</option>)}</select></Field>
        <Field label={tr(language, 'Procurement Status')}><select {...register('procurement_status')}><option value="">{tr(language, 'Select')}</option>{optionList('procurement_status').map((o) => <option key={o.id} value={o.code}>{language === 'zh' ? o.label_zh : o.label_en}{!o.active ? ` (${tr(language, 'inactive')})` : ''}</option>)}</select></Field>
        <Field label={tr(language, 'Procurement Status Notes')} wide><textarea rows={3} {...register('procurement_status_notes')} onBlur={capitalizeOnBlur('procurement_status_notes')} /></Field>
      </div></section>
      <section className="form-section timeline-section"><SectionHeading number="04" title={tr(language, 'Timeline & Compliance')} description={tr(language, 'Approval milestones, compliance and final PO release')} /><ProjectTimeline language={language} prApproved={prApprovedDate} estimatedClosing={estimatedClosingDate} poReleased={poReleaseDate} lifecycle={copyMode ? 'active' : project?.lifecycle || 'active'} /><div className="form-grid">
        <Field label={tr(language, 'PR Approved Date')}><input type="date" {...register('pr_approved_date')} /></Field>
        <Field label={tr(language, 'Estimated Project Closing Date')}><input type="date" {...register('estimated_closing_date')} /></Field>
        <Field label={tr(language, 'EC Form')}><select {...register('ec_form')}><option value="">{tr(language, 'Select')}</option><option>Y</option><option>N</option><option>N/A</option></select></Field>
        <Field label={tr(language, 'Contract Required')}><select {...register('contract_required')}><option value="">{tr(language, 'Select')}</option><option>Y</option><option>N</option><option>N/A</option></select></Field>
        <Field label={tr(language, 'PO Release Date')} wide emphasis><input type="date" {...register('po_release_date')} /></Field>
      </div></section>
    </div>{mutation.error && <ErrorBox language={language} error={mutation.error instanceof ApiError && mutation.error.status === 409 ? new Error(t.conflict) : mutation.error} />}<footer><button type="button" className="button secondary" onClick={close}>{t.cancel}</button><button className="button primary" disabled={mutation.isPending}>{mutation.isPending ? `${tr(language, 'Saving')}…` : t.save}</button></footer></form>
  </div></div>;
}

function Field({ label, wide = false, emphasis = false, children }: { label: string; wide?: boolean; emphasis?: boolean; children: React.ReactNode }) { return <label className={`field${wide ? ' wide' : ''}${emphasis ? ' field-emphasis' : ''}`}><span>{label}{emphasis && <small>{label === 'PO 发布日期' ? '最终节点' : 'FINAL'}</small>}</span>{children}</label>; }

function SectionHeading({ number, title, description }: { number: string; title: string; description: string }) { return <div className="section-heading"><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div></div>; }

function ProcurementProgress({ status, language }: { status: string; language: Language }) {
  const steps = [{ value: 'Sourcing', label: 'Sourcing' }, { value: 'Qualification', label: 'Qualification' }, { value: 'Supplier Selection', label: 'Selection' }, { value: 'Contract Review', label: 'Contract' }, { value: 'PO Release', label: 'PO Release' }];
  const activeIndex = steps.findIndex((step) => step.value === status);
  return <div className="procurement-progress" aria-label={language === 'zh' ? '采购进度' : 'Procurement progress'}>{steps.map((step, index) => <div className={`progress-step ${activeIndex > index ? 'done' : activeIndex === index ? 'current' : ''}`} key={step.value}><i>{activeIndex > index ? '✓' : index + 1}</i><span>{tr(language, step.label)}</span></div>)}</div>;
}

function ProjectTimeline({ prApproved, estimatedClosing, poReleased, lifecycle, language }: { prApproved: string; estimatedClosing: string; poReleased: string; lifecycle: string; language: Language }) {
  const today = new Date().toISOString().slice(0, 10);
  const lifecycleDays = prApproved && poReleased && poReleased >= prApproved ? businessDays(prApproved, poReleased) : null;
  const overdueDays = lifecycle === 'active' && estimatedClosing && estimatedClosing < today ? businessDays(estimatedClosing, today) : null;
  const metrics = [
    { label: tr(language, 'Project Lifecycle'), value: lifecycleDays, tone: '' },
    { label: tr(language, 'Overdue Days'), value: overdueDays, tone: overdueDays !== null ? 'overdue' : '' },
  ];
  return <div className="timeline-metrics" aria-label={language === 'zh' ? '项目时间天数汇总' : 'Project timeline day summary'}>{metrics.map((metric) => <div className={`timeline-metric ${metric.tone}${metric.value === null ? ' empty' : ''}`} key={metric.label}><span>{metric.label}</span><strong>{metric.value === null ? '—' : metric.value}</strong><small>{tr(language, metric.value === null ? 'Not available' : 'business days')}</small></div>)}</div>;
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
    const labelEn = prompt(tr(language, 'English label'), option.label_en);
    if (labelEn === null) return Promise.resolve();
    const labelZh = prompt('中文标签', option.label_zh);
    if (labelZh === null) return Promise.resolve();
    const order = prompt(language === 'zh' ? '排序序号' : 'Sort order', String(option.sort_order));
    if (order === null) return Promise.resolve();
    return api(`/api/reference-options/${option.id}`, { method: 'PUT', body: JSON.stringify({ label_en: labelEn, label_zh: labelZh, sort_order: Number(order) || 0, active: option.active }) });
  }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['options'] }) });
  const remove = useMutation({
    mutationFn: (option: ReferenceOption) => api<void>(`/api/reference-options/${option.id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['options'] }),
  });
  const deleteOption = (option: ReferenceOption) => {
    if (confirm(language === 'zh' ? `确定永久删除“${option.label_zh || option.label_en}”吗？此操作无法撤销。` : `Permanently delete "${option.label_en}"? This cannot be undone.`)) remove.mutate(option);
  };
  return <section className="page"><div className="page-heading"><div><p className="eyebrow">{tr(language, 'REFERENCE DATA')}</p><h1>{copy[language].settings}</h1><p>{tr(language, 'Manage selectable business values without redeploying the application.')}</p></div></div>
    <div className="panel option-create"><select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}><option value="supplier_type">{tr(language, 'Supplier Type')}</option><option value="procurement_strategy">{tr(language, 'Procurement Strategy')}</option><option value="procurement_status">{tr(language, 'Procurement Status')}</option></select><input placeholder={tr(language, 'Code')} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })}/><input placeholder={tr(language, 'English label')} value={draft.label_en} onChange={(e) => setDraft({ ...draft, label_en: e.target.value })}/><input placeholder="中文标签" value={draft.label_zh} onChange={(e) => setDraft({ ...draft, label_zh: e.target.value })}/><button className="button primary" disabled={!draft.code || !draft.label_en || !draft.label_zh} onClick={() => create.mutate()}>{tr(language, 'Add option')}</button></div>
    {isLoading ? <Loading language={language} /> : error ? <ErrorBox error={error} language={language} /> : <div className="panel options-list">{data.map((option) => <div key={option.id}><span className="option-category">{tr(language, option.category === 'supplier_type' ? 'Supplier Type' : option.category === 'procurement_strategy' ? 'Procurement Strategy' : 'Procurement Status')}</span><b>{language === 'zh' ? option.label_zh : option.label_en}</b><span>{language === 'zh' ? option.label_en : option.label_zh}</span><code>{option.code}</code><span className="option-buttons"><button onClick={() => edit.mutate(option)}>{tr(language, 'Edit')}</button><button className={option.active ? 'active-toggle' : ''} onClick={() => toggle.mutate(option)}>{tr(language, option.active ? 'Active' : 'Inactive')}</button><button className="delete-option" onClick={() => deleteOption(option)}>{tr(language, 'Delete')}</button></span></div>)}</div>}
    {(create.error || edit.error || toggle.error || remove.error) && <ErrorBox error={create.error || edit.error || toggle.error || remove.error} language={language} />}
  </section>;
}

function Loading({ language = 'en' }: { language?: Language }) { return <div className="loading">{tr(language, 'Loading')}…</div>; }
function ErrorBox({ error, language = 'en' }: { error: unknown; language?: Language }) { return <div className="error-box">{error instanceof Error ? error.message : tr(language, 'Something went wrong.')}</div>; }

export default function App() {
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('cari-language') as Language) || 'en');
  const changeLanguage = (value: Language) => { setLanguage(value); localStorage.setItem('cari-language', value); document.documentElement.lang = value === 'zh' ? 'zh-CN' : 'en'; };
  return <Layout language={language} setLanguage={changeLanguage} />;
}
