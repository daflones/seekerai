import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "./brand";

export function InnerHeader({ label = "Voltar ao início" }: { label?: string }) {
  return <header className="inner-header container"><Brand /><Link href="/"><ArrowLeft size={13} />{label}</Link></header>;
}
