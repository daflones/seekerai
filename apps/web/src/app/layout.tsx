import type { Metadata } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/sora";
import "./globals.css";
import "./auth-ui.css";
import "./pricing-ui.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://seekerai.digital";
const title = "SeekerAi — Encontre quem precisa do que você vende";
const description =
  "Encontre empresas locais que precisam dos seus serviços. Veja quem não tem site, confira o WhatsApp verificado e receba a mensagem de abordagem pronta. Prospecção com contexto para freelancers e agências.";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: title, template: "%s | SeekerAi" },
  description,
  applicationName: "SeekerAi",
  generator: "SeekerAi",
  referrer: "origin-when-cross-origin",
  keywords: [
    "prospecção de clientes",
    "encontrar clientes",
    "leads locais",
    "freelancer",
    "agência digital",
    "criação de sites",
    "design gráfico",
    "social media",
    "tráfego pago",
    "vendas B2B",
    "empresas sem site",
    "prospecção comercial",
    "mensagem de abordagem",
    "SeekerAi",
  ],
  authors: [{ name: "SeekerAi", url: appUrl }],
  creator: "SeekerAi",
  publisher: "SeekerAi",
  category: "technology",
  formatDetection: { telephone: false },
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  openGraph: {
    title,
    description,
    url: "/",
    siteName: "SeekerAi",
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    creator: "@seekerai",
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
