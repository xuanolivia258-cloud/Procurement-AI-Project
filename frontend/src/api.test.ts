import { describe, expect, it } from 'vitest';
import { queryString } from './api';
import { toPayload } from './App';

describe('queryString', () => {
  it('omits blank values and keeps active filters', () => {
    expect(queryString({ page: 2, priority: 'High', ceg: '', overdue: undefined })).toBe('page=2&priority=High');
  });
});

describe('project payload', () => {
  it('normalizes optional blank fields to null', () => {
    const payload = toPayload({
      project_priority: '', ceg: '', requestor: '', bu: '', request_date: '', budget: '', currency: '', exchange_rate: '', usd_amount: '', exchange_rate_at: '', description: '',
      supplier_name: '', supplier_type: '', procurement_strategy: '', procurement_status: '', procurement_status_notes: '', ec_form: '',
      pr_approved_date: '', estimated_closing_date: '', contract_required: '', po_release_date: '',
    });
    expect(payload.ceg).toBeNull();
    expect(payload.budget).toBeNull();
  });
});
