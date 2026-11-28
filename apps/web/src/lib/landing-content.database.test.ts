import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
const adminId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const initial = { video_enabled: false, video_urls: {}, showcase_slugs: [] };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create function public.is_admin() returns boolean language sql as $$
      select coalesce(auth.uid() = '${adminId}'::uuid, false);
    $$;
    create table public.app_settings (key text primary key, value jsonb not null, updated_by uuid, updated_at timestamptz default now());
    create table public.audit_log (ator uuid, acao text, alvo text, diff jsonb);
    create table public.sites (slug text primary key, publicado boolean);
    insert into public.sites values ('site-publico', true), ('site-privado', false);
    grant usage on schema public, auth to authenticated, anon;
  `);
  await db.exec(await readFile(path.resolve(process.cwd(), "../../supabase/migrations/202611270000_landing_content.sql"), "utf8"));
}, 30_000);
afterAll(async () => { await db?.close(); });

async function save(value: unknown, user = adminId) {
  await db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    await tx.query("select public.configure_landing_content($1::jsonb)", [value === null ? null : JSON.stringify(value)]);
  });
}

describe("RPC auditada da landing", () => {
  it("nega escrita a usuários comuns e execução anônima", async () => {
    await expect(save(initial, userId)).rejects.toThrow("Admin access required");
    await expect(db.transaction(async (tx) => {
      await tx.exec("set local role anon");
      await tx.query("select public.configure_landing_content($1::jsonb)", [JSON.stringify(initial)]);
    })).rejects.toThrow(/permission denied/);
  });

  it("salva, alterna e registra o ator sem mudar outras configurações", async () => {
    await db.query("insert into public.app_settings (key, value) values ('landing_show_prices', 'false')");
    await save({ ...initial, video_enabled: true, video_urls: { pt: "https://youtu.be/dQw4w9WgXcQ" }, showcase_slugs: ["site-publico"] });
    await save(initial);
    const rows = await db.query<{ key: string; value: unknown }>("select key, value from public.app_settings order by key");
    expect(rows.rows).toEqual([{ key: "landing_content", value: initial }, { key: "landing_show_prices", value: false }]);
    const log = await db.query<{ ator: string; alvo: string }>("select ator, alvo from public.audit_log");
    expect(log.rows).toHaveLength(2);
    expect(log.rows.every((r) => r.ator === adminId && r.alvo === "landing_content")).toBe(true);
  });

  it("rejeita sites privados, inexistentes e valores inválidos sem escrita parcial", async () => {
    for (const value of [
      null, {}, { ...initial, video_enabled: "true" }, { ...initial, video_enabled: true },
      { ...initial, video_urls: { xx: "https://example.com/a.mp4" } },
      { ...initial, video_urls: { pt: "javascript:alert(1)" } },
      { ...initial, showcase_slugs: ["site-privado"] },
      { ...initial, showcase_slugs: ["site-inexistente"] },
      { ...initial, showcase_slugs: ["site-publico", "site-publico"] },
      { ...initial, showcase_slugs: [null] },
      { ...initial, private_key: "unexpected" },
    ]) await expect(save(value)).rejects.toThrow();
    expect((await db.query("select * from public.audit_log")).rows).toHaveLength(2);
  });
});
