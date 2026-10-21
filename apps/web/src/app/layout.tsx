import type { Metadata } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/sora";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SeekerAi — Sua próxima venda começa aqui.", template: "%s | SeekerAi" },
  description: "Encontre empresas que precisam do que você vende. Identifique oportunidades, prepare abordagens e prospecte com mais contexto usando o SeekerAi.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "SeekerAi — Sua próxima venda começa aqui.",
    description: "Menos busca no escuro. Mais conversas com potencial.",
    locale: "pt_BR",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
        {children}
      </body>
    </html>
  );
}
