import { z } from "zod";
import { usagePurposes } from "@/modules/rentals/domain/rental_terms";

const trimmedText = (label: string, minimum: number, maximum: number) => z.string()
  .trim()
  .min(minimum, `${label} é obrigatório.`)
  .max(maximum, `${label} deve ter no máximo ${maximum} caracteres.`)
  .transform((value) => value.replace(/\s+/g, " "));

const optionalText = (maximum: number) => z.string().trim().max(maximum, `Use no máximo ${maximum} caracteres.`)
  .transform((value) => value || null);

export const leadSubmissionSchema = z.object({
  vehicleId: z.string().uuid("Selecione um veículo válido."),
  fullName: trimmedText("Nome completo", 3, 120),
  phone: z.string().trim().regex(/^\(?[1-9]{2}\)?\s?(?:9\s?)?\d{4}[-\s]?\d{4}$/, "Informe um telefone brasileiro válido."),
  email: z.string().trim().max(160, "E-mail muito longo.").refine((value) => !value || z.email().safeParse(value).success, "Informe um e-mail válido.").transform((value) => value || null),
  city: trimmedText("Cidade", 2, 100),
  hasDefinitiveLicense: z.enum(["yes", "no"], { error: "Informe se possui CNH definitiva." }).transform((value) => value === "yes"),
  usagePurpose: z.enum(usagePurposes, { error: "Informe a finalidade de uso do veículo." }),
  hasEar: z.enum(["yes", "no", "not_applicable"], { error: "Informe sua situação em relação à EAR." }),
  driverPlatform: optionalText(80),
  preferredContactTime: optionalText(80),
  eligibilityAcknowledgement: z.literal("accepted", { error: "Confirme que compreendeu os requisitos e a análise posterior." }),
  acknowledgement: z.literal("accepted", { error: "Confirme que compreendeu as condições do envio." }),
  website: z.string().max(0, "Envio inválido."),
}).superRefine((value, context) => {
  if (value.usagePurpose === "professional_app" && value.hasEar === "not_applicable") {
    context.addIssue({ code: "custom", path: ["hasEar"], message: "Informe se sua CNH possui EAR para atividade remunerada por aplicativo." });
  }
}).transform((value) => ({
  ...value,
  hasEar: value.hasEar === "not_applicable" ? null : value.hasEar === "yes",
}));

export type LeadSubmission = z.infer<typeof leadSubmissionSchema>;
export type LeadSubmissionInput = z.input<typeof leadSubmissionSchema>;

export function formatLeadValidationErrors(error: z.ZodError) {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    fields[field] ??= [];
    fields[field].push(issue.message);
  }
  return fields;
}
