export type Lifecycle = 'active' | 'completed';

export interface ProjectInput {
  project_priority: '' | 'Normal' | 'Medium' | 'High';
  ceg: string;
  requestor: string;
  bu: string;
  request_date: string;
  budget: string;
  currency: '' | 'CAD' | 'USD' | 'CNY' | 'EUR';
  exchange_rate: string;
  usd_amount: string;
  exchange_rate_at: string;
  description: string;
  supplier_name: string;
  supplier_type: string;
  procurement_strategy: string;
  procurement_status: string;
  procurement_status_notes: string;
  pr_approved_date: string;
  estimated_closing_date: string;
  ec_form: '' | 'Y' | 'N' | 'N/A';
  contract_required: '' | 'Y' | 'N' | 'N/A';
  po_release_date: string;
}

export interface Project extends Omit<ProjectInput, 'budget'> {
  id: number;
  budget: string | null;
  lifecycle: Lifecycle;
  version: number;
  is_overdue: boolean;
  project_cycle_business_days: number | null;
  created_by: string;
  updated_by: string;
  completed_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedProjects {
  items: Project[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface AuditLog {
  id: number;
  project_id: number;
  action: string;
  changes: Record<string, { before: unknown; after: unknown }>;
  actor_id: string;
  actor_name: string;
  created_at: string;
}

export interface ReferenceOption {
  id: number;
  category: 'supplier_type' | 'procurement_strategy' | 'procurement_status';
  code: string;
  label_en: string;
  label_zh: string;
  active: boolean;
  sort_order: number;
}

export interface DashboardData {
  lifecycle: Record<string, number>;
  overdue: number;
  total_budget: string;
  priority: Record<string, number>;
  procurement_status: Record<string, number>;
}

export interface BudgetAnalysisData {
  from_month: string | null;
  to_month: string | null;
  monthly: { month: string; usd_amount: string; project_count: number }[];
  total_usd_amount: string;
  project_count: number;
}
