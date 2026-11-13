import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.SB_URL, process.env.SB_KEY, { auth: { persistSession: false } });
const { data, error } = await db.from("integration_secrets").select("*").limit(50);
console.log("err:", error?.message);
console.log("rows:", data?.length);
for (const r of data ?? []) console.log(Object.keys(r).join(","), "|", r.provedor, r.nome ?? r.chave ?? "?");
