import "server-only";

// Digits only, including country code. Configuration is never taken from FormData.
export function getWhatsAppContinuationUrl(): string | undefined {
  const number = process.env.WHATSAPP_BUSINESS_NUMBER?.trim();
  if (!number || !/^[1-9]\d{7,14}$/.test(number)) return undefined;
  const url = new URL(`https://wa.me/${number}`);
  url.searchParams.set("text", "Olá! Gostaria de conversar sobre locação de um veículo.");
  return url.href;
}
