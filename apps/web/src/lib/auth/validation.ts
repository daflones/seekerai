import { z } from "zod";

const email = z.string().trim().email("Informe um e-mail válido.").max(254).transform((value) => value.toLowerCase());
const password = z.string().min(8, "Use pelo menos 8 caracteres.").max(128, "Use no máximo 128 caracteres.");
const captchaToken = z.string().min(1, "Conclua a verificação de segurança.").max(2048);
const profile = {
  name: z.string().trim().min(2, "Informe seu nome.").max(150),
  phone: z.string().trim().regex(/^[+\d ()-]{8,30}$/, "Informe um telefone válido.")
    .refine((value) => { const digits = value.replace(/\D/g, "").length; return digits >= 8 && digits <= 15; }, "Informe um telefone válido."),
  terms: z.literal(true, { error: "Aceite os Termos e a Política de Privacidade." }),
  marketing: z.boolean().default(false),
};

export const loginSchema = z.object({ email, password: z.string().min(1).max(128), captchaToken, next: z.string().max(500).optional() });
export const signupSchema = z.object({
  email, password, captchaToken, ...profile,
  plan: z.enum(["gratis", "essencial", "pro", "king"]).optional(),
});
export const recoverySchema = z.object({ email, captchaToken });
export const passwordSchema = z.object({ password, captchaToken });
export const onboardingSchema = z.object({ ...profile, captchaToken, next: z.string().max(500).optional() });

export function safeNext(value: string | null | undefined): string {
  if (!value || /[\\\u0000-\u001f]/.test(value)) return "/app";
  try {
    const url = new URL(value, "https://safe.invalid");
    if (url.origin !== "https://safe.invalid") return "/app";
    if (![ "/app", "/admin" ].some((base) => url.pathname === base || url.pathname.startsWith(`${base}/`))) return "/app";
    return `${url.pathname}${url.search}`;
  } catch { return "/app"; }
}

export function allowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const candidate = new URL(origin);
    const canonical = process.env.NEXT_PUBLIC_APP_URL;
    if (canonical && candidate.origin === new URL(canonical).origin) return true;
    return process.env.NODE_ENV !== "production" &&
      ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3100", "http://127.0.0.1:3100"].includes(candidate.origin);
  } catch { return false; }
}

export function callbackOrigin(requestOrigin: string): string {
  if (process.env.NODE_ENV !== "production" && allowedOrigin(requestOrigin)) return new URL(requestOrigin).origin;
  const canonical = process.env.NEXT_PUBLIC_APP_URL;
  if (!canonical || new URL(canonical).protocol !== "https:") throw new Error("URL pública HTTPS não configurada.");
  return new URL(canonical).origin;
}
