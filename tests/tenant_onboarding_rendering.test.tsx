import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import OnboardingPage from "@/app/admin/onboarding/page";
import SignupPage from "@/app/admin/cadastro/page";
import ReadyPage from "@/app/admin/pronto/page";
import AdminPage from "@/app/admin/page";
import LoginPage from "@/app/admin/login/page";
import { OrganizationForm, SignupForm } from "@/modules/onboarding/forms";

const mocks = vi.hoisted(() => ({ access: vi.fn(), create: vi.fn(), signup: vi.fn(), login: vi.fn(), logout: vi.fn() }));
vi.mock("@/modules/onboarding/access.server", () => ({ loadOrganizationAccess: mocks.access }));
vi.mock("@/modules/onboarding/actions", () => ({ createOrganization: mocks.create }));
vi.mock("@/modules/admin/auth_actions", () => ({ signup: mocks.signup, login: mocks.login, logout: mocks.logout }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
beforeEach(() => { vi.clearAllMocks(); mocks.access.mockResolvedValue({ status: "unassigned" }); });
afterEach(cleanup);

it("usuário sem locadora encontra os seis campos e pode sair", async () => {
  render(await OnboardingPage());
  expect(screen.getByRole("heading", { name: "Crie sua locadora" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Criar minha locadora" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Sair" })).toBeVisible();
  expect(screen.getAllByRole("textbox")).toHaveLength(6);
  expect(screen.queryByRole("link")).toBeNull();
  expect(document.body.textContent).not.toMatch(/tenant|organization_id|membership|RLS/);
});
it.each([OnboardingPage, ReadyPage, AdminPage])("anônimo vai para login", async (page) => {
  mocks.access.mockResolvedValue({ status: "anonymous" });
  await expect(page()).rejects.toThrow("redirect:/admin/login");
});
it.each([AdminPage, ReadyPage, SignupPage])("sem locadora segue para onboarding", async (page) => {
  await expect(page()).rejects.toThrow("redirect:/admin/onboarding");
});
it.each([OnboardingPage, SignupPage, AdminPage])("usuário associado entra na Central sem novo formulário", async (page) => {
  mocks.access.mockResolvedValue({ status: "ready", organizationId: crypto.randomUUID() });
  await expect(page()).rejects.toThrow("redirect:/admin/interessados");
});
it("login encaminha usuário autenticado para a decisão centralizada em /admin", async () => {
  await expect(LoginPage({})).rejects.toThrow("redirect:/admin");
  mocks.access.mockResolvedValue({ status: "ready", organizationId: crypto.randomUUID() });
  await expect(LoginPage({})).rejects.toThrow("redirect:/admin");
});
it("confirmação de locadora exige associação e oferece entrada privada", async () => {
  mocks.access.mockResolvedValue({ status: "ready", organizationId: crypto.randomUUID() });
  render(await ReadyPage());
  expect(screen.getByRole("heading", { name: "Sua locadora está pronta" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Entrar na minha locadora" })).toHaveAttribute("href", "/admin/interessados");
});
it.each([OnboardingPage, ReadyPage, SignupPage])("falha técnica não libera criação nem anuncia sucesso", async (page) => {
  mocks.access.mockResolvedValue({ status: "error" });
  render(await page());
  expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível verificar");
  expect(screen.queryByRole("button", { name: "Criar minha locadora" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Sua locadora está pronta" })).toBeNull();
});
it("cadastro apresenta senhas seguras e resposta neutra sem ecoar credenciais", async () => {
  mocks.signup.mockResolvedValue({ message: "Confira seu e-mail ou entre com suas credenciais." });
  render(<SignupForm />);
  expect(screen.getByLabelText("Senha")).toHaveAttribute("autocomplete", "new-password");
  expect(screen.getByLabelText("Confirmar senha")).toHaveAttribute("minlength", "12");
  fireEvent.submit(screen.getByRole("button", { name: "Criar conta" }).closest("form")!);
  expect(await screen.findByRole("status")).toHaveTextContent("Confira seu e-mail");
});
it("erro preserva campos e a mesma operação para retry", async () => {
  const operationId = crypto.randomUUID();
  mocks.create.mockResolvedValue({ message: "Não foi possível criar sua locadora agora." });
  render(<OrganizationForm operationId={operationId} />);
  fireEvent.change(screen.getByLabelText("Nome da locadora"), { target: { value: "Locadora Sintética" } });
  fireEvent.submit(screen.getByRole("button", { name: "Criar minha locadora" }).closest("form")!);
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Nome da locadora")).toHaveValue("Locadora Sintética");
  fireEvent.submit(screen.getByRole("button", { name: "Criar minha locadora" }).closest("form")!);
  await screen.findByRole("alert");
  expect(mocks.create.mock.calls[0][0]).toBe(operationId);
  expect(mocks.create.mock.calls[1][0]).toBe(operationId);
});
