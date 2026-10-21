import type { Metadata } from "next";
import { Info } from "lucide-react";
import { InnerHeader } from "@/components/inner-header";
import { ProductDemo } from "@/components/product-demo";

export const metadata: Metadata = {
  title: "Demonstração — veja o radar de oportunidades em ação",
  description: "Explore como o SeekerAi encontra empresas locais, mostra sinais de oportunidade e prepara a abordagem certa para o seu serviço.",
  alternates: { canonical: "/explorar" },
  openGraph: {
    title: "Demonstração do SeekerAi — radar de oportunidades",
    description: "Veja como o SeekerAi encontra quem precisa do que você vende.",
  },
};

export default function ExplorePage() {
  return <div className="inner-page"><InnerHeader /><main id="conteudo" className="container explore-content"><span className="eyebrow">CONHEÇA SEU NOVO RADAR</span><h1>Uma ideia do que vem por aí.</h1><p>Escolha seu serviço, um nicho e uma cidade. Explore análises de exemplo, salve oportunidades durante esta visita e copie uma abordagem para entender o fluxo.</p><div className="credit-preview-strip"><span><strong>50 créditos</strong> de boas-vindas na nova regra de cadastro</span><span>Busca: <strong>4 créditos</strong> por busca, não por resultado</span><small>Prévia · valores configuráveis pelo admin · não há débito nesta demonstração</small></div><ProductDemo full /><div className="explore-note"><Info size={18} /><p>Esta é uma demonstração local com dados fictícios. Nenhuma busca é feita no Google, nenhum crédito é consumido e nenhum contato recebe mensagens. Os exemplos salvos são temporários e não persistem ao sair da página.</p></div></main></div>;
}
