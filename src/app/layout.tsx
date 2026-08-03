import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = { title: "Locação de veículos", description: "Apresentação de veículos para motoristas de aplicativo em São José dos Campos." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body>{children}</body></html>; }
