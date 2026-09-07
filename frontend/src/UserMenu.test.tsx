import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import UserMenu, { englishDisplayName, safeAvatarUrl, userInitials } from './UserMenu';
import type { Actor } from './types';

const actor: Actor = { id: 'test.user', name: 'Olivia Fang', role: 'admin' };
const render = (overrides: Partial<Actor> = {}, mode: 'w3' | 'disabled' = 'w3', language: 'en' | 'zh' = 'en') =>
  renderToStaticMarkup(<UserMenu actor={{ ...actor, ...overrides }} authMode={mode} language={language} />);

describe('user presentation', () => {
  it.each([
    ['Olivia Fang', 'OF'], ['  Olivia   Fang  ', 'OF'], ['Sam', 'SA'], ['王小明', '王'],
    ['李森 l00477035', '李'], ['', '?'], ['𠮷田', '𠮷'],
  ])('uses readable initials for %s', (name, expected) => { expect(userInitials(name)).toBe(expected); });

  it('shows only the name and avatar with a separate visible sign-out action', () => {
    const html = render();
    expect(html).toContain('user-menu-name">Olivia Fang');
    expect(html).toContain('<span>OF</span>');
    expect(html).not.toContain('aria-expanded');
    expect(html).not.toContain(' hidden=');
    expect(html).not.toContain('test.user');
    expect(html).not.toContain('Administrator');
    expect(html).toContain('Sign out');
    expect(html).toContain('href="/ai_procurement/api/auth/logout"');
  });

  it('uses a valid photo without sending the referring page', () => {
    const html = render({ avatar_url: 'https://photos.huawei.com/a.jpg' });
    expect(html).toContain('<img');
    expect(html).toContain('src="https://photos.huawei.com/a.jpg"');
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toContain('<span>OF</span>');
  });

  it('retains the user name when a photo is unavailable or unsafe', () => {
    for (const avatar_url of [null, '', 'javascript:alert(1)', 'data:image/png;base64,AAA']) {
      const html = render({ avatar_url });
      expect(html).not.toContain('<img');
      expect(html).toContain('user-menu-name">Olivia Fang');
    }
  });

  it('keeps local test mode useful without offering an invalid sign-out link', () => {
    const html = render({ name: 'Local Test User' }, 'disabled', 'zh');
    expect(html).toContain('Local Test User');
    expect(html).not.toContain('/api/auth/logout');
  });

  it('falls back to the account ID and escapes unexpected display-name markup', () => {
    expect(render({ name: ' ' })).toContain('user-menu-name">test.user');
    const html = render({ name: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('keeps the full long name in an accessible text node and tooltip', () => {
    const name = 'Alexandra Catherine Montgomery-Wellington';
    expect(render({ name })).toContain(`title="${name}"`);
    expect(render({ name })).toContain(`user-menu-name">${name}</span>`);
  });

  it('prefers the W3 English name in either interface language', () => {
    for (const language of ['en', 'zh'] as const) {
      const html = render({ name: '王小明', name_en: 'Xiaoming Wang' }, 'w3', language);
      expect(html).toContain('user-menu-name">Xiaoming Wang');
      expect(html).not.toContain('王小明');
    }
    expect(englishDisplayName({ ...actor, name_en: '  Élodie Martin  ' })).toBe('Élodie Martin');
  });

  it('keeps old sessions valid without inventing an English name', () => {
    expect(englishDisplayName({ ...actor, name: '王小明' })).toBe('test.user');
    expect(englishDisplayName({ ...actor, name_en: ' ' })).toBe('Olivia Fang');
  });
});

describe('avatar URL safety', () => {
  it.each([
    undefined, null, '', 'http://photos.huawei.com/a.jpg', '//photos.huawei.com/a.jpg',
    'https:photos.huawei.com/a.jpg', 'https:///photos.huawei.com/a.jpg',
    'https://user:password@photos.huawei.com/a.jpg', 'https://photos.huawei.com/a.jpg#token',
    'https://photos.huawei.com:8080/a.jpg', 'https://photos.huawei.com/a.jpg?access_token=private',
    'https://photos.huawei.com/a.jpg?%61ccess_token=private', 'https://photos.huawei.com/a.jpg?code=private',
    'https://photos.huawei.com/a\nb.jpg', 'https://photos.huawei.com\\a.jpg',
    'https://photos.huawei.com/' + 'a'.repeat(500),
  ])('does not load unsafe or oversized values (%s)', (value) => { expect(safeAvatarUrl(value)).toBeUndefined(); });

  it('allows ordinary image-size parameters', () => {
    expect(safeAvatarUrl(' https://photos.huawei.com/a.jpg?size=64 ')).toBe('https://photos.huawei.com/a.jpg?size=64');
  });
});
