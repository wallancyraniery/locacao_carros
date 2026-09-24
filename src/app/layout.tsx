import localFont from "next/font/local";
import type { Metadata } from "next";
import "@/styles/globals.css";
import "@/styles/tokens.css";
import "@/styles/foundation.css";

const sans = localFont({ src: "./fonts/geist-latin.woff2", variable: "--font-improve-sans", weight: "100 900", display: "swap" });

export const metadata: Metadata = { title: "Improve | Locação de veículos", description: "Conheça veículos e acesse a Central da sua locadora na Improve." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR" className={sans.variable}><body>{children}</body></html>; }
