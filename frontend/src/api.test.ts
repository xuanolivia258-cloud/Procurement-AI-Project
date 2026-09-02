import { describe, expect, it } from 'vitest';
import { queryString } from './api';
import { sortCegByPriority, toPayload } from './App';

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

describe('CEG priority ordering', () => {
  it('orders High-heavy CEGs first, then Medium-heavy, then Normal-heavy', () => {
    const base = { project_count: 1, usd_amount: '0', completed_count: 0, overdue_count: 0 };
    const items = [
      { ...base, ceg: 'Normal CEG', high_priority_count: 0, medium_priority_count: 0, normal_priority_count: 8 },
      { ...base, ceg: 'Medium CEG', high_priority_count: 0, medium_priority_count: 5, normal_priority_count: 0 },
      { ...base, ceg: 'High CEG', high_priority_count: 2, medium_priority_count: 0, normal_priority_count: 0 },
      { ...base, ceg: 'Second High CEG', high_priority_count: 1, medium_priority_count: 10, normal_priority_count: 0 },
    ];

    expect(sortCegByPriority(items).map((item) => item.ceg)).toEqual([
      'High CEG', 'Second High CEG', 'Medium CEG', 'Normal CEG',
    ]);
  });
});
