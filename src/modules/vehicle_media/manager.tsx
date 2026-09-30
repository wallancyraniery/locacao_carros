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
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const operation = useRef<string | null>(null);
  const ready = images.filter((image) => image.status === "ready");
  async function run(action: () => Promise<MediaActionResult>) {
    setBusy(true); setMessage(null);
    try { const result = await action(); setMessage(result.status === "success" ? { kind: "success", text: "Fotos atualizadas." } : { kind: "error", text: result.message }); }
    catch { setMessage({ kind: "error", text: "Não foi possível concluir. Tente novamente." }); }
    finally { setBusy(false); router.refresh(); }
  }
  async function upload(): Promise<MediaActionResult> {
    if (!file || !imageUploadInputSchema.safeParse({ mimeType: file.type, byteSize: file.size }).success) return { status: "error", message: "Escolha uma foto JPEG, PNG ou WebP de até 5 MB." };
    operation.current ??= crypto.randomUUID();
    const prepared = await prepareVehicleMedia(vehicleId, operation.current, { mimeType: file.type, byteSize: file.size });
    if (prepared.status === "error") return prepared;
    if (prepared.status === "prepared") {
      const body = new FormData(); body.append("cacheControl", "0"); body.append("", file);
      try { await fetch(prepared.uploadUrl, { method: "PUT", headers: { apikey: prepared.publishableKey, "x-upsert": "false" }, body }); }
      catch { /* A response can be lost after Storage accepted the object. */ }
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
  return <section className="vehicle-media-panel" aria-label="Fotos do veículo">
    <header className="vehicle-media-heading"><div><p className="eyebrow">Galeria do veículo</p><h2>Fotos</h2><p>Até 8 fotos JPEG, PNG ou WebP de até 5 MB. A primeira foto é a capa.</p></div><span className="status-badge">{ready.length}/8 prontas</span></header>
    <div className="vehicle-media-upload">
      <div className="vehicle-media-file"><label htmlFor="vehicle-photo">Adicionar foto</label><input id="vehicle-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] ?? null); operation.current = null; }} /><span className="caption" aria-live="polite">{file ? file.name : "Nenhum arquivo escolhido"}</span></div>
      <button type="button" className="button primary" disabled={busy || !file} onClick={() => void run(upload)}>{busy ? "Processando…" : "Enviar foto"}</button>
    </div>
    {busy ? <p className="vehicle-media-message is-processing" role="status">Processando foto…</p> : message && <p className={`vehicle-media-message is-${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>{message.text}</p>}
    {images.length === 0 ? <p className="empty-state">Sem fotos ainda. Escolha uma imagem para criar a galeria.</p> : <ol className="vehicle-media-manager">
      {images.map((image) => { const label = image.status === "ready" ? image.position === 0 ? "Capa" : `Foto ${(image.position ?? 0) + 1}` : image.status === "deleting" ? "Remoção pendente" : "Envio pendente"; return <li key={image.id} className={`vehicle-media-card is-${image.status}`}>
        <div className="vehicle-media-thumb">{image.url ? <Image src={image.url} alt={image.position === 0 ? "Capa do veículo" : "Foto do veículo"} width={240} height={160} unoptimized /> : <span aria-hidden="true">Foto</span>}</div>
        <div className="vehicle-media-details"><span className={`status-badge ${image.status === "ready" ? "is-positive" : ""}`}>{label}</span><p className="caption">{image.status === "prepared" ? "O envio pode ser concluído após o upload." : image.status === "deleting" ? "A foto não aparece na vitrine e a remoção pode ser repetida." : image.position === 0 ? "Esta imagem aparece primeiro na vitrine." : "Use as ações para mudar a ordem."}</p>
          <div className="vehicle-media-actions">{image.status === "ready" && image.position !== 0 && <><button type="button" className="button secondary" disabled={busy} onClick={() => void run(() => move(image.id, true))}>Definir como capa</button><button type="button" className="button secondary" disabled={busy} onClick={() => void run(() => move(image.id, false))}>Mover para antes</button></>}{image.status === "prepared" && <button type="button" className="button secondary" disabled={busy} onClick={() => void run(() => finalizeVehicleMedia(vehicleId, image.id))}>Concluir envio</button>}<button type="button" className="button vehicle-media-delete" disabled={busy} onClick={() => void run(() => deleteVehicleMedia(vehicleId, image.id))}>{image.status === "deleting" ? "Tentar remoção novamente" : "Remover foto"}</button></div>
        </div>
      </li>; })}
    </ol>}
  </section>;
}
