# Plan 01 — Auth + Landing

## Goal

Magic-link sign-in and public landing page on Vercel preview against Supabase Auth.

## Done when

- [x] `/` renders landing argument + calendar strip (fixture OK)
- [x] `/sign-in` → OTP → check-email state
- [x] `/auth/callback` honors `?next=`
- [ ] Round trip proven on deployed Supabase (not only local) — **your checklist**

## Work

1. [x] Supabase SSR client (`@supabase/ssr`)
2. [x] Middleware session refresh
3. [x] Landing Server Component (anonymous-readable)
4. [x] Sign-in client island for form only
5. [ ] Configure Auth redirect URLs in your Supabase project (see DEPLOYMENT.md)

## Local setup

1. Create a Supabase project.
2. Copy `.env.example` → `apps/web/.env.local` and fill URL + anon key.
3. Supabase → Authentication → URL configuration:
   - Site URL: `http://localhost:3001`
   - Redirect URLs: `http://localhost:3001/auth/callback`
4. Restart `npm run dev`
5. Open `/sign-in`, send a magic link, complete the round trip.

## References

[AUTH.md](../AUTH.md) · wireframe screens: Landing, Sign in, Check your email
