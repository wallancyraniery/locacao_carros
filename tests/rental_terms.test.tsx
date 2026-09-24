import { readFileSync } from "node:fs";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "@/modules/marketing/components/home_page";
import { vehicles } from "@/modules/vehicles/data/vehicles";
import { LeadForm } from "@/modules/leads/components/lead_form";
import { calculateInitialTotalCents, rentalTerms } from "@/modules/rentals/domain/rental_terms";

vi.mock("@/modules/leads/actions/submit_lead_action", () => ({ submitLeadAction: vi.fn() }));
afterEach(cleanup);

describe("condições comerciais", () => {
  it("mantém valores em centavos e calcula o total inicial", () => {
    expect(rentalTerms.weeklyRentalCents).toBe(70_000);
    expect(rentalTerms.securityDepositCents).toBe(100_000);
    expect(rentalTerms.initialTotalCents).toBe(calculateInitialTotalCents(70_000, 100_000));
    expect(rentalTerms.initialTotalCents).toBe(170_000);
  });

  it("limita parcelamento e prazo de devolução", () => {
    expect(rentalTerms.securityDepositMaxInstallments).toBe(5);
    expect(rentalTerms.securityDepositRefundMaxDays).toBe(30);
  });

  it("confina os valores da home aos cards demonstrativos e não anuncia condições universais", () => {
    const { rerender } = render(<HomePage vehicles={vehicles} />);
    const prices = screen.getAllByText("R$ 700,00");
    expect(prices).toHaveLength(vehicles.length);
    expect(screen.getAllByText(/R\$/)).toHaveLength(vehicles.length);
    for (const price of prices) {
      const card = price.closest("article");
      expect(card).not.toBeNull();
      expect(within(card!).getByText("Demonstração")).toBeInTheDocument();
      expect(within(card!).getByText("Valor demonstrativo")).toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { name: "Cada locadora define suas próprias condições." })).toBeInTheDocument();
    expect(screen.getByText(/Não representam uma oferta geral da Improve/)).toBeInTheDocument();
    expect(screen.getByText(/A Improve não estabelece valores ou condições universais/)).toBeInTheDocument();
    expect(screen.queryByText(/R\$\s*(?:1\.000|1\.700),00|Pix ou cartão|até 5 vezes sem juros|até 30 dias|quando não houver danos ou pendências/)).not.toBeInTheDocument();

    rerender(<HomePage vehicles={[]} />);
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
  });
});

describe("pré-qualificação pública", () => {
  it("oferece finalidade, CNH definitiva, EAR e ciência da análise posterior", () => {
    render(<LeadForm vehicleId="20000000-0000-4000-8000-000000000001" vehicleName="Veículo sintético" operationId="40000000-0000-4000-8000-000000000001" turnstileIdempotencyKey="50000000-0000-4000-8000-000000000001" turnstile={{ mode: "local" }} />);
    expect(screen.getByRole("group", { name: "Qual será a finalidade de uso do veículo?" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Possui CNH definitiva?" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Sua CNH possui EAR?" })).toBeInTheDocument();
    expect(screen.getByText(/Não há tempo mínimo de CNH/)).toBeInTheDocument();
    expect(screen.getByText(/Não envie esses documentos neste formulário/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /compreendi os requisitos/ })).toBeInTheDocument();
  });

  it("não cria campos públicos para documentos sensíveis ou antecedentes", () => {
    const source = readFileSync("src/modules/leads/components/lead_form.tsx", "utf8");
    expect(source).not.toMatch(/name=["'](?:cpf|cnhNumber|cnhImage|proofOfAddress|criminalRecords)["']/i);
    expect(source).not.toContain('type="file"');
  });
});
