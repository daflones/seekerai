import { createClient } from "@supabase/supabase-js";
const url = process.env.SB_URL, key = process.env.SB_KEY;
const db = createClient(url, key, { auth: { persistSession: false } });
const email = "devin-e2e@seekerai.test";
const password = "Devin-E2E-" + Math.random().toString(36).slice(2, 10) + "!";

// 1. usuário de teste
let { data: list } = await db.auth.admin.listUsers({ perPage: 200 });
let user = (list?.users ?? []).find(u => u.email === email);
if (!user) {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) { console.log("createUser ERR:", error.message); process.exit(1); }
  user = data.user;
  console.log("user criado:", user.id);
} else {
  await db.auth.admin.updateUserById(user.id, { password });
  console.log("user existente:", user.id);
}

// 2. profile: admin (burst nos checks de plano) + consentimento/onboarding
await db.from("profiles").update({
  role: "admin", consentimento_em: new Date().toISOString(), onboarding_concluido: true,
}).eq("id", user.id);

// 3. assinatura king ativa
const { data: king } = await db.from("plans").select("id").eq("slug", "king").single();
await db.from("subscriptions").delete().eq("user_id", user.id);
const { error: subErr } = await db.from("subscriptions").insert({
  user_id: user.id, plan_id: king.id, provider: "manual", status: "active",
  current_period_end: new Date(Date.now() + 30 * 864e5).toISOString(),
});
if (subErr) console.log("sub ERR:", subErr.message);

// 4. login → access_token
const anon = createClient(url, process.env.SB_ANON, { auth: { persistSession: false } });
const { data: sess, error: authErr } = await anon.auth.signInWithPassword({ email, password });
if (authErr) { console.log("login ERR:", authErr.message); process.exit(1); }
console.log("TOKEN:" + sess.session.access_token);
