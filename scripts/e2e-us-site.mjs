// E2E: insere um site de teste americano (lang en, pais US) e valida o HTML.
// Uso: node scripts/e2e-us-site.mjs [up|check|down]
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8").split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/^"|"$/g, "").trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const SLUG = "e2e-us-test";
const site = {
  slug: SLUG,
  tipo: "beleza",
  nome: "Sunset Nails Miami",
  lead_id: null,
  publicado: true,
  config: {
    tipo: "beleza",
    nome: "Sunset Nails Miami",
    marca: "Sunset Nails",
    lang: "en",
    pais: "US",
    cidade: "Miami Beach · FL",
    tagline: "Miami's favorite nail studio",
    vocab: {
      rotulo: "NAIL STUDIO", em: "feel polished",
      desc: "Nail care done right, every single time.",
      prep: "the studio", marquee: "Miami's favorite nail studio",
      ctaEm: "treat yourself", schema: "NailSalon", cta: "agendar",
      ctaLabel: "Book on WhatsApp", servicosLabel: "Services",
      servicosTitle: "Pick your", servicosEm: "moment",
      servicosHint: "message us on WhatsApp", ofertasTitle: null,
    },
    contato: {
      telefone: "(305) 555-0142",
      whatsapp: "13055550142",
      instagram: "https://instagram.com/sunsetnailsmia",
      endereco: "123 Ocean Dr, Miami Beach, FL 33139",
      mapsUrl: "https://maps.google.com/?q=Sunset+Nails+Miami",
    },
    horarios: {
      "0": null, "1": [["09:00", "18:00"]], "2": [["09:00", "18:00"]],
      "3": [["09:00", "18:00"]], "4": [["09:00", "18:00"]],
      "5": [["09:00", "19:00"]], "6": [["10:00", "16:00"]],
    },
    servicos: [
      { nome: "Gel manicure", duracaoMin: 60, preco: 45, categoria: "Nails" },
      { nome: "Spa pedicure", duracaoMin: 75, preco: 60, categoria: "Nails" },
      { nome: "Acrylic full set", duracaoMin: 90, preco: 85, categoria: "Nails" },
    ],
    profissionais: [{ nome: "Maria Gonzalez", especialidade: "Nail art" }],
    fotos: { galeria: [] },
    avaliacoes: {
      nota: 4.8, total: 214, fonte: "Google",
      itens: [{ autor: "Jane D.", nota: 5, texto: "Best nails in Miami Beach, hands down!", quando: "2 weeks ago" }],
    },
    faq: [{ q: "Do you take walk-ins?", a: "Yes, whenever we have a free chair." }],
    booking: { slotMin: 30, diasFuturos: 14, antecedenciaMin: 30 },
    seo: { title: "Sunset Nails Miami", description: "Nail studio in Miami Beach, FL." },
  },
};

const mode = process.argv[2] ?? "up";
if (mode === "up" || mode === "check") {
  await fetch(`${URL_}/rest/v1/sites?slug=eq.${SLUG}`, { method: "DELETE", headers: H });
  const r = await fetch(`${URL_}/rest/v1/sites`, {
    method: "POST",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify(site),
  });
  if (!r.ok) { console.error("INSERT FAIL", r.status, await r.text()); process.exit(1); }
  const [row] = await r.json();
  console.log("INSERTED", row.slug, "lang:", row.config.lang, "pais:", row.config.pais);
}
if (mode === "down") {
  const r = await fetch(`${URL_}/rest/v1/sites?slug=eq.${SLUG}`, { method: "DELETE", headers: H });
  console.log("DELETED", r.status);
}
