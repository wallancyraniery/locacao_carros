const paths = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  vehicle: "M4 10l2-6h12l2 6 M3 10h18v8H3z M6 18v3 M18 18v3 M6 14h2 M16 14h2",
  calendar: "M4 5h16v16H4z M8 2v6 M16 2v6 M4 11h16",
  people: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-3a7 7 0 0 1 14 0v3 M17 4a4 4 0 0 1 0 7 M19 14a6 6 0 0 1 3 5v2",
  building: "M4 21V3h16v18 M2 21h20 M8 7h2 M14 7h2 M8 11h2 M14 11h2 M9 21v-6h6v6",
  pin: "M12 22s8-8 8-14a8 8 0 1 0-16 0c0 6 8 14 8 14 M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name }: { name: IconName }) {
  return <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
