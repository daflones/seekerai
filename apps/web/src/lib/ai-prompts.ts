// Prompts das ações de IA por idioma — o conteúdo gerado sai no idioma do usuário.
import type { Lang } from "./i18n/shared";

export function promptFor(
  kind: "sales_reply" | "deep_strategy" | "generate_site" | "generate_image",
  lead: { nome: string | null; categoria: string | null; cidade: string | null; site: string | null },
  serviceName: string,
  lang: Lang,
): string {
  const hasSite = Boolean(lead.site);
  const gap: Record<Lang, string> = {
    pt: " O estabelecimento NÃO tem site — use isso como gancho principal.",
    en: " The business does NOT have a website — use that as the main hook.",
    es: " El negocio NO tiene sitio web — úsalo como gancho principal.",
    fr: " L'établissement N'A PAS de site web — utilisez-le comme accroche principale.",
    de: " Das Unternehmen hat KEINE Website — nutzen Sie das als Hauptargument.",
    it: " L'attività NON ha un sito web — usalo come gancio principale.",
  };
  const g = hasSite ? "" : gap[lang];
  switch (kind) {
    case "sales_reply": return ({
      pt: `Escreva uma mensagem curta de primeira abordagem via WhatsApp oferecendo ${serviceName} para este estabelecimento.${g} Tom humano, sem exageros, máximo 3 parágrafos curtos, terminando com uma pergunta simples.`,
      en: `Write a short first-touch WhatsApp outreach message offering ${serviceName} to this business.${g} Human tone, no exaggeration, max 3 short paragraphs, ending with a simple question.`,
      es: `Escribe un mensaje corto de primer contacto por WhatsApp ofreciendo ${serviceName} a este negocio.${g} Tono humano, sin exageraciones, máximo 3 párrafos cortos, terminando con una pregunta simple.`,
      fr: `Rédigez un court premier message WhatsApp proposant ${serviceName} à cet établissement.${g} Ton humain, sans exagération, 3 paragraphes courts maximum, en terminant par une question simple.`,
      de: `Schreiben Sie eine kurze erste WhatsApp-Ansprache, die ${serviceName} für dieses Unternehmen anbietet.${g} Menschlicher Ton, keine Übertreibung, max. 3 kurze Absätze, mit einer einfachen Frage am Ende.`,
      it: `Scrivi un breve primo messaggio WhatsApp che offre ${serviceName} a questa attività.${g} Tono umano, senza esagerazioni, massimo 3 paragrafi brevi, con una domanda semplice alla fine.`,
    })[lang];
    case "deep_strategy": return ({
      pt: `Monte a estratégia de venda de ${serviceName} para este estabelecimento: diagnóstico, gaps observáveis, ângulo de abordagem, objeções prováveis e o próximo passo concreto.${g}`,
      en: `Build the sales strategy for ${serviceName} for this business: diagnosis, observable gaps, pitch angle, likely objections and the concrete next step.${g}`,
      es: `Arma la estrategia de venta de ${serviceName} para este negocio: diagnóstico, brechas observables, ángulo de enfoque, objeciones probables y el próximo paso concreto.${g}`,
      fr: `Construisez la stratégie de vente de ${serviceName} pour cet établissement : diagnostic, lacunes observables, angle d'approche, objections probables et prochaine étape concrète.${g}`,
      de: `Erstellen Sie die Vertriebsstrategie für ${serviceName} für dieses Unternehmen: Diagnose, sichtbare Lücken, Gesprächseinstieg, wahrscheinliche Einwände und der konkrete nächste Schritt.${g}`,
      it: `Costruisci la strategia di vendita di ${serviceName} per questa attività: diagnosi, gap osservabili, angolo di approccio, obiezioni probabili e il prossimo passo concreto.${g}`,
    })[lang];
    case "generate_site": return ({
      pt: `Crie o site institucional completo deste estabelecimento, pronto para publicar. Nome, categoria, endereço, telefone e avaliação estão no contexto — use-os de verdade.`,
      en: `Create the complete business website for this establishment, ready to publish. Name, category, address, phone and rating are in the context — use them for real.`,
      es: `Crea el sitio web institucional completo de este negocio, listo para publicar. Nombre, categoría, dirección, teléfono y valoración están en el contexto — úsalos de verdad.`,
      fr: `Créez le site institutionnel complet de cet établissement, prêt à publier. Nom, catégorie, adresse, téléphone et note sont dans le contexte — utilisez-les vraiment.`,
      de: `Erstellen Sie die komplette Unternehmens-Website für dieses Unternehmen, publikationsfertig. Name, Kategorie, Adresse, Telefon und Bewertung stehen im Kontext — verwenden Sie sie wirklich.`,
      it: `Crea il sito istituzionale completo di questa attività, pronto per la pubblicazione. Nome, categoria, indirizzo, telefono e valutazione sono nel contesto — usali davvero.`,
    })[lang];
    default: return ({
      pt: `Fotografia profissional e realista de ${lead.nome} — ${lead.categoria ?? "negócio local"} em ${lead.cidade ?? "cidade brasileira"}. Estilo editorial premium, luz natural, sem texto nem marcas d'água.`,
      en: `Professional, realistic photograph of ${lead.nome} — a ${lead.categoria ?? "local business"} in ${lead.cidade ?? "the city"}. Premium editorial style, natural light, no text or watermarks.`,
      es: `Fotografía profesional y realista de ${lead.nome} — ${lead.categoria ?? "negocio local"} en ${lead.cidade ?? "la ciudad"}. Estilo editorial premium, luz natural, sin texto ni marcas de agua.`,
      fr: `Photographie professionnelle et réaliste de ${lead.nome} — ${lead.categoria ?? "commerce local"} à ${lead.cidade ?? "la ville"}. Style éditorial premium, lumière naturelle, sans texte ni filigrane.`,
      de: `Professionelles, realistisches Foto von ${lead.nome} — ${lead.categoria ?? "lokales Unternehmen"} in ${lead.cidade ?? "der Stadt"}. Premium-Editorial-Stil, natürliches Licht, kein Text, keine Wasserzeichen.`,
      it: `Fotografia professionale e realistica di ${lead.nome} — ${lead.categoria ?? "attività locale"} a ${lead.cidade ?? "la città"}. Stile editoriale premium, luce naturale, senza testo né watermark.`,
    })[lang];
  }
}
