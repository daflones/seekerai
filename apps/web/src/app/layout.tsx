import type { Metadata } from "next";
import Script from "next/script";
import { cookies } from "next/headers";
import { THEME_COOKIE } from "@/lib/i18n/shared";
import { getLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";
import { MetaPixel } from "@/components/meta-pixel";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/sora";
import "@fontsource-variable/outfit";
import "./globals.css";
import "./auth-ui.css";
import "./pricing-ui.css";
import "./workspace-ui.css";
import "./public-ui.css";
import "./editor-ui.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://seekerai.digital";

// Título/descrição da guia seguem o idioma do visitante (Accept-Language
// ou cookie de preferência) — um americano vê a guia em inglês etc.
const OG_LOCALE: Record<string, string> = {
  pt: "pt_BR", en: "en_US", es: "es_ES", fr: "fr_FR", de: "de_DE", it: "it_IT",
};

export async function generateMetadata(): Promise<Metadata> {
  const loc = await getLocale();
  const { title, description } = getMessages(loc.lang).meta;
  return {
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
    locale: OG_LOCALE[loc.lang] ?? "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    creator: "@seekerai",
  },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [jar, loc] = await Promise.all([cookies(), getLocale()]);
  const theme = jar.get(THEME_COOKIE)?.value === "light" ? "light" : "dark";
  const htmlLang = loc.lang;
  return (
    <html lang={htmlLang} data-theme={theme} suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* Google Tag Manager (noscript) — logo após a abertura do <body>. */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-KG2R7LSQ"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
            title="Google Tag Manager"
          />
        </noscript>
        <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
        {children}
        {/* Google Tag Manager — injetado no <head> o mais alto possível. */}
        <Script
          id="gtm"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-KG2R7LSQ');`,
          }}
        />
        <MetaPixel />
        {/* Stripe.js em todas as páginas — fingerprint de dispositivo que
            alimenta o Radar (recomendação oficial antifraude). */}
        <Script src="https://js.stripe.com/endive/stripe.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
