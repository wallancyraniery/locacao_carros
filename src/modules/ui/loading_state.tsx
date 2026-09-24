import { ImproveBrand } from "./brand";

export function LoadingState({ label }: { label: string }) {
  return <div className="loading-state">
    <ImproveBrand subtle />
    <p role="status">{label}</p>
    <div className="loading-skeleton" aria-hidden="true"><span /><span /><span /></div>
  </div>;
}
