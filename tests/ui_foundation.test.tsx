import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CentralShell } from "@/modules/central/shell";
import { ImproveBrand } from "@/modules/ui/brand";
import { VehiclePlaceholder } from "@/modules/ui/empty_state";
import { InterestedLeads } from "@/modules/admin/interested_leads";
import { AuthFrame } from "@/modules/ui/auth_frame";
import InterestedLoading from "@/app/admin/interessados/loading";
import VehiclesLoading from "@/app/admin/veiculos/loading";
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
it.each([
  { Component: InterestedLoading, label: "Carregando interessados…" },
  { Component: VehiclesLoading, label: "Carregando veículos…" },
])("loading anuncia $label e mantém skeleton decorativo", ({ Component, label }) => {
  const { container } = render(<Component />);
  expect(screen.getByRole("status")).toHaveTextContent(label);
  const skeleton = container.querySelector(".loading-skeleton");
  expect(skeleton).toHaveAttribute("aria-hidden", "true");
  expect(skeleton?.textContent).toBe("");
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("moldura de acesso preserva conteúdo e link inicial com fundo decorativo", () => {
  const { container } = render(<AuthFrame><h1>Entre na sua locadora</h1><label htmlFor="synthetic-email">E-mail</label><input id="synthetic-email" type="email" /></AuthFrame>);
  expect(screen.getByRole("link", { name: "Improve — Início" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("heading", { level: 1, name: "Entre na sua locadora" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "E-mail" })).toBeInTheDocument();
  const backdrop = container.querySelector("svg.flow-backdrop");
  expect(backdrop).toHaveAttribute("aria-hidden", "true");
  expect(backdrop).toHaveAttribute("focusable", "false");
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
