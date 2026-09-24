import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CentralShell } from "@/modules/central/shell";
import { ImproveBrand } from "@/modules/ui/brand";
import { VehiclePlaceholder } from "@/modules/ui/empty_state";
import { InterestedLeads } from "@/modules/admin/interested_leads";
vi.mock("@/modules/admin/auth_actions", () => ({ logout: vi.fn() }));
afterEach(cleanup);
it("navegação tem cinco destinos, página atual e atalho de teclado para conteúdo", () => {
  render(<CentralShell title="Minha locadora" current="/admin/locadora" name="Locadora com nome extenso" email="proprietario@example.test" role="owner"><p>Conteúdo privado</p></CentralShell>);
  const nav = screen.getByRole("navigation", { name: "Central da locadora" });
  expect(within(nav).getAllByRole("link")).toHaveLength(5);
  expect(within(nav).getByRole("link", { name: "Minha locadora" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Pular para o conteúdo" })).toHaveAttribute("href", "#central-content");
  expect(document.querySelector("#central-content")).toHaveAttribute("tabindex", "-1");
  expect(screen.getByText("proprietario@example.test")).toBeVisible(); expect(screen.getByText("Conta proprietária")).toBeVisible();
  expect(screen.queryByRole("link", { name: "proprietario@example.test" })).toBeNull();
});
it("atribuição pública é discreta e placeholder continua honesto, sem imagem fictícia", () => {
  render(<><ImproveBrand subtle /><VehiclePlaceholder /></>);
  expect(screen.getByText(/Plataforma por/)).toBeVisible(); expect(screen.getByText("Sem foto")).toBeVisible(); expect(screen.queryByRole("img")).toBeNull();
});
it("tabela mantém semântica e região rolável acessível pelo teclado", () => {
  render(<InterestedLeads leads={[{ id: "synthetic", full_name: "Pessoa sintética", phone: "11999990000", email: "contato.muito.longo@example.test", city: "Cidade sintética", created_at: "2026-09-15T12:00:00Z", preferred_contact_time: null, status: "new", vehicles: null }]} />);
  expect(screen.getByRole("region")).toHaveAttribute("tabindex", "0"); expect(screen.getAllByRole("columnheader")).toHaveLength(7);
  expect(screen.getByText("Novo")).toBeVisible(); expect(screen.queryByRole("link")).toBeNull();
});
