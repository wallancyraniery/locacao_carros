import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CookieMethodsServer } from "@supabase/ssr";
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ create: vi.fn(), cookies: vi.fn(), claims: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.create }));
vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
import { proxy } from '@/proxy';
import { createAdminClient } from '@/modules/admin/supabase.server';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_synthetic');
  mocks.create.mockReturnValue({ auth: { getClaims: mocks.claims } });
  mocks.claims.mockResolvedValue({ data: { claims: { sub: 'synthetic' } }, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('cookies SSR e cache administrativo', () => {
  it('renova cookies tanto no request quanto na resposta e preserva headers SSR', async () => {
    const request = new NextRequest('https://app.example.test/admin/interessados', { headers: { cookie: 'session=old' } });
    mocks.claims.mockImplementationOnce(async () => {
      const options = mocks.create.mock.calls[0][2] as { cookies: CookieMethodsServer };
      expect(options.cookies.getAll()).toEqual([{ name: 'session', value: 'old' }]);
      await options.cookies.setAll!([{ name: 'session', value: 'renewed', options: { httpOnly: true, secure: true } }], { Expires: '0' });
      return { data: { claims: { sub: 'synthetic' } }, error: null };
    });
    const response = await proxy(request);
    expect(mocks.claims).toHaveBeenCalledOnce();
    expect(request.cookies.get('session')?.value).toBe('renewed');
    expect(response.cookies.get('session')?.value).toBe('renewed');
    expect(response.headers.get('cache-control')).toContain('private, no-store');
    expect(response.headers.get('expires')).toBe('0');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });
  it('erro de refresh não vaza dados e mantém no-store', async () => {
    mocks.claims.mockRejectedValueOnce(new Error('token-private'));
    const response = await proxy(new NextRequest('https://app.example.test/admin/interessados'));
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.text()).not.toContain('token-private');
  });
  it('cria cliente por request, sem credencial administrativa e sem cache de dados', async () => {
    const store = { getAll: vi.fn().mockReturnValue([]), set: vi.fn() };
    mocks.cookies.mockResolvedValue(store);
    vi.stubEnv('SUPABASE_SECRET_KEY', 'must-not-be-used');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await createAdminClient(); await createAdminClient();
    expect(mocks.create).toHaveBeenCalledTimes(2);
    const [url, key, options] = mocks.create.mock.calls[0];
    expect(url).toBe('https://abcdefghijklmnopqrst.supabase.co');
    expect(key).toBe('sb_publishable_synthetic');
    expect(options.cookieOptions).toMatchObject({ secure: true, httpOnly: true, sameSite: 'lax' });
    await options.global.fetch('https://synthetic.test', { cache: 'force-cache' });
    expect(fetchMock).toHaveBeenCalledWith('https://synthetic.test', { cache: 'no-store' });
    await options.cookies.setAll([{ name: 'session', value: 'value', options: { httpOnly: true } }]);
    expect(store.set).toHaveBeenCalledWith('session', 'value', { httpOnly: true });
  });
});
