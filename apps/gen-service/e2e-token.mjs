import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.SB_URL, process.env.SB_KEY, { auth: { persistSession: false } });
const { data, error } = await db.auth.admin.generateLink({
  type: "magiclink", email: "devin-e2e@seekerai.test",
});
if (error) { console.log("ERR:", error.message); process.exit(1); }
const link = data.properties?.action_link;
console.log("LINK:" + link);
