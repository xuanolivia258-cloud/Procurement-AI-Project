import { afterEach, describe, expect, it, vi } from 'vitest';
import { DIRECTORY_ENDPOINTS, directoryEnglishName, fetchOwnerProfile, type OwnerProfile } from './ownerProfile';
import type { Actor } from './types';

const actor: Actor = { id: 'l00123456', name: '王小明', name_en: 'W3 Fallback', role: 'viewer' };
const directoryUrl = [...DIRECTORY_ENDPOINTS][0];
const profile: OwnerProfile = {
  ...actor, avatar_url: 'https://w3.huawei.com/w3lab/rest/yellowpage/face/00123456/45',
  directory_lookup: { url: directoryUrl, account: actor.id, timeout_ms: 3000 },
};
const record = { w3Name: actor.id, fullName: 'Alex Wang l00123456', cnName: '王小明', dptName: 'Test' };
const fallback: Actor = { ...actor, avatar_url: profile.avatar_url };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function mockRequests(metadata: OwnerProfile = profile) {
  const mock = vi.fn<typeof fetch>().mockResolvedValueOnce(response(metadata));
  vi.stubGlobal('fetch', mock);
  return mock;
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('MRVP Owner result matching', () => {
  it.each([
    ['Alex Wang l00123456', 'Alex Wang'], ['Alex Wang (l00123456)', 'Alex Wang'],
    ['Alex Wang（l00123456）', 'Alex Wang'], ['Alex Wang', 'Alex Wang'],
    ['王小明 Alex Wang l00123456', 'Alex Wang'], ['Élodie O’Connor l00123456', 'Élodie O’Connor'],
  ])('extracts an English name from %s', (fullName, expected) => {
    expect(directoryEnglishName({ result: [{ ...record, w3Name: 'L00123456', fullName }] }, actor.id)).toBe(expected);
  });

  it('ignores fuzzy-search neighbours and follows the result-array contract', () => {
    expect(directoryEnglishName({ status: 0, result: [
      { ...record, w3Name: 'l001234567', fullName: 'Another Person l001234567' }, record,
    ] }, actor.id)).toBe('Alex Wang');
  });

  it.each([null, {}, { result: {} }, { result: [] }, { result: [null] },
    { result: [record, record] }, { result: [{ ...record, w3Name: 'another.user' }] },
    { result: [{ ...record, fullName: '王小明 l00123456' }] },
    { result: [{ ...record, fullName: 'Alex\nWang' }] },
    { result: [{ ...record, fullName: 'A'.repeat(401) }] },
  ])('does not guess a name from invalid or ambiguous records: %j', (body) => {
    expect(directoryEnglishName(body, actor.id)).toBeUndefined();
  });
});

describe('browser-authenticated self-profile lookup', () => {
  it('uses MRVP credentials and headers, then updates display fields only', async () => {
    const mock = mockRequests();
    mock.mockResolvedValueOnce(response({ result: [{ ...record, role: 'admin', avatar_url: 'https://wrong.example/photo' }] }));
    const signal = new AbortController().signal;
    const result = await fetchOwnerProfile(actor, signal);
    expect(result).toEqual({ ...fallback, name_en: 'Alex Wang' });
    expect(mock.mock.calls[0][0]).toBe('/ai_procurement/api/auth/profile');
    expect(mock.mock.calls[0][1]).toMatchObject({ signal, cache: 'no-store' });
    const [url, options] = mock.mock.calls[1];
    expect(url).toBe(`${directoryUrl}?userInfo=l00123456`);
    expect(options).toMatchObject({ method: 'GET', credentials: 'include', mode: 'cors', redirect: 'error' });
    expect(options?.headers).toEqual({ 'x-user-name': actor.id, Accept: 'application/json' });
    expect(result.name).toBe(actor.name);
    expect(result.role).toBe('viewer');
  });

  it.each([401, 403, 500])('keeps the procurement session usable on directory HTTP %s', async (status) => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    mockRequests().mockResolvedValueOnce(response({ error: { code: 'AUTHENTICATION_REQUIRED' } }, status));
    expect(await fetchOwnerProfile(actor, new AbortController().signal)).toEqual(fallback);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it.each(['<html>SSO sign-in</html>', 'not json', 'x'.repeat(65537)])('ignores non-profile response bodies', async (body) => {
    mockRequests().mockResolvedValueOnce(new Response(body));
    expect(await fetchOwnerProfile(actor, new AbortController().signal)).toEqual(fallback);
  });

  it('keeps fallback fields on CORS, redirect or network errors', async () => {
    mockRequests().mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await fetchOwnerProfile(actor, new AbortController().signal)).toEqual(fallback);
  });

  it('does not call the directory for another identity or an unapproved endpoint', async () => {
    for (const metadata of [
      { ...profile, id: 'another.user' },
      { ...profile, directory_lookup: undefined },
      { ...profile, directory_lookup: { ...profile.directory_lookup!, account: 'another.user' } },
      { ...profile, directory_lookup: { ...profile.directory_lookup!, url: 'https://unrelated.example/collect' } },
    ]) {
      const mock = mockRequests(metadata);
      await fetchOwnerProfile(actor, new AbortController().signal);
      expect(mock).toHaveBeenCalledTimes(1);
    }
  });

  it('bounds the optional directory request and releases its timer', async () => {
    vi.useFakeTimers();
    const mock = mockRequests();
    mock.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const pending = fetchOwnerProfile(actor, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toEqual(fallback);
    expect(mock.mock.calls[1][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels work on identity change/unmount rather than caching a cancelled lookup', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const mock = mockRequests();
    mock.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const pending = fetchOwnerProfile(actor, controller.signal);
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never turns a procurement profile 401 into an unrelated directory call', async () => {
    const mock = vi.fn<typeof fetch>().mockResolvedValueOnce(response({}, 401));
    vi.stubGlobal('fetch', mock);
    await expect(fetchOwnerProfile(actor, new AbortController().signal)).rejects.toMatchObject({ status: 401 });
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
