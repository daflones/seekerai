"use client";

import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { LANG_NAMES, LOCALE_COOKIE, type Locale } from "@/lib/i18n/shared";

// Seletor manual de idioma. A detecção automática usa o navegador; aqui a
// pessoa pode corrigir — grava cookie e recarrega pra moeda/idioma mudarem.
export function LocaleSwitcher({ current }: { current: Locale }) {
  const router = useRouter();

  function choose(value: string) {
    // value = "pt-BR" | "en-US" | ... guarda a tag completa pra manter a moeda certa
    document.cookie = `${LOCALE_COOKIE}=${value};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  }

  const options: { tag: string; label: string }[] = [
    { tag: "pt-BR", label: "Português (BR)" },
    { tag: "pt-PT", label: "Português (PT)" },
    { tag: "en-US", label: `${LANG_NAMES.en} (US)` },
    { tag: "en-GB", label: `${LANG_NAMES.en} (UK)` },
    { tag: "es-ES", label: "Español" },
    { tag: "fr-FR", label: "Français" },
    { tag: "de-DE", label: "Deutsch" },
    { tag: "it-IT", label: "Italiano" },
  ];
  const currentTag = `${current.lang}-${current.region}`;

  return (
    <label className="locale-switcher">
      <Globe size={13} aria-hidden="true" />
      <select
        aria-label="Language / Idioma"
        defaultValue={currentTag}
        onChange={(e) => choose(e.target.value)}
      >
        {options.map((o) => <option key={o.tag} value={o.tag}>{o.label}</option>)}
      </select>
    </label>
  );
}
