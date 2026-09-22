// Display a validated civil date without constructing an instant or applying a timezone.
export function formatCivilDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}
