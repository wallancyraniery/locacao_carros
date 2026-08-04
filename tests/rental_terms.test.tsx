import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomePage } from "@/modules/marketing/components/home_page";
import { LeadForm } from "@/modules/leads/components/lead_form";
import { calculateInitialTotalCents, rentalTerms } from "@/modules/rentals/domain/rental_terms";

vi.mock("@/modules/leads/actions/submit_lead_action", () => ({ submitLeadAction: vi.fn() }));

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

  it("exibe aluguel, caução, total, pagamento e devolução condicionada", () => {
    render(<HomePage />);
    expect(screen.getAllByText("R$ 700,00").length).toBeGreaterThan(0);
    expect(screen.getByText("R$ 1.000,00")).toBeInTheDocument();
    expect(screen.getByText("R$ 1.700,00")).toBeInTheDocument();
    expect(screen.getByText("Pix ou cartão")).toBeInTheDocument();
    expect(screen.getByText(/até 5 vezes sem juros/)).toBeInTheDocument();
    expect(screen.getByText(/até 30 dias após o encerramento do contrato e a vistoria/)).toBeInTheDocument();
    expect(screen.getByText(/quando não houver danos ou pendências/)).toBeInTheDocument();
  });
});

describe("pré-qualificação pública", () => {
  it("oferece finalidade, CNH definitiva, EAR e ciência da análise posterior", () => {
    render(<LeadForm vehicleId="20000000-0000-4000-8000-000000000001" vehicleName="Veículo sintético" />);
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
