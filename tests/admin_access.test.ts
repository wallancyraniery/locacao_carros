import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ create: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }), revalidate: vi.fn() }));
vi.mock("@/modules/admin/supabase.server", () => ({ createAdminClient: mocks.create }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { loadInterestedLeads } from "@/modules/admin/interested_leads.server";
import { login, logout } from "@/modules/admin/auth_actions";
import { parseAdminAuthEnvironment } from "@/config/admin_auth_environment";

function client() {
  const membership = { maybeSingle: vi.fn().mockResolvedValue({ data: { organization_id: 'synthetic-org' }, error: null }) };
  const query = { order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: [], error: null }) };
  const from = vi.fn((table: string) => ({ select: vi.fn().mockReturnValue(table === 'organization_memberships' ? membership : query) }));
  return { from, membership, query, auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'synthetic-user', is_anonymous: false } }, error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ error: null }), signOut: vi.fn().mockResolvedValue({ error: null }),
  } };
}
let api: ReturnType<typeof client>;
beforeEach(() => { vi.clearAllMocks(); api = client(); mocks.create.mockResolvedValue(api); });

function form(email = "pessoa@example.test", password = "senha-sintetica") {
  const result = new FormData(); result.set('email', email); result.set('password', password); return result;
}

describe('identidade e leitura privadas', () => {
  it.each([
    { data: { user: null }, error: null },
    { data: { user: { id: 'spoofed' } }, error: { message: 'invalid JWT' } },
    { data: { user: { id: 'anonymous', is_anonymous: true } }, error: null },
  ])('não consulta dados sem identidade validada', async (identity) => {
    api.auth.getUser.mockResolvedValue(identity as never);
    expect(await loadInterestedLeads(1)).toEqual({ status: 'anonymous' });
    expect(api.from).not.toHaveBeenCalled();
  });
  it('usuário sem associação não consulta leads', async () => {
    api.membership.maybeSingle.mockResolvedValue({ data: null, error: null } as never);
    expect(await loadInterestedLeads(1)).toEqual({ status: 'unassigned' });
    expect(api.from.mock.calls).toEqual([['organization_memberships']]);
  });
  it('paginação limitada e ordenação estável, sem filtro pessoal na URL', async () => {
    api.query.range.mockResolvedValue({ data: Array.from({ length: 51 }, (_, i) => ({ id: String(i) })), error: null } as never);
    const result = await loadInterestedLeads(2);
    expect(result).toMatchObject({ status: 'ready', hasNext: true });
    if (result.status === 'ready') expect(result.leads).toHaveLength(50);
    expect(api.query.range).toHaveBeenCalledWith(50, 100);
    expect(api.query.order.mock.calls).toEqual([['created_at', { ascending: false }], ['id', { ascending: false }]]);
    expect(api.auth.getUser).toHaveBeenCalledOnce();
  });
  it.each(['client', 'identity', 'membership', 'leads'])('falha fechada e sem detalhes em %s', async (stage) => {
    const failure = new Error('pessoa@example.test secret=synthetic');
    if (stage === 'client') mocks.create.mockRejectedValue(failure);
    if (stage === 'identity') api.auth.getUser.mockRejectedValue(failure);
    if (stage === 'membership') api.membership.maybeSingle.mockResolvedValue({ data: null, error: failure } as never);
    if (stage === 'leads') api.query.range.mockResolvedValue({ data: null, error: failure } as never);
    const log = vi.spyOn(console, 'error');
    expect(await loadInterestedLeads(1)).toEqual({ status: 'error' });
    expect(log).not.toHaveBeenCalled(); log.mockRestore();
  });
});

describe('login e logout somente por senha', () => {
  it('login envia credenciais apenas para Auth e redireciona para caminho fixo', async () => {
    const input = form(); input.set('next', 'https://example.test');
    await expect(login({}, input)).rejects.toThrow('redirect:/admin/interessados');
    expect(api.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'pessoa@example.test', password: 'senha-sintetica' });
    expect(mocks.revalidate).toHaveBeenCalledWith('/admin', 'layout');
  });
  it('entrada inválida não chama Auth', async () => {
    expect(await login({}, form('invalid', ''))).toHaveProperty('message');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('credenciais rejeitadas não expõem detalhes e não redirecionam', async () => {
    api.auth.signInWithPassword.mockResolvedValue({ error: { message: 'pessoa@example.test senha-sintetica' } } as never);
    expect(await login({}, form())).toEqual({ message: 'Não foi possível entrar. Confira suas credenciais e tente novamente.' });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it('falha de rede no login é genérica', async () => {
    api.auth.signInWithPassword.mockRejectedValue(new Error('private'));
    expect(await login({}, form())).toEqual({ message: 'Não foi possível entrar agora. Tente novamente mais tarde.' });
  });
  it('logout invalida a sessão local, revalida cache e redireciona', async () => {
    await expect(logout()).rejects.toThrow('redirect:/admin/login');
    expect(api.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mocks.revalidate).toHaveBeenCalledWith('/admin', 'layout');
  });
  it('logout com erro não declara sucesso', async () => {
    api.auth.signOut.mockResolvedValue({ error: new Error('private') } as never);
    expect(await logout()).toEqual({ message: 'Não foi possível sair. Tente novamente.' });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe('configuração pública de Auth', () => {
  const valid = { NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic' };
  it('aceita somente chave publishable e cookies seguros', () => {
    expect(parseAdminAuthEnvironment(valid)).toMatchObject({ cookieOptions: { httpOnly: true, secure: true, sameSite: 'lax' } });
  });
  it.each([
    {}, { ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_private' },
    { ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'eyJservice_role' },
    { ...valid, NEXT_PUBLIC_SUPABASE_URL: 'http://abcdefghijklmnopqrst.supabase.co' },
    { ...valid, NEXT_PUBLIC_SUPABASE_URL: 'https://name:password@abcdefghijklmnopqrst.supabase.co' },
    { ...valid, NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co?secret=private' },
  ])('recusa configuração insegura sem revelar valores', (environment) => {
    expect(() => parseAdminAuthEnvironment(environment)).toThrow('Configuração da Central indisponível.');
  });
});
