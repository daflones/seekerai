"use client";

import { Moon, Sun } from "lucide-react";
import { THEME_COOKIE, type Theme } from "@/lib/i18n/shared";

// Alterna tema claro/escuro. Persiste em cookie (SSR sem flash) e aplica
// direto no <html data-theme> pra troca instantânea.
export function ThemeToggle({ theme }: { theme: Theme }) {
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={next === "light" ? "Light theme / Tema claro" : "Dark theme / Tema escuro"}
      title={next === "light" ? "Tema claro" : "Tema escuro"}
      onClick={() => {
        document.cookie = `${THEME_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
        document.documentElement.dataset.theme = next;
      }}
    >
      {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}
