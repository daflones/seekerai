/* Payload do runtime estático dos sites premium.
   Quando o editor captura o HTML do site, os scripts do Next morrem —
   o /site-runtime.js (vanilla) reanima o doc usando os dados desta ilha
   (#skr-cfg). Construído server-side a partir do SiteConfig: strings já
   vêm resolvidas no idioma do site, sem funções. */

import type { SiteConfig } from "@/lib/sites";
import { callingCodeFor, toE164 } from "@/lib/phone";
import {
  conjLugar, conjNoLugar, siteLocale, siteStrings,
} from "./site-i18n";

export function siteRuntimePayload(cfg: SiteConfig, ns: "bshop" | "bbeauty") {
  const S = siteStrings(cfg.lang);
  const wa = toE164(cfg.contato.whatsapp ?? cfg.contato.telefone, callingCodeFor(cfg.pais)) ?? "";
  const bookingEnabled = Boolean(cfg.horarios && Object.values(cfg.horarios).some((w) => w?.length));
  const telHref = cfg.contato.telefone ? `tel:${cfg.contato.telefone.replace(/\D/g, "")}` : null;
  const waHref = wa ? `https://wa.me/${wa}` : null;

  // Mesma regra do CtaButton do tema beleza: agendar → wizard; zap →
  // WhatsApp; mapa → modal de visita; sem destino cai no #contato.
  const ctaKind = (cfg.vocab?.cta ?? "agendar") === "agendar" && !bookingEnabled
    ? "zap" : (cfg.vocab?.cta ?? "agendar");
  const cta = ctaKind === "agendar" ? "agendar"
    : ctaKind === "mapa" && (cfg.contato.mapsUrl || waHref || telHref) ? "link"
    : ctaKind === "mapa" ? "mapa"
    : "scroll";

  const currency = { pt: "BRL", en: "USD", es: "EUR" }[cfg.lang ?? "pt"] ?? "USD";
  const deLugar = conjLugar(cfg.vocab?.prep ?? S.prepFallback, cfg.lang);
  const noLugar = conjNoLugar(deLugar, cfg.lang);

  return {
    ns,
    nome: cfg.nome,
    marca: cfg.marca || cfg.nome,
    wa,
    tel: telHref,
    maps: cfg.contato.mapsUrl ?? null,
    end: cfg.contato.endereco ?? null,
    cta: ns === "bbeauty" ? cta : (bookingEnabled ? "agendar" : "link"),
    book: bookingEnabled,
    sv: (cfg.servicos ?? []).map((s) => ({ n: s.nome, p: s.preco, d: s.duracaoMin })),
    pros: (cfg.profissionais ?? []).map((p) => ({ n: p.nome, e: p.especialidade ?? null })),
    hrs: cfg.horarios ?? {},
    bk: {
      slot: cfg.booking?.slotMin || 30,
      dias: cfg.booking?.diasFuturos || 14,
      ant: cfg.booking?.antecedenciaMin || 0,
    },
    hl: cfg.horariosLabel ?? [],
    faq: (cfg.faq ?? []).map((f) => ({ q: f.q, a: f.a })),
    nota: cfg.avaliacoes?.nota ?? null,
    s: {
      ag: S.agendamento,
      t: ns === "bshop"
        ? `${S.reserveBarberA} <em>${S.reserveBarberB}</em>`
        : `${S.reserveA} <em>${S.reserveB}</em>`,
      ss: S.stepServico,
      sp: ns === "bshop" ? S.stepProfBarber : S.stepProf,
      sd: S.stepData, sh: S.stepHora, sc: S.stepConfirma,
      np: S.semPref,
      pd: ns === "bshop" ? S.primeiroDisp : S.primeiraDisp,
      pf: ns === "bshop" ? S.barbeiro : S.profissional,
      nh: S.semHorarios,
      ls: S.sumServico, lp: S.sumProf, ld: S.sumData, lh: S.sumHora,
      ln: S.sumNome, lt: S.sumTel,
      yn: S.seuNome, nph: S.nomePh, yw: S.seuWhats, tph: S.telPh,
      co: S.continuar, vo: S.voltar, ew: S.enviarWhats, bm: S.bookMsg,
      fe: S.fechar, ar: S.arraste, an: S.anterior, pr: S.proxima,
      es: S.errServico, ep: S.errProf, ed: S.errData, eh: S.errHora, en: S.errNome,
      wh: S.waBookHello(cfg.nome),
      vb: ns === "bshop" ? S.valorBalcao : S.sobConsulta,
      ve: S.visitEyebrow, vt: S.visitTitle(noLugar), tr: S.tracaRota,
      ls2: S.ligarShort, cc: S.comoChegar, cw: S.chamarWa,
      dows: S.dows, loc: siteLocale(cfg.lang), cur: currency,
    },
  };
}

/** Ilha + tag do runtime prontos pra embutir no documento. */
export function siteRuntimeTags(cfg: SiteConfig, ns: "bshop" | "bbeauty"): string {
  const json = JSON.stringify(siteRuntimePayload(cfg, ns)).replace(/</g, "\\u003c");
  return `<script type="application/json" id="skr-cfg" data-keep>${json}</script>`
    + `<script src="/site-runtime.js" data-keep defer></script>`;
}

/** JSON seguro pra dangerouslySetInnerHTML nos templates. */
export function siteRuntimeJson(cfg: SiteConfig, ns: "bshop" | "bbeauty"): string {
  return JSON.stringify(siteRuntimePayload(cfg, ns)).replace(/</g, "\\u003c");
}

/** Marcação de raiz dos templates — docs sem ela são HTML de IA puro. */
function hasTemplateRoot(html: string): boolean {
  return /class="(?:bshop|bbeauty)["\s>]/.test(html);
}

/** Sites editados antes do runtime existir: injeta ilha + script na
    hora de servir, usando o config original guardado em config.orig. */
export function injectSiteRuntime(html: string, cfg: SiteConfig | null | undefined): string {
  if (html.includes("site-runtime.js") || !hasTemplateRoot(html)) return html;
  const ns: "bshop" | "bbeauty" = html.includes('class="bbeauty') ? "bbeauty" : "bshop";
  // Sem config original a ilha vai só com o namespace — o runtime
  // degrada (menu/lightbox/FAQ do DOM continuam, agendar vira WhatsApp).
  const tags = cfg
    ? siteRuntimeTags(cfg, ns)
    : `<script type="application/json" id="skr-cfg" data-keep>{"ns":"${ns}"}</script>`
      + `<script src="/site-runtime.js" data-keep defer></script>`;
  return /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${tags}</body>`)
    : html + tags;
}
