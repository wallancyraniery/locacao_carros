import { notFound } from "next/navigation";
import Link from "next/link";
import { LeadForm } from "@/modules/leads/components/lead_form";
import { loadCatalogVehicle } from "@/modules/vehicles/infrastructure/catalog_availability.server";
import { loadStorefrontInterestPrivacy, loadStorefrontVehicle } from "@/modules/storefront/queries.server";
import { formatRentalMoney, rentalTerms } from "@/modules/rentals/domain/rental_terms";
import { randomUUID } from "node:crypto";
import { getTurnstileWidgetConfiguration } from "@/config/turnstile_environment.server";
import { getPrivacyNoticeConfiguration } from "@/config/privacy_notice_environment.server";
import { PrivacyNotice } from "@/modules/leads/components/privacy_notice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function InterestPage({ searchParams }: { searchParams: Promise<{ vehicle?: string; storefront?: string }> }) {
  const { vehicle: vehicleId, storefront: storefrontSlug } = await searchParams;
  const storefront = storefrontSlug && vehicleId ? await loadStorefrontVehicle(storefrontSlug, vehicleId) : null;
  const vehicle = storefront?.status === "ready" ? storefront.storefront.vehicle : vehicleId && !storefrontSlug ? await loadCatalogVehicle(vehicleId) : undefined;
  if (!vehicle) notFound();
  if ("acceptsInterest" in vehicle && !vehicle.acceptsInterest) return <main className="interest-page"><Link href="/#veiculos" className="back-link">← Voltar aos veículos</Link><section className="availability-message" aria-labelledby="availability-title"><p className="eyebrow">Manifestação de interesse</p><h1 id="availability-title">Interesse indisponível</h1><p>O {vehicle.model} não está disponível para novas manifestações de interesse neste momento.</p><p>A disponibilidade pode mudar e depende da confirmação da locadora.</p></section></main>;
  const isStorefront = storefront?.status === "ready";
  const storefrontPrivacy = isStorefront ? await loadStorefrontInterestPrivacy(storefront.storefront.slug, vehicle.id) : null;
  if (isStorefront && storefrontPrivacy?.status !== "ready") return <main className="interest-page"><section className="availability-message" aria-labelledby="privacy-title"><p className="eyebrow">Manifestação de interesse</p><h1 id="privacy-title">Interesse indisponível</h1><p>Não foi possível abrir este formulário agora. Tente novamente mais tarde.</p></section></main>;
  const privacyNotice = storefrontPrivacy?.status === "ready" ? storefrontPrivacy.configuration : getPrivacyNoticeConfiguration();
  const returnHref = isStorefront ? `/locadoras/${storefront.storefront.slug}/veiculos/${vehicle.id}` : "/#veiculos";
  const returnLabel = isStorefront ? "Voltar ao veículo" : "Voltar aos veículos";
  return <main className="interest-page"><Link href={returnHref} className="back-link">← {returnLabel}</Link><div className="interest-layout"><section><p className="eyebrow">Manifestação de interesse</p><h1>Vamos conhecer você</h1><p className="lead-dark">Preencha somente os dados iniciais para que a locadora possa analisar seu interesse.</p><aside className="interest-terms" aria-labelledby="interest-terms-title"><h2 id="interest-terms-title">Condições principais</h2>{isStorefront ? <ul><li>{formatRentalMoney(storefront.storefront.vehicle.weekly_price_cents)} por semana</li><li>Condições e disponibilidade serão confirmadas pela locadora.</li></ul> : <ul><li>{formatRentalMoney(rentalTerms.weeklyRentalCents)} por semana</li><li>Caução de {formatRentalMoney(rentalTerms.securityDepositCents)}</li><li>Valor inicial de {formatRentalMoney(rentalTerms.initialTotalCents)}</li><li>Pix ou cartão; caução em até {rentalTerms.securityDepositMaxInstallments} vezes sem juros</li><li>Devolução da caução em até {rentalTerms.securityDepositRefundMaxDays} dias após encerramento e vistoria</li></ul>}</aside><div className="form-warning"><strong>Importante</strong><p>O envio não representa reserva, aprovação ou garantia de disponibilidade.</p></div><PrivacyNotice configuration={privacyNotice} /></section><LeadForm vehicleId={vehicle.id} vehicleName={`${"brand" in vehicle ? `${vehicle.brand} ` : ""}${vehicle.model} — ${vehicle.year ?? "ano a confirmar"}`} operationId={randomUUID()} turnstileIdempotencyKey={randomUUID()} turnstile={getTurnstileWidgetConfiguration()} storefrontSlug={isStorefront ? storefront.storefront.slug : undefined} returnHref={returnHref} returnLabel={returnLabel} /></div></main>;
}
