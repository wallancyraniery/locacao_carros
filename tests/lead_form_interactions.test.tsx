import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { submitLeadAction } = vi.hoisted(() => ({
  submitLeadAction: vi.fn(async (_state: unknown, formData: FormData) => ({
    status: "error" as const,
    message: "Revise os campos indicados.",
    values: Object.fromEntries(formData.entries()),
  })),
}));

vi.mock("@/modules/leads/actions/submit_lead_action", () => ({ submitLeadAction }));

import { LeadForm } from "@/modules/leads/components/lead_form";

describe("interações do formulário de interesse", () => {
  it("preserva os valores e executa a action somente pelo botão final", async () => {
    const { container, rerender } = render(<LeadForm vehicleId="20000000-0000-4000-8000-000000000001" vehicleName="Fiat Uno Vivace — ano a confirmar" />);
    const form = container.querySelector("form");
    expect(form).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: "Pessoa de Teste" } });
    fireEvent.change(screen.getByLabelText("Telefone"), { target: { value: "(12) 99999-9999" } });
    fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: "pessoa@example.test" } });
    fireEvent.click(screen.getByLabelText("Atividade remunerada por aplicativo"));
    fireEvent.click(screen.getByLabelText("Sim", { selector: 'input[name="hasDefinitiveLicense"]' }));
    fireEvent.click(screen.getByLabelText("Sim", { selector: 'input[name="hasEar"]' }));
    fireEvent.change(screen.getByLabelText(/Melhor período/), { target: { value: "Tarde" } });

    const eligibility = screen.getByLabelText(/Declaro que compreendi/);
    const acknowledgement = screen.getByLabelText(/Estou ciente/);
    fireEvent.click(eligibility);
    fireEvent.click(eligibility);
    fireEvent.click(eligibility);
    fireEvent.click(acknowledgement);
    fireEvent.click(acknowledgement);
    fireEvent.click(acknowledgement);

    fireEvent.submit(form!);
    expect(submitLeadAction).not.toHaveBeenCalled();

    rerender(<LeadForm vehicleId="20000000-0000-4000-8000-000000000001" vehicleName="Fiat Uno Vivace — ano a confirmar" />);
    expect(screen.getByLabelText("Nome completo")).toHaveValue("Pessoa de Teste");
    expect(screen.getByLabelText("Telefone")).toHaveValue("(12) 99999-9999");
    expect(screen.getByLabelText(/E-mail/)).toHaveValue("pessoa@example.test");
    expect(screen.getByLabelText("Atividade remunerada por aplicativo")).toBeChecked();
    expect(eligibility).toBeChecked();
    expect(acknowledgement).toBeChecked();
    expect(submitLeadAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Enviar interesse" }));
    await waitFor(() => expect(submitLeadAction).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Nome completo")).toHaveValue("Pessoa de Teste");
    expect(screen.getByLabelText("Telefone")).toHaveValue("(12) 99999-9999");
    expect(screen.getByLabelText(/E-mail/)).toHaveValue("pessoa@example.test");
  });
});
