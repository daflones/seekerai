import { z } from "zod";

export const planSlug = z.enum(["gratis", "essencial", "pro", "king"]);

export function marketingTextAllowed(text: string): boolean {
  const withoutCard = text.replace(/cart[aã]o de cr[eé]dito/gi, "");
  if (/\bcr[eé]ditos?\b/i.test(withoutCard)) return false;
  return !/ilimitad[oa]s?/i.test(text) || /portf[oó]lio|trabalhos/i.test(text);
}
const text = (min: number, max: number) => z.string().trim().min(min).max(max)
  .refine(marketingTextAllowed, "Não publique créditos nem uso ilimitado de ações pagas na landing.");

export const featureSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  text: text(1, 140),
  highlight: z.boolean(),
  visible: z.boolean(),
  icon: z.enum(["check", "bot", "sparkles", "globe"]),
}).strict();

export const cardContentSchema = z.object({
  badge: text(0, 40),
  description: text(1, 180),
  cta: text(1, 50),
  theme: z.enum(["cream", "teal", "violet", "gold"]),
  buttonStyle: z.enum(["solid", "light", "outline"]),
  features: z.array(featureSchema).min(1).max(12)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length, "Os recursos precisam de identificadores únicos.")
    .refine((items) => items.some((item) => item.visible), "Mostre pelo menos um benefício."),
}).strict();

export const planEditSchema = z.object({
  id: z.string().uuid(),
  name: text(1, 60),
  priceCents: z.number().int().min(0).max(10_000_000),
  order: z.number().int().min(0).max(99),
  featured: z.boolean(),
  visible: z.boolean(),
  revision: z.number().int().nonnegative(),
  reason: z.string().trim().min(5).max(300),
  content: cardContentSchema,
}).strict();

export type CardContent = z.infer<typeof cardContentSchema>;
export type PlanEdit = z.infer<typeof planEditSchema>;
export type PlanCard = {
  id: string | null;
  slug: z.infer<typeof planSlug>;
  name: string;
  priceCents: number;
  order: number;
  featured: boolean;
  visible: boolean;
  revision: number;
  content: CardContent;
};
export type PlanSource = "database" | "preview" | "unavailable";

export function formatPlanPrice(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: cents === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
}
