export const SIDEBAR_STORAGE_KEY = 'cari-sidebar-collapsed';

export function readSidebarCollapsed(): boolean {
  try { return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'; }
  catch { return false; }
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  // A blocked/full browser store must not prevent navigation or toggling.
  try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed)); }
  catch { /* Keep the preference for this session in React state. */ }
}
