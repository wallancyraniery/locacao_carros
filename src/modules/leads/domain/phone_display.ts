/** Presentation only: preserve unsupported characters and lengths for server validation. */
export function formatBrazilianPhoneForDisplay(value: string): string {
  const digits = value.replace(/[()\s.-]/g, "");
  if (!/^\d{10,11}$/.test(digits)) return value;
  const split = digits.length - 4;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, split)}-${digits.slice(split)}`;
}
