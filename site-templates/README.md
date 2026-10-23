# SeekerAi Sites — plataforma de sites premium para negócios locais

`/site/<slug>` renderiza o site de um estabelecimento a partir de uma
configuração no banco. Uma linha na tabela `sites` = um site; um novo
cliente entra sem escrever código de interface.

## Arquitetura

```
scripts/apply-site.mjs               → sobe mídia pro Storage + grava a linha `sites`
site-templates/configs/<x>.json      → config de override do estabelecimento
apps/web/src/app/site/[slug]/page.tsx     → SSR: sites → React site | fallback: lead_outputs (HTML)
apps/web/src/lib/sites.ts                 → tipo SiteConfig + loadSite()
apps/web/src/components/site/barbershop-site.tsx → render do tipo "barbearia"
apps/web/src/components/site/site.css     → tema (.bshop-*, tokens --bs-*)
bucket Supabase `site-assets/<slug>/`     → fotos/vídeos do estabelecimento (leitura pública)
```

- **Multi-tenant**: `slug` → `loadSite()` → `config` tipado (`SiteConfig`
  em `lib/sites.ts`). Slug desconhecido → 404. `publicado=false` → 404.
- **Tipos de negócio**: `sites.tipo` escolhe o render. `barbearia` pronto;
  `unha`/`sobrancelha`/`cilios`/`salao` — componentes próprios no mesmo padrão.
- **Legado**: slug sem linha em `sites` cai no mecanismo antigo
  (`leads.dados.siteSlug` → `lead_outputs.conteudo`), então sites antigos
  gerados por IA continuam servidos.

## Publicar um novo estabelecimento

```bash
cd apps/web
node ../../scripts/apply-site.mjs \
  --lead <uuid-do-lead-ou-place_id> \
  [--slug slug-custom] \
  [--config ../../site-templates/configs/<x>.json] \
  [--assets /pasta/com/fotos-e-videos]
```

1. Lê o lead (nome, endereço, telefone, nota, mapsUrl).
2. Cria o bucket `site-assets` se não existir e sobe a mídia (dedupe por tamanho).
   Sem `--assets`, baixa a foto de capa do Google (lead.imagem → w1600).
3. Mescla defaults (derivados do lead) com o `--config` (override vence).
   `fotos.hero` aceita URL absoluta ou nome de arquivo enviado em `--assets`.
4. `upsert` em `sites` + `leads.dados.siteSlug = slug` — o card do lead
   já linka pro site novo.

Exemplo completo de config: `site-templates/configs/barbearia-vianna.json`
(horarios, servicos, historia, avaliacoes, faq, seo, videos, booking).

## Componentes 21st.dev utilizados

| Fonte | Uso |
|---|---|
| [`@jahed/motion-footer`](https://21st.dev/@jahed/components/motion-footer) | **Portado com código real** (registry `21st.dev/r`). Curtain reveal: `clip-path` no wrapper + footer `fixed`; giant bg text com parallax via ScrollTrigger scrub; marquee diagonal rotacionado; aurora "breathing"; pills magnéticas; back-to-top magnético; badge "Feito com ♥ por SeekerAi" com heartbeat. Textos/links do estabelecimento vêm do config. |
| [`@ayushmxxn/masonry-lightbox`](https://21st.dev/@ayushmxxn/components/masonry-lightbox) | **Adaptado do código real**. Galeria em colunas masonry, entrada com stagger blur+y (framer-motion), hover lift + caption em gradiente, lightbox em portal com scroll-lock, Escape e navegação por setas. |
| padrão `text-reveal` (kuratlielia) | `RevealText`: títulos sobem palavra a palavra com blur (framer-motion `whileInView`). Reimplementação local — o limite do plano free do 21st é 2 downloads/dia. |
| padrão `magnetic-button` | `Magnetic`: translate+tilt físico com `elastic.out` (código do primitivo do motion-footer) nos CTAs do hero, pills do footer e botão topo. |
| spotlight/glow cards | `Spotlight`: radial-gradient segue o cursor (`--mx/--my`) nos cards de serviço e contato. |
| scroll-reveal | `FadeUp` (framer-motion) + parallax GSAP no hero + `CountUp` na nota. |
| grain/film texture | `.bshop-grain`: SVG feTurbulence animado por steps — textura de filme sobre o site. |
| smooth scroll | `lenis` (já era dep do projeto) integrado ao ScrollTrigger; âncoras rolam suave com offset da nav. |
| progress bar | `useScroll` do framer-motion → barra dourada no topo. |

Tudo roda localmente (React + framer-motion + GSAP + CSS `.bshop-*`) —
o site **não depende** de CLI/MCP do 21st.dev em runtime. Componentes não
baixados por limite de quota foram reimplementados nos mesmos padrões.
`prefers-reduced-motion`: animações desligadas e conteúdo visível de imediato.

## Agendamento

Sem backend de reserva: o fluxo (serviço → profissional* → data → hora →
nome/telefone) monta a mensagem e abre `wa.me/<whatsapp>` — a confirmação
fica com a automação de WhatsApp do cliente (vendida separadamente).
Slots calculados de `horarios` + `slotMin`; hoje é filtrado por
`antecedenciaMin`; dias fechados (`null`) ficam indisponíveis; a duração
do serviço limita o último horário.

*Se não houver `profissionais` no config, o passo é pulado automaticamente.

## O que NÃO é inventado (fontes)

- Horários: seg–sáb 09:00–19:30, domingo fechado — scrape Apify + placa na parede (foto).
- Nota: 5.0/137 no Google; depoimentos são avaliações reais do Maps (com autores).
- Fotos/vídeos: Instagram do estabelecimento (arquivos enviados pelo usuário) + capa do Maps.
- Comodidades (cartão/NFC/crianças/banheiro) — `additionalInfo` do scrape.
- Preços: sem dado público → "Valor no balcão"; nada inventado.
- "O Melhor Daqui": não confirmado → não reivindicado no site.

## Dependências / ambiente

- gsap, framer-motion, lenis, lucide-react (todos já em `apps/web`).
- `.env.local`: `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY` (script).
- Storage: bucket `site-assets` (public read, service-role write).

## Limitações conhecidas

- Slots refletem só o horário de funcionamento; ocupação real é resolvida
  na conversa do WhatsApp (automação fora do site).
- API do Instagram não é consumida — mídia entra via pasta local (`--assets`).
