export function ImproveBrand({ subtle = false }: { subtle?: boolean }) {
  return <span className={subtle ? "improve-brand improve-brand-subtle" : "improve-brand"}>{subtle && <span className="brand-attribution">Plataforma por </span>}<strong>Improve<span aria-hidden="true" className="brand-dot">.</span></strong></span>;
}
