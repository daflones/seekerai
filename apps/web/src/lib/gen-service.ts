// Gen Service próprio (EasyPanel) — gerações de IA fora das Edge Functions.
// Quando GEN_SERVICE_URL está configurada, as rotadas pesadas
// (generate_app/generate_site) chamam ele em vez da edge ai-generate.
// Mesmo contrato: POST /ai-generate com JWT do usuário + SSE /stream/:jobId.

export function genServiceUrl(): string | null {
  const url = process.env.GEN_SERVICE_URL?.trim().replace(/\/+$/, "");
  return url || null;
}
