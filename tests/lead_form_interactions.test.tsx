import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { submitLeadAction } = vi.hoisted(() => ({
  submitLeadAction: vi.fn(async (_state: unknown, formData: FormData): Promise<{
    status: "error" | "success";
    whatsappUrl?: string;
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

afterEach(() => { cleanup(); Reflect.deleteProperty(window, "turnstile"); vi.restoreAllMocks(); });

beforeEach(() => {
  submitLeadAction.mockReset().mockImplementation(async (_state: unknown, formData: FormData) => ({
    status: "error" as const,
    message: "Revise os campos indicados.",
    values: Object.fromEntries(formData.entries()) as Record<string, string>,
  }));
});

describe("interações do formulário de interesse", () => {
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

  it("controla token, readiness, FormData e renovação após rejeição", async () => {
    const logs = ["log", "warn", "error", "info", "debug"].map((method) =>
      vi.spyOn(console, method as "log").mockImplementation(() => {}));
    const renderWidget = vi.fn().mockReturnValue("widget-1");
    const resetWidget = vi.fn(() => {
      expect(document.querySelector('input[name="turnstileToken"]')).toHaveValue("");
    });
    const removeWidget = vi.fn();
    Object.assign(window, { turnstile: { render: renderWidget, reset: resetWidget, remove: removeWidget } });
    submitLeadAction
      .mockResolvedValueOnce({ status: "error", message: "Proteção recusada", turnstileResetId: "reset-1" })
      .mockResolvedValueOnce({ status: "error", message: "Revise outro campo" });
    const props = {
      vehicleId: "20000000-0000-4000-8000-000000000001", vehicleName: "Veículo sintético",
      operationId: "40000000-0000-4000-8000-000000000002",
      turnstileIdempotencyKey: "50000000-0000-4000-8000-000000000002",
      turnstile: { mode: "cloudflare" as const, siteKey: "site-key-publica" },
    };
    const { container, rerender, unmount } = render(<LeadForm {...props} />);
    expect(renderWidget).toHaveBeenCalledExactlyOnceWith(expect.any(HTMLElement), {
      sitekey: "site-key-publica", size: "compact", action: "submit_lead", "response-field": false,
      "refresh-expired": "auto", "refresh-timeout": "auto",
      callback: expect.any(Function), "expired-callback": expect.any(Function),
      "error-callback": expect.any(Function), "timeout-callback": expect.any(Function),
    });
    const options = renderWidget.mock.calls[0][1];
    const button = screen.getByRole("button", { name: "Enviar interesse" });
    const tokenInput = container.querySelector<HTMLInputElement>('input[name="turnstileToken"]')!;
    const keyInput = container.querySelector<HTMLInputElement>('input[name="turnstileIdempotencyKey"]')!;
    expect(container.querySelectorAll('input[name="turnstileToken"]')).toHaveLength(1);
    expect(tokenInput).toHaveValue("");
    expect(button).toBeDisabled();
    fireEvent.click(button);
    fireEvent.submit(container.querySelector("form")!);
    expect(submitLeadAction).not.toHaveBeenCalled();
    act(() => options.callback("synthetic-token-first"));
    expect(tokenInput).toHaveValue("synthetic-token-first");
    expect(button).toBeEnabled();
    const firstKey = keyInput.value;
    expect(firstKey).not.toBe(props.turnstileIdempotencyKey);
    act(() => options.callback("synthetic-token-first"));
    expect(keyInput).toHaveValue(firstKey);
    rerender(<LeadForm {...props} turnstile={{ ...props.turnstile }} />);
    expect(renderWidget).toHaveBeenCalledTimes(1);
    fireEvent.click(button);
    await screen.findByText("Proteção recusada");
    expect(submitLeadAction.mock.calls[0][1].get("turnstileToken")).toBe("synthetic-token-first");
    expect(submitLeadAction.mock.calls[0][1].get("turnstileIdempotencyKey")).toBe(firstKey);
    await waitFor(() => expect(resetWidget).toHaveBeenCalledExactlyOnceWith("widget-1"));
    expect(tokenInput).toHaveValue("");
    expect(button).toBeDisabled();
    act(() => options.callback("synthetic-token-first"));
    expect(tokenInput).toHaveValue("");
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(submitLeadAction).toHaveBeenCalledTimes(1);
    act(() => options.callback("synthetic-token-second"));
    expect(tokenInput).toHaveValue("synthetic-token-second");
    expect(button).toBeEnabled();
    expect(keyInput.value).not.toBe(firstKey);
    fireEvent.click(button);
    await waitFor(() => expect(submitLeadAction).toHaveBeenCalledTimes(2));
    expect(submitLeadAction.mock.calls[1][1].get("turnstileToken")).toBe("synthetic-token-second");
    expect(submitLeadAction.mock.calls[1][1].get("operationId")).toBe(props.operationId);
    await screen.findByText("Revise outro campo");
    await waitFor(() => expect(button).toBeEnabled());
    expect(tokenInput).toHaveValue("synthetic-token-second");
    expect(resetWidget).toHaveBeenCalledTimes(1);
    for (const log of logs) expect(JSON.stringify(log.mock.calls)).not.toMatch(/synthetic-token-(first|second)/);
    unmount();
    expect(removeWidget).toHaveBeenCalledWith("widget-1");
  });

  it.each(["expired-callback", "error-callback", "timeout-callback"])("%s limpa o token e bloqueia envio até novo callback", async (event) => {
    const renderWidget = vi.fn().mockReturnValue("widget-1");
    Object.assign(window, { turnstile: { render: renderWidget, reset: vi.fn(), remove: vi.fn() } });
    const logs = ["log", "warn", "error", "info", "debug"].map((method) => vi.spyOn(console, method as "log").mockImplementation(() => {}));
    const { container } = render(<LeadForm vehicleId="20000000-0000-4000-8000-000000000001" vehicleName="Sintético"
      operationId="40000000-0000-4000-8000-000000000001" turnstileIdempotencyKey="50000000-0000-4000-8000-000000000001"
      turnstile={{ mode: "cloudflare", siteKey: "public-site" }} />);
    const options = renderWidget.mock.calls[0][1];
    const button = screen.getByRole("button", { name: "Enviar interesse" });
    const tokenInput = container.querySelector('input[name="turnstileToken"]');
    const keyInput = container.querySelector<HTMLInputElement>('input[name="turnstileIdempotencyKey"]')!;
    act(() => options.callback("synthetic-old-token"));
    const oldKey = keyInput.value;
    expect(button).toBeEnabled();
    act(() => options[event]());
    expect(tokenInput).toHaveValue("");
    expect(button).toBeDisabled();
    expect(new FormData(container.querySelector("form")!).get("turnstileToken")).toBe("");
    act(() => options.callback("synthetic-old-token"));
    fireEvent.click(button);
    expect(submitLeadAction).not.toHaveBeenCalled();
    act(() => options.callback("synthetic-new-token"));
    expect(button).toBeEnabled();
    expect(tokenInput).toHaveValue("synthetic-new-token");
    expect(keyInput.value).not.toBe(oldKey);
    fireEvent.click(button);
    await waitFor(() => expect(submitLeadAction).toHaveBeenCalledTimes(1));
    expect(submitLeadAction.mock.calls[0][1].get("turnstileToken")).toBe("synthetic-new-token");
    for (const log of logs) expect(JSON.stringify(log.mock.calls)).not.toMatch(/synthetic-(old|new)-token/);
  });

  it("mantém botão indisponível durante a Server Action mesmo com token", async () => {
    let finish!: (value: { status: "error"; message: string }) => void;
    submitLeadAction.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const renderWidget = vi.fn().mockReturnValue("widget-1");
    Object.assign(window, { turnstile: { render: renderWidget, reset: vi.fn(), remove: vi.fn() } });
    render(<LeadForm vehicleId="20000000-0000-4000-8000-000000000001" vehicleName="Sintético"
      operationId="40000000-0000-4000-8000-000000000001" turnstileIdempotencyKey="50000000-0000-4000-8000-000000000001"
      turnstile={{ mode: "cloudflare", siteKey: "public-site" }} />);
    act(() => renderWidget.mock.calls[0][1].callback("synthetic-pending-token"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar interesse" }));
    expect(await screen.findByRole("button", { name: "Enviando..." })).toBeDisabled();
    await act(async () => { finish({ status: "error", message: "Erro técnico sintético" }); });
  });
});

 it.each([
   { status: "error" as const, message: "Falha sintética" },
   { status: "success" as const, message: "Sucesso" },
   { status: "success" as const, message: "Sucesso", whatsappUrl: "https://wa.me/5511999990000?text=Mensagem%20gen%C3%A9rica" },
 ])("exibe continuidade somente no sucesso com URL retornada pelo servidor: %o", async (result) => {
   submitLeadAction.mockResolvedValueOnce(result);
   const { container } = render(<LeadForm vehicleId="20000000-0000-4000-8000-000000000003"
     vehicleName="Veículo sintético" operationId="40000000-0000-4000-8000-000000000001"
     turnstileIdempotencyKey="50000000-0000-4000-8000-000000000001" turnstile={{ mode: "local" }} />);
   expect(screen.queryByRole("link", { name: /Continuar pelo WhatsApp/ })).toBeNull();
   fireEvent.click(container.querySelector<HTMLButtonElement>('button[data-intent="submit-interest"]')!);
   await screen.findByText(result.message);
   const link = result.whatsappUrl
     ? await screen.findByRole("link", { name: /Continuar pelo WhatsApp/ })
     : screen.queryByRole("link", { name: /Continuar pelo WhatsApp/ });
   if (result.whatsappUrl) {
     expect(link).toHaveAttribute("href", result.whatsappUrl);
     expect(link).toHaveAttribute("rel", "noopener noreferrer");
     expect(screen.getByText(/Você decide se deseja enviar/)).toBeInTheDocument();
   } else expect(link).toBeNull();
 });

it("usa rótulo de retorno específico para storefront sem mudar o destino", async () => {
  submitLeadAction.mockResolvedValueOnce({ status: "success", message: "Sucesso" });
  const { container } = render(<LeadForm vehicleId="20000000-0000-4000-8000-000000000003" vehicleName="Veículo sintético" operationId="40000000-0000-4000-8000-000000000001" turnstileIdempotencyKey="50000000-0000-4000-8000-000000000001" turnstile={{ mode: "local" }} returnHref="/locadoras/tenant/veiculos/vehicle" returnLabel="Voltar ao veículo" />);
  fireEvent.click(container.querySelector<HTMLButtonElement>('button[data-intent="submit-interest"]')!);
  expect(await screen.findByRole("link", { name: "Voltar ao veículo" })).toHaveAttribute("href", "/locadoras/tenant/veiculos/vehicle");
});

it.each([
  ["11987654321", "(11) 98765-4321"],
  ["1134567890", "(11) 3456-7890"],
  ["119876543210", "119876543210"],
])("formata telefone no blur e preserva após erro: %s", async (input, expected) => {
  submitLeadAction.mockImplementationOnce(async (_state, data) => ({ status: "error", message: "Erro sintético do telefone", values: Object.fromEntries(data.entries()) as Record<string, string> }));
  const props = { vehicleId: "20000000-0000-4000-8000-000000000003", vehicleName: "Veículo sintético", operationId: "40000000-0000-4000-8000-000000000001", turnstileIdempotencyKey: "50000000-0000-4000-8000-000000000001", turnstile: { mode: "local" as const } };
  const { container, rerender } = render(<LeadForm {...props} />);
  const phone = screen.getByLabelText("Telefone");
  expect(phone).toHaveAttribute("type", "tel");
  expect(phone).toHaveAttribute("inputmode", "tel");
  fireEvent.change(phone, { target: { value: input } });
  expect(phone).toHaveValue(input);
  fireEvent.blur(phone);
  expect(phone).toHaveValue(expected);
  fireEvent.click(container.querySelector<HTMLButtonElement>('button[data-intent="submit-interest"]')!);
  await screen.findByText("Erro sintético do telefone");
  expect(submitLeadAction.mock.lastCall?.[1].get("phone")).toBe(expected);
  rerender(<LeadForm {...props} />);
  expect(screen.getByLabelText("Telefone")).toHaveValue(expected);
});
