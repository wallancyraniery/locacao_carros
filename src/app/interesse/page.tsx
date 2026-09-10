import { notFound } from "next/navigation";
import Link from "next/link";
import { LeadForm } from "@/modules/leads/components/lead_form";
import { loadCatalogVehicle } from "@/modules/vehicles/infrastructure/catalog_availability.server";
import { formatRentalMoney, rentalTerms } from "@/modules/rentals/domain/rental_terms";
import { randomUUID } from "node:crypto";
import { getTurnstileWidgetConfiguration } from "@/config/turnstile_environment.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function InterestPage({ searchParams }: { searchParams: Promise<{ vehicle?: string }> }) {
  const { vehicle: vehicleId } = await searchParams;
  const vehicle = vehicleId ? await loadCatalogVehicle(vehicleId) : undefined;
  if (!vehicle) notFound();
  if (!vehicle.acceptsInterest) return <main className="interest-page"><Link href="/#veiculos" className="back-link">← Voltar aos veículos</Link><section className="availability-message" aria-labelledby="availability-title"><p className="eyebrow">Manifestação de interesse</p><h1 id="availability-title">Interesse indisponível</h1><p>O {vehicle.model} não está disponível para novas manifestações de interesse neste momento.</p><p>A disponibilidade pode mudar e depende da confirmação da locadora.</p></section></main>;
  return <main className="interest-page"><Link href="/#veiculos" className="back-link">← Voltar aos veículos</Link><div className="interest-layout"><section><p className="eyebrow">Manifestação de interesse</p><h1>Vamos conhecer você</h1><p className="lead-dark">Preencha somente os dados iniciais para que a locadora possa analisar seu interesse.</p><aside className="interest-terms" aria-labelledby="interest-terms-title"><h2 id="interest-terms-title">Condições principais</h2><ul><li>{formatRentalMoney(rentalTerms.weeklyRentalCents)} por semana</li><li>Caução de {formatRentalMoney(rentalTerms.securityDepositCents)}</li><li>Valor inicial de {formatRentalMoney(rentalTerms.initialTotalCents)}</li><li>Pix ou cartão; caução em até {rentalTerms.securityDepositMaxInstallments} vezes sem juros</li><li>Devolução da caução em até {rentalTerms.securityDepositRefundMaxDays} dias após encerramento e vistoria</li></ul></aside><div className="form-warning"><strong>Importante</strong><p>O envio não representa reserva, aprovação ou garantia de disponibilidade.</p></div></section><LeadForm vehicleId={vehicle.id} vehicleName={`${vehicle.model} — ${vehicle.year ?? "ano a confirmar"}`} operationId={randomUUID()} turnstileIdempotencyKey={randomUUID()} turnstile={getTurnstileWidgetConfiguration()} /></div></main>;
}
