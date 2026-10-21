import Link from "next/link";
import { Brand } from "./brand";
import { LogoutButton } from "./logout-button";

export function PrivateShell({ admin = false, children }: { admin?: boolean; children: React.ReactNode }) {
  return <div className="inner-page private-page">
    <header className="container private-header"><Brand /><nav aria-label="Plataforma"><Link href="/app">Minha plataforma</Link>{admin && <><Link href="/admin">Administração</Link><Link href="/admin/planos">Planos e cards</Link></>}<LogoutButton /></nav></header>
    <main id="conteudo" className="container private-content">{children}</main>
  </div>;
}
