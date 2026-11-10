import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Remove todos os objetos sob um prefixo do bucket (inclusive
 * subpastas — pastas no Storage são virtuais: entradas com id nulo).
 * Best-effort: falhas de rede não sobem — o chamador decide se ignora.
 */
export async function wipePrefix(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<number> {
  const paths: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let offset = 0;
    for (;;) {
      const { data } = await admin.storage.from(bucket).list(dir, {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (!data?.length) return;
      for (const item of data) {
        const p = dir ? `${dir}/${item.name}` : item.name;
        if (item.id === null) await walk(p);
        else paths.push(p);
      }
      if (data.length < 1000) return;
      offset += data.length;
    }
  };
  await walk(prefix);
  for (let i = 0; i < paths.length; i += 500) {
    await admin.storage.from(bucket).remove(paths.slice(i, i + 500));
  }
  return paths.length;
}
