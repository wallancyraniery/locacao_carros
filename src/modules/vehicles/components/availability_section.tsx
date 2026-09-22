"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { checkAvailabilityAction } from "../actions/check_availability_action";
import type { AvailabilityFormState } from "./availability_form_state";

const initialState: AvailabilityFormState = { status: "idle" };

export function AvailabilitySection({ vehicleId, initialPickupDate = "", initialReturnDate = "" }: {
  vehicleId: string; initialPickupDate?: string; initialReturnDate?: string;
}) {
  const [pickupDate, setPickupDate] = useState(initialPickupDate);
  const [returnDate, setReturnDate] = useState(initialReturnDate);
  const [state, action, pending] = useActionState(checkAvailabilityAction.bind(null, vehicleId), initialState);
  const currentResult = !pending && state.pickupDate === pickupDate && state.returnDate === returnDate;
  const invalid = currentResult && state.status === "invalid";
  return <section className="availability-section" id="disponibilidade" aria-labelledby="availability-heading">
    <p className="eyebrow">Planeje sua locação</p>
    <h2 id="availability-heading">Qual período você precisa?</h2>
    <p className="field-help" id="period-help">Escolha a retirada e a devolução para consultar a disponibilidade. A consulta não confirma uma reserva.</p>
    <form action={action} noValidate aria-busy={pending}>
      <fieldset disabled={pending}>
        <legend className="sr-only">Período desejado</legend>
        <div className="form-grid">
          <div className="form-field"><label htmlFor="pickupDate">Data de retirada</label><input type="date" id="pickupDate" name="pickupDate" value={pickupDate} onChange={(event) => setPickupDate(event.target.value)} required aria-invalid={invalid} aria-describedby={invalid ? "period-help availability-feedback" : "period-help"} /></div>
          <div className="form-field"><label htmlFor="returnDate">Data de devolução</label><input type="date" id="returnDate" name="returnDate" value={returnDate} onChange={(event) => setReturnDate(event.target.value)} required aria-invalid={invalid} aria-describedby={invalid ? "period-help availability-feedback" : "period-help"} /></div>
        </div>
        <button type="submit" className="button secondary">{pending ? "Consultando disponibilidade..." : "Ver disponibilidade"}</button>
      </fieldset>
    </form>
    <div id="availability-feedback" role="status" aria-live="polite" aria-atomic="true">
      {pending ? <p>Consultando disponibilidade...</p> : currentResult && state.message ? <div className={`availability-feedback ${state.status === "available" ? "is-available" : ""}`}>
        <p>{state.message}</p>
        {state.status === "available" && <>
          <p className="field-help">No próximo passo, revise o período e informe seus dados. A locadora ainda fará a análise.</p>
          <Link className="button primary" href={`/reserva?${new URLSearchParams({ vehicle: vehicleId, pickupDate, returnDate })}`} prefetch={false}>Continuar solicitação</Link>
        </>}
      </div> : null}
    </div>
  </section>;
}
