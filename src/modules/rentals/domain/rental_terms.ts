export const usagePurposes = ["professional_app", "other"] as const;
export type UsagePurpose = (typeof usagePurposes)[number];

export const usagePurposeLabels: Record<UsagePurpose, string> = {
  professional_app: "Atividade remunerada por aplicativo",
  other: "Outro uso",
};

export function calculateInitialTotalCents(weeklyRentalCents: number, securityDepositCents: number) {
  return weeklyRentalCents + securityDepositCents;
}

type RentalTermsData = {
  weeklyRentalCents: number;
  securityDepositCents: number;
  securityDepositMaxInstallments: number;
  securityDepositRefundMaxDays: number;
};

const { weeklyRentalCents, securityDepositCents, securityDepositMaxInstallments, securityDepositRefundMaxDays } = termsData satisfies RentalTermsData;

export const rentalTerms = Object.freeze({
  weeklyRentalCents,
  securityDepositCents,
  initialTotalCents: calculateInitialTotalCents(weeklyRentalCents, securityDepositCents),
  paymentMethods: ["Pix", "cartão"] as const,
  securityDepositMaxInstallments,
  securityDepositRefundMaxDays,
  securityDepositRefundCondition: "A devolução é integral quando não houver danos ou pendências. Eventuais descontos dependem das condições contratuais.",
  eligibilityNotice: "A locadora exige CNH definitiva e, para atividade remunerada por aplicativo, EAR. Não há tempo mínimo de CNH.",
  laterAnalysisNotice: "CPF, comprovante de residência e antecedentes serão analisados somente em uma etapa posterior. Não envie esses documentos neste formulário.",
  decisionNotice: "As respostas são autodeclarações. Disponibilidade, aprovação e condições finais dependem da análise da locadora.",
});

const rentalMoneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatRentalMoney(cents: number) {
  return rentalMoneyFormatter.format(cents / 100);
}
import termsData from "../data/rental_terms.json";
