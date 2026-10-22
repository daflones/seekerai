import type { Metadata } from "next";
import { Info } from "lucide-react";
import { InnerHeader } from "@/components/inner-header";
import { ProductDemo } from "@/components/product-demo";
import { getLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Demonstração — veja o radar de oportunidades em ação",
  description: "Explore como o SeekerAi encontra empresas locais, mostra sinais de oportunidade e prepara a abordagem certa para o seu serviço.",
  alternates: { canonical: "/explorar" },
  openGraph: {
    title: "Demonstração do SeekerAi — radar de oportunidades",
    description: "Veja como o SeekerAi encontra quem precisa do que você vende.",
  },
};

export default async function ExplorePage() {
  const loc = await getLocale();
  const t = getMessages(loc.lang).misc;
  return <div className="inner-page"><InnerHeader label={t.backHome} /><main id="conteudo" className="container explore-content"><span className="eyebrow">{t.exploreEyebrow}</span><h1>{t.exploreTitle}</h1><p>{t.exploreP}</p><ProductDemo full /><div className="explore-note"><Info size={18} /><p>{t.exploreNote}</p></div></main></div>;
}
