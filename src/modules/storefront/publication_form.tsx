"use client";

import { useActionState } from "react";
import { setStorefrontStatus } from "./actions";

export function PublicationForm({ status }: { status: "draft" | "published" }) {
  const [state, action, pending] = useActionState(setStorefrontStatus, {});
  return <form action={action}>
    <input type="hidden" name="status" value={status === "published" ? "draft" : "published"} />
    <button className="button primary" disabled={pending}>{pending ? "Salvando…" : status === "published" ? "Despublicar vitrine" : "Publicar vitrine"}</button>
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}
