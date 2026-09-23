import { z } from "zod";

const text = (max: number) => z.string().trim().min(2).max(max).refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
// Kept equivalent to the controlled SQL boundary; no arbitrary URI schemes or credentials.
const privacyChannel = /^(https:\/\/[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(\/[A-Za-z0-9._~:/?#\[\]@!$&()*+,;=%-]*)?|mailto:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})$/;
export const organizationInputSchema = z.object({
  operationId: z.uuid(), name: text(120), slug: z.string().min(3).max(63).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  city: text(100), dataController: text(160), privacyChannelLabel: text(80),
  privacyChannelUrl: z.string().trim().max(500).regex(privacyChannel),
});
export const signupSchema = z.object({
  email: z.email().max(254), password: z.string().min(12).max(128), confirmPassword: z.string(),
}).refine(({ password, confirmPassword }) => password === confirmPassword);
