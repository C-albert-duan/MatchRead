# Runbook — Private beta failure modes

Support cheat-sheet for the invite wave. Product UX already handles most of these; this is what to tell people.

## Auth / email

| Symptom | What it means | What to tell them |
|---|---|---|
| “Auth email rate limit hit…” | Built-in Supabase sender capped (even on Pro) | Wait a few minutes, try another inbox, or confirm custom SMTP ([SMTP.md](./SMTP.md)) |
| No email arrives | Spam / SMTP misconfig / rate limit | Check spam; founder checks Supabase Auth logs + Resend |
| Link opens wrong host (`0.0.0.0`, parking page, localhost on Preview) | Auth Site URL / Redirect allow-list wrong | Fix Supabase URL config ([FIRST-PRODUCTION.md](./FIRST-PRODUCTION.md)); send a **new** link |
| “That sign-in link is invalid or expired” | Used twice, expired, or exchange failed | Request a new link on `/sign-in` — invite `next` is preserved when present |
| Signed in but not in league | Callback lost `next` (fixed in Phase 12) or they closed the tab | Re-open the **invite URL** while signed in |

## Invites

| Symptom | What it means | What to tell them |
|---|---|---|
| “This invite is no longer valid” | Token unknown, or commissioner **revoked** / rotated the link | Ask commissioner for a fresh invite from league home |
| Preview shows league name but join fails | Race / RLS / already revoked mid-click | Refresh invite link; retry **Join** button |
| Already a member | Re-opened old invite | They’re in — send them to `/leagues` |

There is **no calendar expiry** on invites today — validity is revoke-and-reissue only.

## Offline / app errors

| Symptom | What it means | What to tell them |
|---|---|---|
| “You are offline…” banner | Browser offline | Reconnect; picks may fail to save until online |
| Global “We hit a snag” | Uncaught UI error | Try again; re-open invite if joining |
| 404 “This page does not exist” | Bad URL or stale path | Home / My leagues; request new invite if joining |

## Founder tools

| Symptom | What it means | What to tell them |
|---|---|---|
| Denied on `/founder` | Email not in `FOUNDER_EMAILS` | Add address on Vercel/Docker env and redeploy |
| Beta banner on founder pages | `FOUNDER_EMAILS` unset | Expected in open beta; set env before public |

## Commissioner checklist before blaming the app

1. Custom SMTP enabled?  
2. Preview/prod Auth redirect URLs include this host?  
3. Invite not revoked after copying an old link?  
4. Friend completed magic link on the **same** host as the invite?
