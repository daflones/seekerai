# Verification

- Existing development/build/test commands are documented in `docs/RUNBOOK.md`.
- Landing browser checks: run a dev server, then set `LANDING_TEST_URL` to its origin and run `node scripts/check-landing.mjs`. The default origin for this script is `http://localhost:3001`. It uses Edge locally and Playwright Chromium in CI.
- The landing check exercises six languages, both themes, and 320/390/768/1024/1440 px widths. It mocks demo-search responses, blocks analytics, and does not save settings or generate paid content.
- Landing settings/RPC regression tests: `npm run test --workspace=@seekerai/web -- src/lib/landing-content.test.ts src/lib/landing-content.database.test.ts src/lib/landing-route.test.ts src/lib/landing-server.test.ts src/lib/i18n/landing-messages.test.ts`.
- The isolated landing database test uses PGlite with minimal schema fixtures. The older full billing migration suite requires `pg_cron`, which is unavailable in PGlite; do not change production migrations to bypass that environment limitation.
- Auth E2E (`npm run test:auth:e2e`): `tests/fixtures/start-auth-app.mjs` sets `SEEKERAI_E2E_CAPTCHA=1` / `NEXT_PUBLIC_SEEKERAI_E2E_CAPTCHA=1` so `next dev` exercises the real Turnstile + GoTrue captcha path (widget mocked by route interception, captcha validated by `tests/fixtures/mock-supabase.mjs`). Without the flag, dev mode bypasses captcha entirely (`DEV_NO_CAPTCHA` in the auth route and `auth-form.tsx`).
