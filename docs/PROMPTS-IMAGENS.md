# Image direction - SeekerAi

Only the first two prompts are approved for generation in this batch.
Model: `recraft/recraft-v4.1-flash`, published price checked on 2026-10-21:
USD 0.007/image. Two images: USD 0.014 advertised total, subject to provider
billing. No retries, automatic fallback, batches or paid upscaling.
All responsive variants and compression happen locally.

Prompts below are machine-readable by `scripts/gerar-imagens.mjs`.
No reference images from competitors are sent to any provider.

## 1. Hero atmosphere

```json
{
  "id": "hero-cosmos",
  "purpose": "Low-contrast background behind accessible HTML text",
  "aspect_ratio": "16:9",
  "prompt": "Create a premium, extremely restrained atmospheric background plate for an original Brazilian business intelligence SaaS named SeekerAi. This is BACKGROUND ART ONLY, not a finished website or a screenshot. Wide 16:9 composition, edge-to-edge. Art direction: a quiet cosmos of opportunity, intelligent, precise, sophisticated, human rather than cyberpunk. Color discipline: 85 percent near-black ink (#090711), smoky deep indigo (#241535), muted violet light (#7646ad) and a tiny hint of desaturated cyan (#69c8bd). Place one broad, soft, diffuse elliptical violet nebula in the upper middle third. Light should look like fine translucent cosmic dust illuminated through distant haze, rich subtle gradients, smooth black falloff. Include an extremely thin, incomplete diagonal orbital arc extending from lower left towards upper right, understated and elegant, never a complete ring. A sparse scattering of tiny crisp points of starlight near the outer thirds; only a handful, widely separated. The central 60 percent must remain visually calm, dark, low detail, and low contrast because real readable white website typography will be composited on top. Bottom quarter must fade smoothly into uniform near-black #090711 to blend seamlessly with the next section. The outer edges must also fade to the same dark ink. Texture is fine photographic film grain at almost imperceptible strength, not a visible noisy pattern. Lighting is cinematic but dim and velvety, no bright focal object, no blown highlights. Refined editorial software branding quality. Negative instructions: no text, no letters, no numbers, no logos, no watermarks, no interface, no dashboard, no rectangles, no cards, no people, no faces, no planets, no moon, no sun, no spacecraft, no big starbursts, no lens flare, no saturated neon, no strong cyan, no rainbow, no magenta, no obvious repeating pattern, no dense galaxy, no excessive detail, no cartoon, no visual clutter. Deliver a single coherent background artwork, not a collage."
}
```

## 2. Orbital brand sculpture

```json
{
  "id": "brand-orbit",
  "purpose": "Original brand concept and decorative orbital sculpture; production logo remains vector",
  "aspect_ratio": "1:1",
  "prompt": "Create one original minimalist 3D brand sculpture for SeekerAi, a platform about discovering business opportunities. Square 1:1 artwork. The symbol concept is a precisely machined circular radar lens with one slender elliptical orbital ribbon passing diagonally around it from lower left to upper right, plus a single tiny cyan signal sphere placed near the upper-right part of the orbit. The silhouette should suggest a magnifying lens and discovery without being a literal clip-art magnifying glass. Compose exactly one symbol, large and centered with generous 20 percent negative space on all sides. Keep geometry simple, beautifully balanced and recognizable at small sizes: one open lens ring, one orbit, one signal point. Materials: satin lavender aluminum and smoked translucent violet glass, a very subtle frosted texture, soft realistic reflections. Main ring is muted pale violet (#b18ce5), orbital ribbon a deeper violet (#8658bf), signal point muted icy cyan (#78d9c6). Background is perfectly matte near-black ink #090711, gently darker towards the corners. Use an elegant large softbox key light from upper left and a tiny cool edge light. Restrained photographic studio lighting, soft ambient occlusion, high-end industrial product render, physically plausible materials. A slight three-quarter angle gives depth, but the silhouette must remain clean and legible. The sculpture floats, no pedestal, no ground plane, no hard cast shadow. Make it quietly confident and premium, not a toy, not a gaming badge. This is a visual identity study; do not render any wordmark. Negative instructions: no text, no lettering, no numbers, no watermark, no existing trademark, no competitors' logos, no arrows, no rockets, no lightning bolt, no stars inside the symbol, no multiple icons, no grid of variations, no decorative border, no human, no hands, no face, no chrome rainbow, no gold, no hot pink, no neon bloom, no busy particles, no excessive lens flare, no mockup device, no website, no glossy plastic, no stock icon appearance. Output one finished, carefully composed brand sculpture."
}
```

## Future prompts - do not generate automatically

3. Grain: "Seamless tileable nearly invisible monochrome fine photographic grain,
   uniform density, no shapes, no edges, no text." Use CSS fallback by default.
4. Constellation: "Sparse precise dots linked by hairline orbital arcs on ink
   black, asymmetrical editorial composition, large negative space, no text."
5. Glow: "Single soft volumetric lavender orb, faint muted cyan rim, near-black
   studio background, no objects, no lettering." Prefer CSS radial gradients.
6. Radar illustration: "One satin violet radar lens hovering above an abstract
   isometric neighborhood, simplified blocks, one cyan signal, no labels."
7. City map: "Dark stylized top-down city map, thin muted streets, three violet
   light pins, no actual map data, no labels, 16:9, quiet center."
8. Devices: "Two unbranded slim mobile devices on warm off-white, editorial
   asymmetric perspective, blank screens, realistic matte frames, no logos."
9. Social cover: "1200x630 original cosmic software brand atmosphere, ink black,
   soft violet orbital sculpture in right third, left half calm and empty,
   no text." Render actual title separately using HTML/SVG.
10. Pricing background: "Near-black soft dusk violet gradient with a faint amber
    glow at far right, minimal, no object, no words." Prefer CSS fallback.
11. Empty state: "One simple thin orbital lens with a single distant signal,
    muted lavender on transparent background, vector-like, no text."

Portraits and testimonials are intentionally omitted. No generated image is used
as evidence of customers, revenue, company data or product availability.
