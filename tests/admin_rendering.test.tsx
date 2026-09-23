import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ load: vi.fn(), access: vi.fn(), login: vi.fn(), logout: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("@/modules/admin/interested_leads.server", () => ({ loadInterestedLeads: mocks.load }));
vi.mock("@/modules/admin/auth_actions", () => ({ login: mocks.login, logout: mocks.logout }));
vi.mock("@/modules/onboarding/access.server", () => ({ loadOrganizationAccess: mocks.access }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import Page from "@/app/admin/interessados/page";
import LoginPage from "@/app/admin/login/page";
import Loading from "@/app/admin/interessados/loading";
import ErrorPage from "@/app/admin/interessados/error";
import { InterestedLeads } from "@/modules/admin/interested_leads";

beforeEach(() => { vi.clearAllMocks(); mocks.access.mockResolvedValue({ status: "anonymous" }); });
afterEach(cleanup);
describe('Central: estados visíveis', () => {
  it('mostra login por senha e acesso ao cadastro', async () => {
    render(await LoginPage({}));
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/admin/cadastro');
  });
  it('renderiza estado vazio e logout', async () => {
    mocks.load.mockResolvedValue({ status: 'ready', leads: [], hasNext: false });
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText('Nenhum interessado recebido.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeVisible();
  });
  it('anônimo é redirecionado no servidor', async () => {
    mocks.load.mockResolvedValue({ status: 'anonymous' });
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow('redirect:/admin/login');
  });
  it.each(['error'])('estado %s não renderiza tabela', async (status) => {
    mocks.load.mockResolvedValue({ status });
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole(status === 'error' ? 'alert' : 'status')).toBeVisible();
  });
  it('usuário sem locadora vai para o onboarding', async () => {
    mocks.load.mockResolvedValue({ status: 'unassigned' });
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow('redirect:/admin/onboarding');
  });
  it('renderiza carregamento e erro sem detalhes internos', () => {
    const reset = vi.fn();
    render(<><Loading /><ErrorPage reset={reset} /></>);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando interessados');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(reset).toHaveBeenCalledOnce();
  });
  it('renderiza os sete campos permitidos sem links pessoais', () => {
    render(<InterestedLeads leads={[{
      id: 'lead-sintetico', created_at: '2026-09-15T12:00:00Z', full_name: 'Pessoa Sintética', phone: '11999990000', email: 'pessoa@example.test', city: 'Cidade Sintética', preferred_contact_time: 'Tarde', status: 'new',
      vehicles: { brand: 'Marca', model: 'Modelo', version: null, year: 2024 },
    }]} />);
    expect(screen.getAllByRole('columnheader')).toHaveLength(7);
    expect(screen.getByText('Pessoa Sintética')).toBeVisible();
    expect(screen.getByText('Marca Modelo 2024')).toBeVisible();
    expect(screen.getByText('Novo')).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
  it('paginação usa apenas número de página', async () => {
    mocks.load.mockResolvedValue({ status: 'ready', leads: [], hasNext: true });
    render(await Page({ searchParams: Promise.resolve({ page: '2' }) }));
    expect(mocks.load).toHaveBeenCalledWith(2);
    expect(screen.getByRole('link', { name: 'Anterior' })).toHaveAttribute('href', '/admin/interessados?page=1');
    expect(screen.getByRole('link', { name: 'Próxima' })).toHaveAttribute('href', '/admin/interessados?page=3');
  });
});
