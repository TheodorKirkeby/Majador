# MajaDor

Private household app for Theodor and Maja (shopping list first; calendar,
wishlist and movie ratings later). React + TypeScript + Vite, installed on the
phones as a PWA (no app stores), data in Supabase, hosted on GitHub Pages at
https://theodorkirkeby.github.io/Majador/ (Actions workflow deploys `main`; the
build uses base path `/Majador/`, so never hard-code root-absolute URLs).

## Shared Supabase database

This app shares ONE Supabase project (`upiaqzyucpcfaqsyagsq`) with other
personal projects. Each app owns exactly one schema and must never create or
alter objects outside it:

- **MajaDor** (this repo) — schema `majador`
- **NaboUlv** — schema `ulv`
- **NaboSvin** — schema `svin`
- **Advent calendar** — schema `advent`
- **tour-de-chambre** — schema `tdc`
- **plan2groom** — no DB objects, Realtime Broadcast only

MajaDor is the only app using Supabase Auth logins. `auth.users` is
project-wide; access to MajaDor data is gated by a row in `majador.members`
(checked by `majador.is_member()` in every RLS policy), not by merely having
an account.

### Keys

The legacy anon and service_role keys are DISABLED on this project. The app
uses the publishable key (committed in `.env`, public by design). There is no
service key in this repo and the Edge Function does not need one: it queries
as the calling user and uses SECURITY DEFINER RPCs (`push_targets`,
`remove_push_subscriptions`) for household-wide access. Secrets (the VAPID
private key) live in `.env.local`, which is gitignored.

### Migration rules

- `supabase/migrations/` holds only this repo's schema history. Numbering is
  per-repo.
- **File first, then run.** Every statement executed against the database must
  exist as a committed migration file before it is run. Claude writes the
  file; the user pastes it into the Supabase SQL Editor. Don't run
  `supabase db push`.
- A migration that touches shared objects (extensions, `public`, roles,
  `cron` jobs, Realtime config) must say so in its header comment.
- Grants are not auto-applied on this project. New tables need explicit
  GRANTs or clients fail with `42501 permission denied`. Grant nothing to
  `anon` — MajaDor has no logged-out access. New functions are executable by
  PUBLIC by default: revoke that and grant `authenticated` only.
- A migration that has already been run on the real database must not be
  edited; add a new one.

### Edge Functions and secrets

Function names and secrets are project-wide, so they are prefixed:
`majador-*` functions, `MAJADOR_*` secrets. Deploy with
`supabase functions deploy majador-push --project-ref upiaqzyucpcfaqsyagsq --use-api --no-verify-jwt`.

## PWA notes

- `src/sw.ts` is the service worker (precache + push). It must always show a
  notification on a push event, or iOS revokes the subscription.
- iOS only allows push when the app is opened from the home screen, and only
  asks for permission on a tap.
- The installed app is tied to its domain: changing the domain means both
  phones reinstall, log in and re-enable notifications.
