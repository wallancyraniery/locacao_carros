import { cleanup, act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvailabilitySection } from "@/modules/vehicles/components/availability_section";
import { ReservationRequestForm } from "@/modules/reservations/components/reservation_request_form";
import type { AvailabilityFormState } from "@/modules/vehicles/components/availability_form_state";
import type { ReservationFormState } from "@/modules/reservations/components/reservation_form_state";

const check = vi.hoisted(() => vi.fn());
vi.mock("@/modules/vehicles/actions/check_availability_action", () => ({ checkAvailabilityAction: check }));
afterEach(cleanup);
const vehicleId = "20000000-0000-4000-8000-000000000001";
const dates = { pickupDate: "2028-05-10", returnDate: "2028-05-15" };
beforeEach(() => { check.mockReset(); });

describe("seleção acessível de datas", () => {
  it("exibe loading, libera continuação e invalida feedback ao editar datas", async () => {
    let resolve!: (state: AvailabilityFormState) => void;
    check.mockImplementation(() => new Promise((done) => { resolve = done; }));
    render(<AvailabilitySection vehicleId={vehicleId} initialPickupDate={dates.pickupDate} initialReturnDate={dates.returnDate} />);
    expect(screen.getByLabelText("Data de retirada")).toHaveAttribute("type", "date");
    fireEvent.click(screen.getByRole("button", { name: "Ver disponibilidade" }));
    await screen.findByRole("button", { name: "Consultando disponibilidade..." });
    expect(screen.getByLabelText("Data de retirada")).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Continuar solicitação" })).toBeNull();
    await act(async () => resolve({ status: "available", message: "Disponível para essas datas", ...dates }));
    expect(await screen.findByRole("link", { name: "Continuar solicitação" })).toHaveAttribute("href", `/reserva?vehicle=${vehicleId}&pickupDate=${dates.pickupDate}&returnDate=${dates.returnDate}`);
    fireEvent.change(screen.getByLabelText("Data de devolução"), { target: { value: "2028-05-20" } });
    expect(screen.queryByRole("link", { name: "Continuar solicitação" })).toBeNull();
  });
  it("erro técnico remove uma continuidade liberada anteriormente", async () => {
    check.mockResolvedValueOnce({ status: "available", message: "Disponível para essas datas", ...dates });
    render(<AvailabilitySection vehicleId={vehicleId} initialPickupDate={dates.pickupDate} initialReturnDate={dates.returnDate} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver disponibilidade" }));
    expect(await screen.findByRole("link", { name: "Continuar solicitação" })).toBeInTheDocument();
    const message = "Não foi possível confirmar a disponibilidade agora. Tente novamente em instantes.";
    check.mockResolvedValueOnce({ status: "error", message, ...dates });
    fireEvent.click(screen.getByRole("button", { name: "Ver disponibilidade" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Continuar solicitação" })).toBeNull();
    expect(screen.getByLabelText("Data de retirada")).toHaveValue(dates.pickupDate);
    expect(screen.getByLabelText("Data de devolução")).toHaveValue(dates.returnDate);
  });
  it.each(["unavailable", "invalid", "error"] as const)("feedback %s não permite continuar", async (status) => {
    check.mockResolvedValue({ status, message: "Escolha outras datas.", ...dates });
    render(<AvailabilitySection vehicleId={vehicleId} initialPickupDate={dates.pickupDate} initialReturnDate={dates.returnDate} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver disponibilidade" }));
    expect(await screen.findByText("Escolha outras datas.")).toBeInTheDocument();
    expect(screen.getByLabelText("Data de retirada")).toHaveValue(dates.pickupDate);
    expect(screen.queryByRole("link", { name: "Continuar solicitação" })).toBeNull();
  });
});

const props = { changeDatesHref: `/veiculos/${vehicleId}?pickupDate=${dates.pickupDate}&returnDate=${dates.returnDate}#disponibilidade`, turnstileIdempotencyKey: crypto.randomUUID(), turnstile: { mode: "local" as const } };

describe("formulário de solicitação", () => {
  it("envia somente pelo submit e mostra loading e confirmação sem promessa de aprovação", async () => {
    let resolve!: (state: ReservationFormState) => void;
    const action = vi.fn(() => new Promise<ReservationFormState>((done) => { resolve = done; }));
    render(<ReservationRequestForm {...props} action={action} />);
    fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: "Pessoa Sintética" } });
    expect(action).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Solicitar reserva" }));
    expect(await screen.findByRole("button", { name: "Enviando solicitação..." })).toBeDisabled();
    await act(async () => resolve({ status: "success", message: "A locadora fará a análise. O envio não é aprovação; o período não está confirmado até aprovação." }));
    expect(await screen.findByRole("heading", { name: "Solicitação recebida" })).toBeInTheDocument();
    expect(screen.getByText(/O envio não é aprovação/)).toBeInTheDocument();
    expect(screen.queryByText(/Reserva confirmada/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Solicitar reserva" })).toBeNull();
  });
  it.each(["unavailable", "conflict", "error"] as const)("preserva dados após %s e oferece recuperação apropriada", async (status) => {
    const action = vi.fn(async (_state: ReservationFormState, form: FormData): Promise<ReservationFormState> => ({ status, message: "Mensagem segura", values: { fullName: String(form.get("fullName")), ...dates } }));
    render(<ReservationRequestForm {...props} action={action} />);
    fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: "Pessoa Sintética" } });
    fireEvent.click(screen.getByRole("button", { name: "Solicitar reserva" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Nome completo")).toHaveValue("Pessoa Sintética");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
    if (status === "unavailable") expect(screen.getByRole("link", { name: "Escolher novas datas" })).toHaveAttribute("href", props.changeDatesHref);
    if (status === "error") await waitFor(() => expect(screen.getByRole("button", { name: "Solicitar reserva" })).toBeEnabled());
    else expect(screen.getByRole("button", { name: "Solicitar reserva" })).toBeDisabled();
  });
});
