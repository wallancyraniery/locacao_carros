import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { submitLeadAction } = vi.hoisted(() => ({
  submitLeadAction: vi.fn(async (_state: unknown, formData: FormData): Promise<{
    status: "error";
    message: string;
    values?: Record<string, string>;
    turnstileResetId?: string;
  }> => ({
    status: "error" as const,
    message: "Revise os campos indicados.",
    values: Object.fromEntries(formData.entries()) as Record<string, string>,
  })),
}));

vi.mock("@/modules/leads/actions/submit_lead_action", () => ({ submitLeadAction }));

import { LeadForm } from "@/modules/leads/components/lead_form";

describe("interações do formulário de interesse", () => {
  beforeEach(() => {
    submitLeadAction.mockReset().mockImplementation(async (_state: unknown, formData: FormData) => ({
      status: "error" as const,
      message: "Revise os campos indicados.",
      values: Object.fromEntries(formData.entries()) as Record<string, string>,
    }));
  });

  it("preserva os valores e executa a action somente pelo botão final", async () => {
    const props = {
      vehicleId: "20000000-0000-4000-8000-000000000001",
      vehicleName: "Fiat Uno Vivace — ano a confirmar",
      operationId: "40000000-0000-4000-8000-000000000001",
      turnstileIdempotencyKey: "50000000-0000-4000-8000-000000000001",
      turnstile: { mode: "local" as const },
    };
    const { container, rerender } = render(<LeadForm {...props} />);
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

    rerender(<LeadForm {...props} />);
    expect(screen.getByLabelText("Nome completo")).toHaveValue("Pessoa de Teste");
    expect(screen.getByLabelText("Telefone")).toHaveValue("(12) 99999-9999");
    expect(screen.getByLabelText(/E-mail/)).toHaveValue("pessoa@example.test");
    expect(screen.getByLabelText("Atividade remunerada por aplicativo")).toBeChecked();
    expect(eligibility).toBeChecked();
    expect(acknowledgement).toBeChecked();
    expect(submitLeadAction).not.toHaveBeenCalled();

    fireEvent.click(container.querySelector<HTMLButtonElement>('button[data-intent="submit-interest"]')!);
    await waitFor(() => expect(submitLeadAction).toHaveBeenCalledTimes(1));
    const submitted = submitLeadAction.mock.calls[0][1];
    expect(submitted.get("operationId")).toBe(props.operationId);
    expect(submitted.get("turnstileIdempotencyKey")).toBe(props.turnstileIdempotencyKey);
    expect(submitted.get("turnstileToken")).toBe("synthetic-local-turnstile-token");
    expect(screen.getByLabelText("Nome completo")).toHaveValue("Pessoa de Teste");
    expect(screen.getByLabelText("Telefone")).toHaveValue("(12) 99999-9999");
    expect(screen.getByLabelText(/E-mail/)).toHaveValue("pessoa@example.test");
  });

  it("preserva a operação e renova token e chave de Siteverify após rejeição definitiva", async () => {
    const renderWidget = vi.fn().mockReturnValue("widget-1");
    const resetWidget = vi.fn();
    const removeWidget = vi.fn();
    Object.assign(window, { turnstile: { render: renderWidget, reset: resetWidget, remove: removeWidget } });
    submitLeadAction.mockResolvedValueOnce({
      status: "error",
      message: "Não foi possível validar a proteção contra abuso. Tente novamente.",
      turnstileResetId: "60000000-0000-4000-8000-000000000001",
    });
    const { container, unmount } = render(<LeadForm
      vehicleId="20000000-0000-4000-8000-000000000001"
      vehicleName="Veículo sintético"
      operationId="40000000-0000-4000-8000-000000000002"
      turnstileIdempotencyKey="50000000-0000-4000-8000-000000000002"
      turnstile={{ mode: "cloudflare", siteKey: "site-key-publica" }}
    />);
    expect(renderWidget).toHaveBeenCalledWith(expect.any(HTMLElement), {
      sitekey: "site-key-publica",
      action: "submit_lead",
      responseField: true,
      responseFieldName: "turnstileToken",
      refreshExpired: "auto",
      refreshTimeout: "auto",
      callback: expect.any(Function),
    });
    const widgetOptions = renderWidget.mock.calls[0][1];
    const initialValidationKey = container.querySelector<HTMLInputElement>('input[name="turnstileIdempotencyKey"]')?.value;
    expect(initialValidationKey).toBe("50000000-0000-4000-8000-000000000002");
    fireEvent.click(container.querySelector<HTMLButtonElement>('button[data-intent="submit-interest"]')!);
    await waitFor(() => expect(resetWidget).toHaveBeenCalledWith("widget-1"));
    expect(container.querySelector<HTMLInputElement>('input[name="operationId"]')?.value).toBe("40000000-0000-4000-8000-000000000002");
    widgetOptions.callback();
    await waitFor(() => expect(container.querySelector<HTMLInputElement>('input[name="turnstileIdempotencyKey"]')?.value).not.toBe(initialValidationKey));
    expect(container.innerHTML).not.toContain("TURNSTILE_SECRET_KEY");
    unmount();
    expect(removeWidget).toHaveBeenCalledWith("widget-1");
    Reflect.deleteProperty(window, "turnstile");
  });
});
