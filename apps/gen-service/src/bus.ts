// Barramento em memória de eventos de job — alimenta o SSE /stream/:jobId.
// Os mesmos eventos também são persistidos na coluna `eventos` do banco
// (via RPC report_job_event) como fallback caso o serviço reinicie.

export interface JobEvent {
  p: number;
  etapa: string;
  at: string;
  done?: boolean;
  erro?: string;
  /** Busca de leads: estabelecimentos confirmados neste estágio. */
  achados?: unknown[];
}

type Listener = (e: JobEvent) => void;

const listeners = new Map<string, Set<Listener>>();
// Buffer curto pra quem conecta depois do início do job (replay recente).
const recent = new Map<string, JobEvent[]>();
const RECENT_MAX = 80;

export function emitJobEvent(jobId: string, p: number, etapa: string, extra?: Partial<JobEvent>): void {
  const e: JobEvent = { p, etapa, at: new Date().toISOString(), ...extra };
  const buf = recent.get(jobId) ?? [];
  buf.push(e);
  if (buf.length > RECENT_MAX) buf.splice(0, buf.length - RECENT_MAX);
  recent.set(jobId, buf);
  for (const l of listeners.get(jobId) ?? []) {
    try { l(e); } catch { /* listener morto não derruba o job */ }
  }
}

export function recentJobEvents(jobId: string): JobEvent[] {
  return [...(recent.get(jobId) ?? [])];
}

export function subscribeJob(jobId: string, onEvent: Listener): () => void {
  let set = listeners.get(jobId);
  if (!set) { set = new Set(); listeners.set(jobId, set); }
  set.add(onEvent);
  return () => {
    set!.delete(onEvent);
    if (!set!.size) listeners.delete(jobId);
  };
}

export function clearJobEvents(jobId: string): void {
  recent.delete(jobId);
  listeners.delete(jobId);
}
