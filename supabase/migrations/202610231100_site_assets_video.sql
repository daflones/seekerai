-- Vídeos dos estabelecimentos também moram no bucket `site-assets`.
-- O bucket é criado/atualizado por scripts/apply-site.mjs (createBucket com
-- allowedMimeTypes incluindo video/*) porque storage.buckets não existe nos
-- testes pglite. Mantido como no-op para preservar o histórico aplicado.
select 1;
