import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSidebarCollapsed, saveSidebarCollapsed, SIDEBAR_STORAGE_KEY } from './sidebarState';

afterEach(() => vi.unstubAllGlobals());

describe('sidebar preference', () => {
  it.each([null, 'false', '', 'invalid'])('defaults to expanded for %s', (value) => {
    vi.stubGlobal('localStorage', { getItem: () => value });
    expect(readSidebarCollapsed()).toBe(false);
  });

  it('restores a collapsed sidebar from its own preference key', () => {
    const getItem = vi.fn(() => 'true');
    vi.stubGlobal('localStorage', { getItem });
    expect(readSidebarCollapsed()).toBe(true);
    expect(getItem).toHaveBeenCalledWith(SIDEBAR_STORAGE_KEY);
  });

  it.each([true, false])('stores %s without touching language or authentication data', (collapsed) => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    saveSidebarCollapsed(collapsed);
    expect(setItem).toHaveBeenCalledExactlyOnceWith(SIDEBAR_STORAGE_KEY, String(collapsed));
  });

  it('does not block toggling if storage is unavailable or full', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Storage blocked'); },
      setItem: () => { throw new Error('Storage full'); },
    });
    expect(readSidebarCollapsed()).toBe(false);
    expect(() => saveSidebarCollapsed(true)).not.toThrow();
  });
});
