# MajaDor

Private household app for Theodor and Maja. Installed on the phones as a PWA.

- `npm run dev` — local development
- `npm run build` — production build to `dist/` (GitHub Actions runs this and deploys to GitHub Pages on push to `main`)
- `supabase/migrations/` — SQL for the `majador` schema, pasted into the Supabase SQL Editor
- `supabase/functions/majador-push/` — Edge Function that sends push notifications

See [CLAUDE.md](CLAUDE.md) for the shared-database rules.
