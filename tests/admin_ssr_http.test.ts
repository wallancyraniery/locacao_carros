import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock('server-only', () => ({}));
const store = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock('next/headers', () => ({ cookies: async () => ({
  getAll: () => Array.from(store.values, ([name, value]) => ({ name, value })),
  set: (name: string, value: string) => { if (value) store.values.set(name, value); else store.values.delete(name); },
}) }));
import { createAdminClient } from '@/modules/admin/supabase.server';
import { loadInterestedLeads } from '@/modules/admin/interested_leads.server';

const user = { id: '70000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.test', is_anonymous: false, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const token = [btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), btoa(JSON.stringify({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })), 'synthetic-signature'].join('.');

beforeEach(() => {
  store.values.clear();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_synthetic');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('SDK SSR real com HTTP sintético', () => {
  it('login grava cookies; próxima requisição valida identidade e consulta com JWT; logout remove cookies', async () => {
    const requests: { url: string; method: string; authorization: string | null }[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push({ url: request.url, method: request.method, authorization: request.headers.get('authorization') });
      let body: unknown;
      if (request.url.includes('/auth/v1/token')) body = { access_token: token, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user };
      else if (request.url.includes('/auth/v1/user')) body = user;
      else if (request.url.includes('/organization_memberships')) body = { organization_id: '10000000-0000-4000-8000-000000000001' };
      else if (request.url.includes('/rental_leads')) body = [];
      else if (request.url.includes('/auth/v1/logout')) return new Response(null, { status: 204 });
      else throw new Error('Unexpected synthetic request');
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const loginClient = await createAdminClient();
    expect((await loginClient.auth.signInWithPassword({ email: user.email, password: 'synthetic-password' })).error).toBeNull();
    expect(store.values.size).toBeGreaterThan(0);
    expect(await loadInterestedLeads(1)).toEqual({ status: 'ready', leads: [], hasNext: false });
    const reads = requests.filter(({ url }) => url.includes('/rest/v1/') || url.includes('/auth/v1/user'));
    expect(reads).toHaveLength(3);
    for (const request of reads) {
      expect(request.authorization).toBe(`Bearer ${token}`);
      expect(request.url).not.toContain(user.email);
      expect(request.url).not.toContain(user.id);
    }
    const logoutClient = await createAdminClient();
    expect((await logoutClient.auth.signOut({ scope: 'local' })).error).toBeNull();
    expect(store.values.size).toBe(0);
    expect(await loadInterestedLeads(1)).toEqual({ status: 'anonymous' });
  });
});
