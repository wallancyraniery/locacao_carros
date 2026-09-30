"use client";
import Image from "next/image";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { prepareVehicleMedia, finalizeVehicleMedia, deleteVehicleMedia, reorderVehicleMedia } from "./actions";
import { imageUploadInputSchema } from "./validation";
import type { MediaActionResult, VehicleImageStatus } from "./contracts";

type Item = { id: string; status: VehicleImageStatus; position: number | null; url: string | null };
export function VehicleMediaManager({ vehicleId, images }: { vehicleId: string; images: Item[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const operation = useRef<string | null>(null);
  const ready = images.filter((image) => image.status === "ready");
  async function run(action: () => Promise<MediaActionResult>) {
    setBusy(true); setMessage("");
    try { const result = await action(); setMessage(result.status === "success" ? "Fotos atualizadas." : result.message); }
    catch { setMessage("Não foi possível concluir. Tente novamente."); }
    finally { setBusy(false); router.refresh(); }
  }
  async function upload(): Promise<MediaActionResult> {
    if (!file || !imageUploadInputSchema.safeParse({ mimeType: file.type, byteSize: file.size }).success) {
      return { status: "error", message: "Escolha uma foto JPEG, PNG ou WebP de até 5 MB." };
    }
    operation.current ??= crypto.randomUUID();
    const prepared = await prepareVehicleMedia(vehicleId, operation.current, { mimeType: file.type, byteSize: file.size });
    if (prepared.status === "error") return prepared;
    if (prepared.status === "prepared") {
      const body = new FormData(); body.append("cacheControl", "0"); body.append("", file);
      // Direct browser → Storage. Never upsert. A lost response can be retried by
      // finalizing the existing object; only the decoder can mark it ready.
      try { await fetch(prepared.uploadUrl, { method: "PUT", headers: { apikey: prepared.publishableKey, "x-upsert": "false" }, body }); }
      catch { /* Try finalize: upload may have completed before a lost response. */ }
    }
    const result = await finalizeVehicleMedia(vehicleId, prepared.imageId);
    if (result.status === "success") { operation.current = null; setFile(null); }
    return result;
  }
  function move(id: string, first: boolean) {
    const ids = ready.map((image) => image.id); const index = ids.indexOf(id);
    ids.splice(index, 1); ids.splice(first ? 0 : Math.max(0, index - 1), 0, id);
    return reorderVehicleMedia(vehicleId, ids);
  }
  return <section aria-label="Fotos do veículo">
    <p>Até 8 fotos JPEG, PNG ou WebP de até 5 MB. A primeira foto é a capa.</p>
    <label htmlFor="vehicle-photo">Adicionar foto</label>
    <input id="vehicle-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => {
      setFile(event.target.files?.[0] ?? null); operation.current = null;
    }} />
    <button type="button" className="button primary" disabled={busy || !file} onClick={() => void run(upload)}>Enviar foto</button>
    <p role="status" aria-live="polite">{busy ? "Processando foto…" : message}</p>
    {images.length === 0 ? <p>Sem foto</p> : <ol className="vehicle-media-manager">
      {images.map((image) => <li key={image.id}>
        {image.url && <Image src={image.url} alt={image.position === 0 ? "Capa do veículo" : "Foto do veículo"} width={240} height={160} unoptimized />}
        <p>{image.status === "ready" ? image.position === 0 ? "Capa" : `Foto ${(image.position ?? 0) + 1}` : image.status === "deleting" ? "Remoção pendente" : "Envio pendente"}</p>
        {image.status === "ready" && image.position !== 0 && <>
          <button type="button" disabled={busy} onClick={() => void run(() => move(image.id, true))}>Definir como capa</button>
          <button type="button" disabled={busy} onClick={() => void run(() => move(image.id, false))}>Mover para antes</button>
        </>}
        {image.status === "prepared" && <button type="button" disabled={busy} onClick={() => void run(() => finalizeVehicleMedia(vehicleId, image.id))}>Concluir envio</button>}
        <button type="button" disabled={busy} onClick={() => void run(() => deleteVehicleMedia(vehicleId, image.id))}>{image.status === "deleting" ? "Tentar remoção novamente" : "Remover foto"}</button>
      </li>)}
    </ol>}
  </section>;
}
