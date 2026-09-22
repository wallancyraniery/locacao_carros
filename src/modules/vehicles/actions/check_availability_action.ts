"use server";

import { queryAvailability } from "../application/query_availability.server";
import { availabilityRepository } from "../infrastructure/availability_repository.server";
import type { AvailabilityFormState } from "../components/availability_form_state";

export async function checkAvailabilityAction(vehicleId: string, _state: AvailabilityFormState, formData: FormData): Promise<AvailabilityFormState> {
  const pickupDate = String(formData.get("pickupDate") ?? "").slice(0, 10);
  const returnDate = String(formData.get("returnDate") ?? "").slice(0, 10);
  const { status } = await queryAvailability(availabilityRepository, { vehicleId, pickupDate: formData.get("pickupDate"), returnDate: formData.get("returnDate") });
  const messages = {
    available: "Disponível para essas datas",
    unavailable: "Esse veículo não está disponível nesse período.",
    invalid: "Informe datas válidas. A devolução deve ser posterior à retirada.",
    error: "Não foi possível confirmar a disponibilidade agora. Tente novamente em instantes.",
  };
  return { status, pickupDate, returnDate, message: messages[status] };
}
