import Link from "next/link";
import { Brand } from "./brand";
import { LogoutButton } from "./logout-button";

export function PrivateShell({ admin = false, children }: { admin?: boolean; children: React.ReactNode }) {
  return <div className="inner-page private-page">
    <header className="container private-header"><Brand /><nav aria-label="Plataforma"><Link href="/app">Painel</Link><Link href="/app/buscar">Buscar</Link><Link href="/app/leads">Leads</Link><Link href="/app/planos">Planos</Link>{admin && <><Link href="/admin">Administração</Link><Link href="/admin/planos">Cards</Link><Link href="/admin/integracoes">Integrações</Link></>}<LogoutButton /></nav></header>
    <main id="conteudo" className="container private-content">{children}</main>
  </div>;
}
