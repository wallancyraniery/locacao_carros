import { Icon, type IconName } from "./icon";
export function EmptyState({ children, icon = "vehicle" }: { children: React.ReactNode; icon?: IconName }) {
  return <div className="empty-state"><Icon name={icon} /><p>{children}</p></div>;
}
export function VehiclePlaceholder() {
  return <div className="vehicle-placeholder"><Icon name="vehicle" /><span>Sem foto</span></div>;
}
