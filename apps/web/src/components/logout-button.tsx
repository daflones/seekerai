"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function logout() {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error("logout");
      window.location.replace("/login");
    } catch { setError(true); setBusy(false); }
  }
  return <div><button className="logout-button" onClick={logout} disabled={busy}><LogOut size={15} />{busy ? "Saindo..." : "Sair da conta"}</button>{error && <span className="field-error" role="alert">Não foi possível sair. Tente novamente.</span>}</div>;
}
