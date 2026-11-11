"use client";

/* Elementos premium compartilhados pelos dois temas de site
   (referência: porembarbershop.nl — reviews estilo Google em marquee
   duplo, cards de serviço com foto+selo, agendamento "em dois toques").
   `ns` = prefixo de classe do tema ("bshop" | "bbeauty"). Tudo funciona
   por CSS no doc estático — a única interação (data-bk-open) é religada
   pelo site-runtime.js. */

import { ArrowRight } from "lucide-react";
import type { SiteServico } from "@/lib/sites";

/* Marca "G" do Google nos cards de avaliação. */
function GoogleG({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a7.15 7.15 0 0 1 0-4.57V6.7H2.18a11 11 0 0 0 0 10.6l3.66-3.2z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.16l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

interface ReviewItem {
  autor: string; nota?: number; texto: string; quando?: string; foto?: string;
}

function ReviewCard({ r, ns }: { r: ReviewItem; ns: string }) {
  return (
    <article className={`${ns}-revm-card`}>
      <header>
        {r.foto
          /* eslint-disable-next-line @next/next/no-img-element */
          ? <img className={`${ns}-revm-avatar`} src={r.foto} alt="" loading="lazy" />
          : <span className={`${ns}-revm-avatar`} aria-hidden="true">{r.autor.trim()[0] ?? "·"}</span>}
        <div className={`${ns}-revm-who`}>
          <strong>{r.autor}</strong>
          {r.quando && <small>{r.quando}</small>}
        </div>
        <GoogleG />
      </header>
      <span className="stars" aria-label={`${r.nota ?? 5} de 5`}>{"★".repeat(r.nota ?? 5)}</span>
      <p>“{r.texto}”</p>
    </article>
  );
}

/* Duas fileiras de reviews reais rolando em direções opostas — a
   animação é CSS puro (funciona no doc capturado pelo editor). */
export function ReviewMarquee({ itens, ns }: { itens: ReviewItem[]; ns: string }) {
  const half = Math.ceil(itens.length / 2);
  const rows = [itens.slice(0, half), itens.slice(half)];
  return (
    <div className={`${ns}-revm`}>
      {rows.map((row, ri) => row.length ? (
        <div key={ri} className={`${ns}-revm-row${ri === 1 ? " rev" : ""}`}>
          <div className={`${ns}-revm-track`}>
            {[0, 1].map((k) => (
              <div key={k} className={`${ns}-revm-set`} aria-hidden={k === 1}>
                {row.map((r, i) => <ReviewCard key={`${r.autor}-${i}`} r={r} ns={ns} />)}
              </div>
            ))}
          </div>
        </div>
      ) : null)}
    </div>
  );
}

/* Card de serviço com foto real + selo — "treatment" do Porem:
   foto de capa, selo (MAIS PEDIDO), nome, duração e preço com "de". */
export function SvcPhotoCard({ s, ns, money, onPick, index }: {
  s: SiteServico; ns: string; money: Intl.NumberFormat;
  onPick?: (s: SiteServico) => void; index?: number;
}) {
  const inner = <>
    {s.foto && (
      <div className={`${ns}-svc-photo`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={s.foto} alt={s.nome} loading="lazy" />
        {s.badge && <span className={`${ns}-svc-badge`}>{s.badge}</span>}
      </div>
    )}
    <div className={`${ns}-svc-info`}>
      <h3>{s.nome}</h3>
      <div className={`${ns}-svc-meta`}>
        {s.duracaoMin ? <span>{s.duracaoMin} min</span> : null}
        {s.precoDe ? <s>{money.format(s.precoDe)}</s> : null}
        {s.preco ? <strong>{money.format(s.preco)}</strong> : null}
      </div>
      {s.descricao && <p className={`${ns}-svc-desc`}>{s.descricao}</p>}
    </div>
  </>;
  return onPick
    ? <button type="button" className={`${ns}-svc-card`} data-bk-open={index} onClick={() => onPick(s)}>{inner}</button>
    : <article className={`${ns}-svc-card`}>{inner}</article>;
}

/* Faixa "agende em dois toques" logo abaixo do hero — cada pick já é
   o toque: abre o wizard com o serviço pré-selecionado (data-bk-open
   faz o mesmo no doc estático via runtime). */
export function QuickBook({ ns, title, picks, money, onPick }: {
  ns: string; title: string; money: Intl.NumberFormat;
  picks: { s: SiteServico; i: number }[]; onPick: (s: SiteServico) => void;
}) {
  return (
    <div className={`${ns}-quick`}>
      <div className={`${ns}-quick-head`}>
        <span className={`${ns}-quick-label`}><ArrowRight size={11} /></span>
        <h3>{title}</h3>
      </div>
      <div className={`${ns}-quick-picks`} role="list">
        {picks.map(({ s, i }) => (
          <button key={s.nome} type="button" role="listitem"
            className={`${ns}-quick-pick${s.badge ? " hot" : ""}`}
            data-bk-open={i} onClick={() => onPick(s)}>
            {s.badge && <em className={`${ns}-quick-badge`}>{s.badge}</em>}
            <strong>{s.nome}</strong>
            <small>
              {[s.duracaoMin ? `${s.duracaoMin} min` : null, s.preco ? money.format(s.preco) : null]
                .filter(Boolean).join(" · ") || <ArrowRight size={12} />}
            </small>
          </button>
        ))}
      </div>
    </div>
  );
}
