import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { InnerHeader } from "@/components/inner-header";

export default function NotFound() {
  return <div className="inner-page"><InnerHeader /><main id="conteudo" className="container explore-content"><span className="eyebrow">FORA DO RADAR</span><h1>Essa página ainda não está por aqui.</h1><p>Mas uma nova oportunidade pode estar a um clique.</p><Link href="/" className="button button-primary"><ArrowLeft size={16} />Voltar ao início</Link></main></div>;
}
