import { PGlite, type Transaction } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { services } from "../service-catalog";

let db: PGlite;
const hash = "a".repeat(64);

async function user(admin = false): Promise<string> {
  const id = randomUUID();
  await db.query("insert into auth.users (id, raw_user_meta_data) values ($1, $2)", [
    id, JSON.stringify({ full_name: "Conta de teste", role: "admin" }),
  ]);
  if (admin) await db.query("update public.profiles set role = 'admin' where id = $1", [id]);
  return id;
}

async function authenticated<T>(id: string, work: (tx: Transaction) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [id]);
    return work(tx);
  });
}

async function balance(id: string) {
  return (await db.query<{ saldo: number }>("select saldo from public.credit_wallets where user_id = $1", [id])).rows[0].saldo;
}

async function reserve(id: string, ref: string, action = "search", business: string | null = null, service = "sites", inputHash = hash) {
  return (await db.query<{ id: string; cost: number; status: string }>(
    "select * from public.reserve_credit_action($1, $2, $3, $4, $5, $6)",
    [id, action, business, service, inputHash, ref],
  )).rows[0];
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create schema extensions;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
  `);
  const directory = path.resolve(process.cwd(), "../../supabase/migrations");
  for (const file of (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = await readFile(path.join(directory, file), "utf8");
    // PGlite has core gen_random_uuid; pgcrypto installation is Supabase-specific.
    await db.exec(sql.replace(/^create extension if not exists pgcrypto with schema extensions;$/m, ""));
  }
}, 60_000);

beforeEach(async () => {
  await db.exec(`
    update public.credit_settings set welcome_credits = 50;
    update public.credit_action_rules set cost = case action
      when 'search' then 4 when 'generate_image' then 2 when 'generate_site' then 5 else null end,
      enabled = action in ('search', 'generate_image', 'generate_site');
  `);
});

afterAll(async () => { await db?.close(); });

describe("migrations de créditos em PostgreSQL embarcado", () => {
  it("registra 50 créditos de boas-vindas no ledger sem confiar no role da metadata", async () => {
    const id = await user();
    expect(await balance(id)).toBe(50);
    expect((await db.query<{ role: string }>("select role from public.profiles where id = $1", [id])).rows[0].role).toBe("user");
    const ledger = await db.query<{ delta: number; ref: string }>("select delta, ref from public.credit_ledger where user_id = $1", [id]);
    expect(ledger.rows).toEqual([{ delta: 50, ref: "welcome:v1" }]);
  });

  it("cobra uma vez por busca, sem vincular a cobrança ao número de empresas", async () => {
    const id = await user();
    const first = await reserve(id, "busca-1");
    expect(first.cost).toBe(4);
    expect(await reserve(id, "busca-1")).toEqual(first);
    expect(await balance(id)).toBe(46);
    await expect(reserve(id, "busca-1", "search", null, "sites", "b".repeat(64))).rejects.toThrow("Idempotency reference conflict");
    expect(await balance(id)).toBe(46);
  });

  it("cobra sites e imagens individualmente por estabelecimento", async () => {
    const id = await user();
    await reserve(id, "site-a", "generate_site", "place:a");
    await reserve(id, "site-b", "generate_site", "place:b");
    await reserve(id, "imagem-a", "generate_image", "place:a", "design");
    expect(await balance(id)).toBe(38);
    await expect(reserve(id, "site-a", "generate_site", "place:b")).rejects.toThrow("Idempotency reference conflict");
    await expect(reserve(id, "imagem-sem-empresa", "generate_image", null, "design")).rejects.toThrow("Invalid business scope");
  });

  it("falha sem saldo e não deixa operação ou ledger parcial", async () => {
    const id = await user();
    await db.query("select public.consume_credits($1, 48, 'teste', 'consumo-inicial')", [id]);
    await expect(reserve(id, "sem-saldo")).rejects.toThrow("Insufficient credits");
    expect(await balance(id)).toBe(2);
    expect((await db.query("select id from public.credit_operations where user_id = $1", [id])).rows).toHaveLength(0);
  });

  it("devolve o custo original uma única vez após falha", async () => {
    const id = await user();
    await reserve(id, "falha");
    await db.exec("update public.credit_action_rules set cost = 12 where action = 'search'");
    await db.query("select * from public.settle_credit_action($1, 'falha', 'refunded')", [id]);
    await db.query("select * from public.settle_credit_action($1, 'falha', 'refunded')", [id]);
    expect(await balance(id)).toBe(50);
    await expect(db.query("select * from public.settle_credit_action($1, 'falha', 'completed')", [id])).rejects.toThrow("Operation already settled");
  });

  it("não estorna operação já entregue e aceita confirmação repetida", async () => {
    const id = await user();
    await reserve(id, "entregue");
    await db.query("select * from public.settle_credit_action($1, 'entregue', 'completed')", [id]);
    await db.query("select * from public.settle_credit_action($1, 'entregue', 'completed')", [id]);
    await expect(db.query("select * from public.settle_credit_action($1, 'entregue', 'refunded')", [id])).rejects.toThrow("Operation already settled");
    expect(await balance(id)).toBe(46);
  });

  it("bloqueia estratégias e conversas até configurar a tarifa", async () => {
    const id = await user();
    for (const action of ["deep_strategy", "sales_reply"]) {
      await expect(reserve(id, action, action, "place:a")).rejects.toThrow("Action pricing not configured");
    }
    expect(await balance(id)).toBe(50);
  });

  it("respeita compatibilidade de ferramentas e mantém catálogo SQL/TypeScript alinhado", async () => {
    const id = await user();
    await expect(reserve(id, "site-para-video", "generate_site", "place:a", "edicao_video")).rejects.toThrow("Action incompatible");
    await expect(reserve(id, "foto-sintetica", "generate_image", "place:a", "fotografia")).rejects.toThrow("Action incompatible");
    const rows = (await db.query<{ slug: string; enabled_actions: string[] }>("select slug, enabled_actions from public.services_catalog")).rows;
    expect(rows.map((row) => row.slug).sort()).toEqual(services.map((service) => service.id).sort());
    for (const service of services) {
      expect(rows.find((row) => row.slug === service.id)?.enabled_actions.sort()).toEqual(
        ["search", "deep_strategy", "sales_reply", ...service.actions].sort(),
      );
    }
  });

  it("isola usuários por RLS e impede auto-promoção e débitos pelo browser", async () => {
    const a = await user();
    await user();
    await authenticated(a, async (tx) => {
      expect((await tx.query<{ user_id: string }>("select user_id from public.credit_wallets")).rows).toEqual([{ user_id: a }]);
    });
    await expect(authenticated(a, (tx) => tx.exec("update public.profiles set role = 'admin'"))).rejects.toThrow("permission denied");
    await expect(authenticated(a, (tx) => tx.query("select public.consume_credits($1, 1, 'fraude', 'fraude')", [a]))).rejects.toThrow("permission denied");
    await expect(authenticated(a, (tx) => tx.query("select * from public.reserve_credit_action($1, 'search', null, 'sites', $2, 'fraude')", [a, hash]))).rejects.toThrow("permission denied");
    await expect(authenticated(a, (tx) => tx.query("select public.configure_credit_action('search', 1, true, 'fraude')"))).rejects.toThrow("Admin access required");
  });

  it("admin altera custos e bônus com auditoria; reservas antigas preservam o preço", async () => {
    const admin = await user(true);
    const a = await user();
    const old = await reserve(a, "antes");
    await authenticated(admin, async (tx) => {
      await tx.query("select public.configure_credit_action('search', 7, true, 'Ajuste de custo')");
      await tx.query("select public.configure_welcome_credits(60, 'Novo bônus de cadastro')");
    });
    expect((await reserve(a, "antes")).cost).toBe(old.cost);
    expect((await reserve(a, "depois")).cost).toBe(7);
    expect(await balance(a)).toBe(39);
    expect(await balance(await user())).toBe(60);
    expect((await db.query("select id from public.audit_log where ator = $1", [admin])).rows).toHaveLength(2);
  });

  it("concede créditos configurados do plano uma vez por ciclo confirmado", async () => {
    const id = await user();
    const admin = await user(true);
    const planId = randomUUID();
    await db.query("insert into public.plans (id, slug, nome, preco_centavos, creditos_mensais, ativo) values ($1, $2, 'Plano de teste', 2490, 150, true)", [planId, `teste-${planId}`]);
    await db.query("select * from public.grant_plan_allowance($1, $2, 'stripe:invoice:teste')", [id, planId]);
    await authenticated(admin, (tx) => tx.query("select public.configure_plan_credits($1, 200, 'Novo limite do plano')", [planId]));
    await db.query("select * from public.grant_plan_allowance($1, $2, 'stripe:invoice:teste')", [id, planId]);
    expect(await balance(id)).toBe(200);
    await db.query("select * from public.grant_plan_allowance($1, $2, 'stripe:invoice:proximo')", [id, planId]);
    expect(await balance(id)).toBe(400);
  });
});
