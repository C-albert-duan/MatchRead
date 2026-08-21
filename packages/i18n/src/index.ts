export type Locale = "en" | "es" | "ja";

export const defaultLocale: Locale = "en";

export const locales: Locale[] = ["en", "es", "ja"];

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "en" || value === "es" || value === "ja";
}

const en = {
  "landing.eyebrow": "Tennis leagues",
  "landing.title": "Follow the tennis season with your people.",
  "landing.lede":
    "Start a league, share one link, and fill in a bracket together. One tournament, or a whole year — the league carries on between them.",
  "landing.hero.lede":
    "Your league. One bracket. The Daily Check every morning — what happened today, and did you move?",
  "landing.cta.leagues": "Go to my leagues",
  "landing.cta.bracket": "Fill a bracket",
  "landing.cta.start": "Start a league",
  "landing.cta.look": "See what it looks like",
  "landing.cue.tours": "ATP · WTA",
  "landing.cue.season": "2026 season",
  "landing.cue.singles": "Singles draws",
  "landing.chip.onCourt": "On court",
  "landing.chip.drawsOpen": "{n} draws open",
  "landing.chip.drawOpenOne": "One draw open",
  "landing.close.title": "Invite whoever you'd text about a five-setter.",
  "landing.footer.mark": "MatchRead · 2026 season",
  "surface.hard": "Hard",
  "surface.clay": "Clay",
  "surface.grass": "Grass",
  "surface.indoor": "Indoor",
  "surface.carpet": "Carpet",
  "surface.unknown": "Surface TBA",
  "chip.onCourt": "On court",
  "chip.onCourt.hint": " — matches in play now",
  "chip.upcoming": "Upcoming",
  "daily.yours": "Your Daily Check",
  "bracket.notPlayed": "Not played",
  "landing.calendar.title": "On the calendar",
  "landing.calendar.lede":
    "Pick an event and fill a bracket — no league needed to start. Invite friends when you want company.",
  "landing.calendar.heading.openOne": "One draw is open right now.",
  "landing.calendar.heading.openMany": "{n} draws are open right now.",
  "landing.calendar.heading.none": "No draws are open right now.",
  "landing.calendar.heading.onCourt": "Events are on court.",
  "landing.calendar.openNow": "Open now",
  "landing.calendar.openNow.empty":
    "No draws open right now — brackets unlock when the next draw lands.",
  "landing.calendar.onCourt": "On court",
  "landing.calendar.upcoming": "Upcoming",
  "landing.calendar.upcoming.empty.next":
    "Between events. Next up for {tour}: {name}.",
  "landing.calendar.upcoming.empty.both":
    "Between events. Next: {atp} (ATP) · {wta} (WTA).",
  "landing.calendar.upcoming.empty.none":
    "Between events — the next tournament lands when the season calendar is confirmed.",
  "landing.how.title": "How it works",
  "landing.how.lede": "Fill a bracket first. Invite friends later.",
  "landing.how.body": "Come back for the Daily Check.",
  "landing.daily.title": "The Daily Check",
  "landing.daily.heading": "The reason to open it on a Tuesday.",
  "landing.daily.body":
    "Not a dashboard. One computed sentence about what changed overnight, and the numbers behind it. If nothing moved, it says so.",
  "landing.daily.seeLeague": "See a full league",
  "landing.daily.sample.line": "Up 4 places overnight.",
  "landing.daily.sample.detail": "You are 3rd in Sunday Doubles.",
  "landing.daily.sample.note": "Your champion is still standing.",
  "landing.daily.sample.when": "This morning",
  "landing.daily.stat.settled": "Settled",
  "landing.daily.stat.correct": "Correct",
  "landing.daily.stat.points": "Points",
  "landing.daily.stat.places": "Places",
  "landing.how.1.title": "Fill in the draw",
  "landing.how.1.body":
    "Pick a winner for every match, all the way to the champion. No league required.",
  "landing.how.2.title": "Invite friends",
  "landing.how.2.body":
    "Share one link when you want company. The same bracket becomes the league field.",
  "landing.how.3.title": "Lock and settle",
  "landing.how.3.body":
    "Edits stop at lock. As matches finish, your score updates — and standings if you have a league.",
  "landing.how.4.title": "Check it tomorrow",
  "landing.how.4.body": "Standings move as matches finish.",

  "nav.leagues": "Leagues",
  "nav.calendar": "Calendar",
  "nav.signIn": "Sign in",
  "nav.signOut": "Sign out",
  "nav.back": "Back",
  "nav.loading": "Loading…",
  "cta.startLeague": "Start a league",
  "cta.fillBracket": "Fill a bracket",
  "nav.signedInAs": "Signed in as",

  "leagues.empty.title": "No brackets yet",
  "leagues.empty.body":
    "Fill a tournament bracket on your own, or start a league and invite your group.",
  "leagues.solo.badge": "Solo bracket",
  "leagues.solo.caption": "Just you — invite friends anytime before lock",
  "league.solo.eyebrow": "Your bracket",
  "league.solo.home": "My events",
  "league.grow.solo.title": "Compare it with someone",
  "league.grow.solo.lede":
    "A bracket alone is a complete entry. Invite friends and the same picks count in the league.",
  "bracket.solo.invite.title": "Compare it with someone",
  "bracket.solo.invite.body":
    "Invite friends into this bracket. They fill their own — yours stays put.",
  "bracket.solo.invite.cta": "Invite friends",
  "result.solo.scoreEyebrow": "Your score",
  "tournament.solo.scoreTitle": "Your score",
  "tournament.solo.noStandings":
    "Standings appear when someone joins your league. Until then, this is your score alone.",

  "daily.frame.today": "Today",
  "daily.frame.morning": "This morning",
  "daily.frame.live": "Live now",
  "daily.frame.tonight": "Tonight",
  "daily.frame.between": "Between tournaments",
  "daily.headline.ready": "Your league is ready.",
  "daily.headline.quiet": "A quiet day in your league.",
  "daily.headline.championOut": "Your champion is out.",
  "daily.live": "Live",
  "daily.title": "Daily Check",
  "daily.cta.openBracket": "Open my bracket",
  "daily.cta.viewBracket": "View my bracket",
  "daily.cta.invite": "Invite friends",
  "daily.cta.seeResult": "See the full result",
  "daily.cta.openTournament": "Open tournament",

  "founder.eyebrow": "Ops",
  "founder.title": "Founder health",
  "founder.lede":
    "Read-only pulse for private beta. Counts are what your session can see under RLS.",
  "founder.beta":
    "FOUNDER_EMAILS is unset — any signed-in user can open founder tools (beta).",
  "founder.denied": "This account is not on the founder list.",
  "founder.note.noServiceRole":
    "No service-role key in the browser or Next public env. Writes use the signed-in session and existing RLS.",
  "founder.link.disruption": "Draw disruption / void",
  "founder.link.integrity": "Draw integrity & repairs",
  "founder.integrity.title": "Draw integrity",
  "founder.integrity.lede":
    "Publication is gated. Blocking errors keep a draw pending; repair runs show what reconcile changed.",
  "founder.integrity.killSwitch":
    "Incident kill switch: update tournaments set product_override = 'force_off' where slug = '…';",
  "founder.integrity.back": "Back to founder health",
  "founder.integrity.reports": "Integrity reports",
  "founder.integrity.reportsEmpty": "No integrity reports yet.",
  "founder.integrity.repairs": "Repair runs",
  "founder.integrity.repairsEmpty": "No repair runs logged yet.",
  "founder.integrity.alerts": "Integrity alerts",
  "founder.integrity.alertsEmpty": "No integrity alerts yet.",
  "founder.integrity.safe": "Safe",
  "founder.integrity.blocked": "Blocked",
  "founder.stat.leagues": "Leagues",
  "founder.stat.members": "Members (approx)",
  "founder.stat.submitted": "Submitted brackets",
  "founder.stat.snapshots": "Bracket snapshots",
  "founder.stat.results": "Match results",
  "founder.stat.lastRanked": "Last snapshot ranked_at",
  "founder.stat.none": "None yet",
  "founder.ops.title": "Errors and events",
  "founder.ops.empty": "Nothing captured yet. Open a public tournament page, then refresh this list.",
  "founder.replacements.title": "Draw replacements",
  "founder.replacements.empty": "No lucky-loser / withdrawal seat changes detected yet.",
  "founder.ops.kind.error": "Error",
  "founder.ops.kind.event": "Event",

  "disruption.eyebrow": "Ops",
  "disruption.title": "Draw disruption",
  "disruption.lede":
    "Mark a withdrawal so members lose a pick — not a miss. Voided picks come off the ceiling; they are not scored wrong.",
  "disruption.preview":
    "Anyone who picked this player from the chosen round onward loses that pick (void), not a miss. Re-run settlement afterwards so standings catch up.",
  "disruption.submit": "Record void",
  "disruption.submitting": "Recording…",
  "disruption.after":
    "Void recorded. Re-run settlement on each affected league so standings catch up.",

  "offline.banner":
    "You are offline. Changes may not save until you reconnect.",
  "error.generic": "Something went wrong.",
  "locale.label": "Language",

  // Auth
  "signin.title": "Sign in to MatchRead",
  "signin.lede":
    "We email you a link and a code. No password — a new address gets an account the first time it signs in. Pick a display name so league mates recognize you in standings.",
  "signin.email": "Email",
  "signin.displayName": "Display name",
  "signin.displayName.hint": "How you appear in standings",
  "signin.sendLink": "Send me a link",
  "signin.sending": "Sending",
  "signin.checkEmail.title": "A sign-in link is on its way.",
  "signin.checkEmail.lede":
    "We sent it to {email}. Prefer the verification code if your mail app previews links (that burns one-time URLs).",
  "signin.otp": "Verification code",
  "signin.verify": "Verify code",
  "signin.verifying": "Checking",
  "signin.resend": "Send it again",
  "signin.resendWait": "Send it again ({s}s)",
  "signin.differentEmail": "Use a different address",
  "signin.remember": "Stay signed in on this device",
  "signin.remember.hint":
    "You won't need a new email link every visit. Uncheck on shared computers.",
  "signin.redirectNote":
    "Or click the email link once in this same browser — do not paste a link you already opened. Redirect target: {url}",
  "signin.errors.invalidEmail": "Enter a valid email address.",
  "signin.errors.invalidDisplayName": "Enter a display name (2–32 characters).",
  "signin.errors.generic": "Could not finish sign-in. Request a new link below.",
  "signin.errors.rateLimited":
    "Auth email rate limit hit (Supabase built-in sender is capped even on Pro). Wait a few minutes, check spam, try another inbox, or add custom SMTP in Supabase → Project Settings → Authentication → SMTP.",
  "signin.errors.otpExpired":
    "That email link was already used or burned by an email scanner. Request a new link, then either click it once in this browser — or type the verification code from the email below.",
  "signin.errors.authFailed":
    "That sign-in link is invalid or expired. Request a new one below — your invite destination is still saved.",
  "signin.errors.notConfigured":
    "Sign-in is not configured. Ask the host to check Supabase env on this deploy.",
  "signin.errors.invalidCode": "Enter the verification code from the email.",
  "signin.errors.codeExpired":
    "That code is invalid or expired. Request a new email and try the new code.",
  "signin.errors.sameEmailHint": "Enter the same email you used for the link.",
  "signin.eyebrow": "Sign in",
  "signin.checkEmail.eyebrow": "Check your email",
  "signin.wait": "Wait {s}s",

  // Welcome
  "welcome.eyebrow": "Welcome",
  "welcome.title": "Choose a display name",
  "welcome.lede":
    "This is how you appear in standings and league highlights — not your login. Email stays your sign-in.",
  "welcome.name": "Display name",
  "welcome.continue": "Continue",
  "welcome.hint": "2–32 characters. You can change this later.",
  "welcome.saving": "Saving",

  // League home / list
  "league.eyebrow": "League",
  "league.seasonStandings": "Season standings",
  "league.allLeagues": "All leagues",
  "league.openTournament": "Open tournament",
  "league.drawPendingCta": "Tournament (draw pending)",
  "league.grow.title": "Grow the league",
  "league.grow.lede":
    "Share one link. Friends join, fill brackets, and the Daily Check gets interesting.",
  "league.tournaments": "Tournaments",
  "league.members": "Members",
  "league.role.commissioner": "Commissioner",
  "league.role.member": "Member",
  "league.status.drawPending": "Draw pending",
  "league.status.drawOpen": "Draw open",
  "league.status.live": "On court",
  "league.status.complete": "Complete",
  "league.status.settled": "Settled",
  "league.format.single": "Single tournament",
  "league.format.season": "Season league",
  "league.home": "League home",
  "league.noTournaments": "No tournaments in the calendar yet.",
  "league.settings.title": "League settings",
  "league.settings.lede":
    "Change the display name or who can see the league. Format and tournament stay fixed.",
  "league.settings.save": "Save changes",
  "league.settings.saving": "Saving…",
  "league.settings.saved": "Saved.",
  "league.settings.danger": "Deleting removes the league, members, and brackets.",
  "league.settings.delete": "Delete league",
  "league.settings.deleteConfirm":
    "Delete this league permanently? Members and brackets will be removed.",
  "league.members.kick": "Remove",
  "league.members.kickConfirm": "Remove this member from the league?",
  "league.members.leave": "Leave league",
  "league.members.leaveConfirm": "Leave this league? You will need a new invite to rejoin.",

  "leagues.my.title": "My leagues",
  "leagues.my.lede":
    "Your groups. Open the one with something happening — or start the next one.",
  "leagues.status.bracketOpen": "Bracket open",
  "leagues.status.awaitingDraw": "Awaiting draw",
  "leagues.status.season": "Season",
  "leagues.members.count": "{n} members",
  "leagues.members.count.one": "{n} member",
  "leagues.recent.eyebrow": "Most recent",
  "leagues.recent.bracketSubmitted": "Bracket submitted",
  "leagues.recent.bracketDraft": "Bracket started — not submitted",
  "leagues.recent.bracketNone": "No bracket submitted",
  "leagues.recent.standing": "{n} of {field} · {score} points",
  "leagues.recent.openLeague": "Open league",
  "leagues.recent.up": "Up {n} places.",
  "leagues.recent.up.one": "Up 1 place.",
  "leagues.recent.down": "Down {n} places.",
  "leagues.recent.down.one": "Down 1 place.",
  "leagues.recent.detail": "You are {n} of {field} in {league}.",
  "leagues.recent.championAlive": "Your champion is still standing.",
  "leagues.recent.championOut": "Your champion is out.",

  // Tournament hub
  "tournament.leagueHome": "League home",
  "tournament.openBracket": "Open my bracket",
  "tournament.reviewBracket": "Review my bracket",
  "tournament.viewBracket": "View my bracket",
  "tournament.yourEntry": "Your entry",
  "tournament.eventStandings": "Event standings",
  "tournament.seeResult": "See my result",
  "tournament.drawPending.title": "Draw pending",
  "tournament.drawPending.body":
    "The full bracket is not published yet. First-round matches already named below are open to pick.",
  "tournament.announced.title": "First round so far",
  "tournament.announced.body":
    "{have} of {need} first-round matches are named. Pick those now; the rest appear when qualifying finishes.",
  "tournament.announced.body.locked":
    "{have} of {need} first-round matches are named. Entry is locked — you can look, not pick.",
  "tournament.announced.matchStarted": "Started",
  "tournament.locked": "Locked",
  "tournament.entry.submitted":
    "Your bracket is submitted. You can still edit until the lock.",
  "tournament.entry.draft":
    "Fill the tree, save as you go, then submit when every match has a pick.",
  "tournament.entry.locked":
    "The draw is locked. You can view your picks; they can no longer be changed.",
  "publicTournament.pickingOpens":
    "Picking opens when the official draw is published.",
  "publicTournament.startsIn": "Starts {countdown}.",
  "publicTournament.entryLocksIn": "Entry locks {countdown}.",
  "publicTournament.entryLocked": "Entry is locked.",
  "publicTournament.live": "This tournament is in play.",
  "publicTournament.complete": "This tournament has finished.",
  "publicTournament.whenPicking":
    "You can fill a bracket once the official draw is out, until entry locks.",
  "publicTournament.backCalendar": "All tournaments",
  "publicTournament.officialDraw": "Official draw",

  // Official results
  "results.title": "Official results",
  "results.lede":
    "Nothing is selected until a match finishes. Tap the winner for that match only — then come back for the next day. When you're ready, run settlement below.",
  "results.recorded": "{n} of {total} matches recorded",
  "results.clear": "Clear",
  "results.clearAll": "Clear all results",
  "results.settleAll": "Settle all leagues",
  "results.settling": "Settling…",
  "results.saved": "Saved",
  "results.notPlayed": "Not played",
  "results.saving": "Saving…",
  "results.done": "done",
  "results.inProgress": "in progress",
  "results.waitingEarlier":
    "Waiting on earlier rounds — record those winners first.",
  "results.busy.save": "Saving winner…",
  "results.busy.clear": "Clearing…",
  "results.busy.settle": "Settling leagues…",
  "results.msg.saved":
    "Saved: {name} won. Record more matches as they finish, then run settlement.",
  "results.msg.savedCleared":
    "Saved: {name} won. Later rounds were cleared — record them when those matches finish.",
  "results.msg.cleared": "Result cleared. Tap a winner when that match finishes.",
  "results.msg.clearedAll":
    "All official results cleared. Record matches one by one.",
  "results.vs": "vs",
  "results.bye": "Bye",
  "results.tbd": "TBD",
  "draw.tbd": "Qualifier / Lucky Loser",
  "draw.entry.wc": "WC",
  "draw.entry.pr": "PR",
  "draw.entry.q": "Q",
  "draw.entry.ll": "LL",

  // Settle
  "settle.run": "Run settlement",
  "settle.settling": "Settling…",
  "settle.hint":
    "Grades submitted brackets against official fixture results (server).",
  "settle.ok":
    "Settled {n} bracket(s). Open See my result (or Your result) to view the scorecard.",
  "settle.okZero":
    "Settlement ran, but nobody has clicked Submit my bracket yet — Your result stays empty until someone submits.",

  // Result page
  "result.title": "Your result",
  "result.finalPlace": "Final place",
  "result.score": "Score",
  "result.ofPerfect": "of perfect",
  "result.correct": "Correct",
  "result.misses": "Misses",
  "result.champion": "Champion",
  "result.season": "Season",
  "result.notAvailable": "Not yet available",
  "result.empty.submit":
    "Settlement only grades brackets that were submitted. Open your bracket and click Submit my bracket, then have the commissioner run settlement again.",
  "result.empty.noOfficial":
    "No official match winners are saved yet. Save at least one result on Official Results, then run settlement.",
  "result.empty.rerun":
    "Your bracket is submitted, but the last settlement did not include you. Ask the commissioner to click Run settlement again.",
  "result.empty.settle":
    "Official results are saved, but settlement has not graded any submitted brackets yet. On the tournament page, click Run settlement (partial results are fine).",
  "result.partialNote":
    "Partial official results are enough — you do not need the full tournament decided.",
  "result.myBracket": "My bracket",
  "result.tournament": "Tournament",
  "result.pickByPick": "Pick by pick",
  "result.pickByPick.lede":
    "Your pick vs the official winner for each decided match.",
  "result.you": "You",
  "result.official": "Official",
  "result.outcome.correct": "Correct",
  "result.outcome.miss": "Miss",
  "result.outcome.void": "Void",
  "result.outcome.awaiting": "Awaiting",
  "result.outcome.nopick": "No pick",
  "result.championBonus": "Champion bonus",
  "result.namingChampion": "Naming the champion",
  "result.alive.won": "won it",
  "result.alive.out": "out",
  "result.notGraded":
    "No matches have been graded yet. Your picks will appear here as official winners are recorded and settlement runs.",

  // Bracket
  "bracket.submit": "Submit my bracket",
  "bracket.submitted": "Submitted",
  "bracket.locked": "Locked",
  "bracket.picksMade": "{made} of {need} picks made",
  "bracket.saving": "Saving your bracket",
  "bracket.saved": "Bracket saved",
  "bracket.autosave": "Changes save automatically",
  "bracket.lock": "Lock this league's draw",
  "bracket.unlock": "Unlock this league",
  "bracket.offline":
    "You are offline. Bracket edits stay on this page until you reconnect.",
  "bracket.fail":
    "Your bracket did not save. Nothing has been lost — try again.",
  "bracket.completeHint":
    "Submit stays off until every match has a pick ({left} left). After a pick, set confidence 1–5.",
  "bracket.confidence": "Confidence",
  "bracket.page.lockedLede":
    "Locked — your picks are graded against official winners.",
  "bracket.page.lockedReadOnly": "Locked — picks are read-only.",
  "bracket.page.editLede":
    "Pick a winner in each match. Changes save automatically.",
  "bracket.page.title": "{name} bracket",
  "bracket.entrySubmitted": "Entry submitted for this league.",
  "bracket.lockedMsg": "This league's draw is locked. Brackets are read-only.",
  "bracket.unlockedMsg": "League lock cleared. Brackets are editable again.",
  "bracket.gradedHint":
    "Locked — green is a correct pick, red is a miss; official winners are marked.",
  "bracket.lockedHint": "This draw is locked.",
  "bracket.find.label": "Find a match",
  "bracket.find.placeholder": "Player name",
  "bracket.find.hint": "Type two letters to search the draw.",
  "bracket.find.empty": "No matches for that name.",

  // Engagement
  "engage.yourBracket": "Your bracket",
  "engage.health": "Health",
  "engage.perfectLeft": "Perfect picks left",
  "engage.perfectInLeague": "{n} perfect brackets in league",
  "engage.perfectInLeague.one": "{n} perfect bracket in league",
  "engage.highlights": "League Highlights",
  "health.Elite": "Elite",
  "health.Surviving": "Surviving",
  "health.Hanging On": "Hanging On",
  "health.In Trouble": "In Trouble",
  "highlight.Biggest Climber": "Biggest Climber",
  "highlight.Biggest Collapse": "Biggest Collapse",
  "highlight.Upset King": "Upset King",
  "highlight.Cold Streak": "Cold Streak",

  // Standings
  "standings.empty": "No standings yet. Submit brackets, then run settlement.",
  "standings.member": "Member",
  "standings.score": "Score",
  "standings.pts": "Pts",
  "standings.move": "Move",
  "standings.championOut": "champion out",
  "season.title": "Season standings",
  "season.lede":
    "Did you move? Points are scaled per event so a perfect 250 equals a perfect Slam on the table.",

  // Invite
  "invite.eyebrow": "Invite",
  "invite.title": "One link. Copy it into the group chat.",
  "invite.hint":
    "Anyone with this link can join after signing in. You can revoke it and issue a fresh one anytime.",
  "invite.copy": "Copy invite link",
  "invite.copied": "Copied",
  "invite.revoke": "Revoke and re-issue",
  "invite.cta": "Invite friends",
  "invite.close": "Close",
  "invite.working": "Working…",
  "invite.copyFailed": "Could not copy — select the link and copy manually.",
  "invite.revoked": "Old link revoked. Refresh if the URL below looks stale.",

  // Common
  "common.you": "You",
  "common.tournament": "Tournament",
  "common.leagueHome": "League home",
  "common.cancel": "Cancel",
  "common.create": "Create",

  // Create league form
  "create.eyebrow": "New league",
  "create.title": "Start a league",
  "create.lede":
    "Four decisions. Two of them cannot be changed afterwards, and both are marked.",
  "create.name": "League name",
  "create.name.placeholder": "Fourth Floor Slam Challenge",
  "create.format.legend": "Format — cannot be changed later",
  "create.format.single.body":
    "One draw, one table, and the league ends with the final.",
  "create.format.season.body":
    "Every event you add scores into a running table. The league keeps its people between tournaments.",
  "create.visibility.legend": "Who can see it",
  "create.visibility.private": "Private",
  "create.visibility.private.body":
    "Only people with the invite link. This is the default.",
  "create.visibility.public": "Public",
  "create.visibility.public.body":
    "Anyone can find and read the standings. Members still hold their picks until the lock.",
  "create.tournament": "Which tournament",
  "create.tournament.hint.before":
    "These are calendar events from the tour schedule, not your existing leagues. This form always starts a",
  "create.tournament.hint.new": "new",
  "create.tournament.hint.mid": "league. Your private leagues stay on",
  "create.tournament.hint.myLeagues": "My leagues",
  "create.tournament.hint.after":
    ". The draw does not have to exist yet — members join now and the bracket opens when it lands.",
  "create.submit": "Create league",
  "create.creating": "Creating",

  // Join invite
  "join.eyebrow": "Invite",
  "join.invalid.title": "This invite is no longer valid",
  "join.invalid.revoked":
    "The commissioner revoked this link. Ask them for a fresh one.",
  "join.invalid.missing":
    "The link may have been replaced, or it never existed.",
  "join.home": "Go to MatchRead",
  "join.invited": "You're invited to {name}",
  "join.signIn": "Sign in and join",
  "join.format": "Format",
  "join.members": "Members",
  "join.tournament": "Tournament",
  "join.cta": "Join this league",
  "join.joining": "Joining",
  "join.backLeagues": "Back to my leagues",
  "join.lede":
    "Brackets open when the draw lands. Join now so you're in the group when it does.",
  "join.afterLink":
    "After the magic link, you'll land in the league automatically.",

  // Calendar page
  "calendar.eyebrow": "Calendar",
  "calendar.title": "Tournament calendar",
  "calendar.lede":
    "Open an event to fill a bracket — alone first, or into a league you already have.",
  "calendar.drawOpen": "draw open",
  "calendar.drawPending": "draw pending",
  "calendar.entryLocks": "entry locks",
  "calendar.starts": "starts",
  "calendar.today": "Today",
  "calendar.tomorrow": "Tomorrow",
  "calendar.open": "Open",
  "calendar.onCourt": "On court",
  "calendar.empty": "No tournaments in the database yet.",
  "calendar.surfaceKey": "Court surface key",
  "calendar.dateTbc": "TBC",
  "tour.atp": "ATP",
  "tour.wta": "WTA",
} as const;

export type MessageKey = keyof typeof en;

const es: Record<MessageKey, string> = {
  "landing.eyebrow": "Ligas de tenis",
  "landing.title": "Sigue la temporada de tenis con tu gente.",
  "landing.lede":
    "Crea una liga, comparte un enlace y rellenad el cuadro juntos. Un torneo, o todo el año — la liga sigue entre eventos.",
  "landing.hero.lede":
    "Tu liga. Un cuadro. El Daily Check cada mañana — qué pasó hoy, y si te moviste.",
  "landing.cta.leagues": "Ir a mis ligas",
  "landing.cta.bracket": "Rellenar un cuadro",
  "landing.cta.start": "Crear una liga",
  "landing.cta.look": "Ver cómo se ve",
  "landing.cue.tours": "ATP · WTA",
  "landing.cue.season": "Temporada 2026",
  "landing.cue.singles": "Cuadros individuales",
  "landing.chip.onCourt": "En pista",
  "landing.chip.drawsOpen": "{n} cuadros abiertos",
  "landing.chip.drawOpenOne": "Un cuadro abierto",
  "landing.close.title": "Invita a quien le escribirías por un quinto set.",
  "landing.footer.mark": "MatchRead · temporada 2026",
  "surface.hard": "Dura",
  "surface.clay": "Tierra",
  "surface.grass": "Hierba",
  "surface.indoor": "Indoor",
  "surface.carpet": "Moqueta",
  "surface.unknown": "Superficie por confirmar",
  "chip.onCourt": "En pista",
  "chip.onCourt.hint": " — partidos en juego ahora",
  "chip.upcoming": "Próximo",
  "daily.yours": "Tu Daily Check",
  "bracket.notPlayed": "Sin jugar",
  "landing.calendar.title": "En el calendario",
  "landing.calendar.lede":
    "Elige un evento y rellena un cuadro — no hace falta una liga para empezar. Invita amigos cuando quieras compañía.",
  "landing.calendar.heading.openOne": "Hay un sorteo abierto ahora.",
  "landing.calendar.heading.openMany": "Hay {n} sorteos abiertos ahora.",
  "landing.calendar.heading.none": "No hay sorteos abiertos ahora.",
  "landing.calendar.heading.onCourt": "Hay eventos en pista.",
  "landing.calendar.openNow": "Abiertos ahora",
  "landing.calendar.openNow.empty":
    "No hay sorteos abiertos ahora — los cuadros se abren cuando llegue el próximo sorteo.",
  "landing.calendar.onCourt": "En pista",
  "landing.calendar.upcoming": "Próximos",
  "landing.calendar.upcoming.empty.next":
    "Entre eventos. Siguiente en {tour}: {name}.",
  "landing.calendar.upcoming.empty.both":
    "Entre eventos. Siguiente: {atp} (ATP) · {wta} (WTA).",
  "landing.calendar.upcoming.empty.none":
    "Entre eventos — el próximo torneo llega cuando se confirme el calendario de la temporada.",
  "landing.how.title": "Cómo funciona",
  "landing.how.lede": "Primero el cuadro. Invita después.",
  "landing.how.body": "Vuelve por el Daily Check.",
  "landing.daily.title": "El Daily Check",
  "landing.daily.heading": "La razón para abrirlo un martes.",
  "landing.daily.body":
    "No es un panel. Una frase calculada sobre lo que cambió por la noche, y los números detrás. Si no se movió nada, lo dice.",
  "landing.daily.seeLeague": "Ver una liga completa",
  "landing.daily.sample.line": "Subes 4 puestos de la noche a la mañana.",
  "landing.daily.sample.detail": "Vas 3º en Sunday Doubles.",
  "landing.daily.sample.note": "Tu campeón sigue en pie.",
  "landing.daily.sample.when": "Esta mañana",
  "landing.daily.stat.settled": "Resueltos",
  "landing.daily.stat.correct": "Acertados",
  "landing.daily.stat.points": "Puntos",
  "landing.daily.stat.places": "Puestos",
  "landing.how.1.title": "Rellena el cuadro",
  "landing.how.1.body":
    "Elige un ganador en cada partido hasta el campeón. No hace falta una liga.",
  "landing.how.2.title": "Invita amigos",
  "landing.how.2.body":
    "Comparte un enlace cuando quieras compañía. El mismo cuadro pasa a ser el campo de la liga.",
  "landing.how.3.title": "Cierre y liquidación",
  "landing.how.3.body":
    "Las ediciones paran al cierre. Al acabar partidos, sube tu puntuación — y la clasificación si hay liga.",
  "landing.how.4.title": "Míralo mañana",
  "landing.how.4.body":
    "La clasificación se mueve al terminar los partidos.",

  "nav.leagues": "Ligas",
  "nav.calendar": "Calendario",
  "nav.signIn": "Entrar",
  "nav.signOut": "Salir",
  "nav.back": "Atrás",
  "nav.loading": "Cargando…",
  "cta.startLeague": "Crear una liga",
  "cta.fillBracket": "Rellenar un cuadro",
  "nav.signedInAs": "Sesión de",

  "leagues.empty.title": "Aún no hay cuadros",
  "leagues.empty.body":
    "Rellena un cuadro tú solo, o crea una liga e invita a tu grupo.",
  "leagues.solo.badge": "Cuadro en solitario",
  "leagues.solo.caption": "Solo tú — invita antes del cierre",
  "league.solo.eyebrow": "Tu cuadro",
  "league.solo.home": "Mis eventos",
  "league.grow.solo.title": "Compáralo con alguien",
  "league.grow.solo.lede":
    "Un cuadro solo es una entrada válida. Invita amigos y los mismos picks cuentan en la liga.",
  "bracket.solo.invite.title": "Compáralo con alguien",
  "bracket.solo.invite.body":
    "Invita amigos a este cuadro. Ellos rellenan el suyo — el tuyo no se mueve.",
  "bracket.solo.invite.cta": "Invitar amigos",
  "result.solo.scoreEyebrow": "Tu puntuación",
  "tournament.solo.scoreTitle": "Tu puntuación",
  "tournament.solo.noStandings":
    "La clasificación aparece cuando alguien se une. Hasta entonces, esto es solo tu puntuación.",

  "daily.frame.today": "Hoy",
  "daily.frame.morning": "Esta mañana",
  "daily.frame.live": "En directo",
  "daily.frame.tonight": "Esta noche",
  "daily.frame.between": "Entre torneos",
  "daily.headline.ready": "Tu liga está lista.",
  "daily.headline.quiet": "Un día tranquilo en tu liga.",
  "daily.headline.championOut": "Tu campeón está fuera.",
  "daily.live": "En directo",
  "daily.title": "Daily Check",
  "daily.cta.openBracket": "Abrir mi cuadro",
  "daily.cta.viewBracket": "Ver mi cuadro",
  "daily.cta.invite": "Invitar amigos",
  "daily.cta.seeResult": "Ver el resultado completo",
  "daily.cta.openTournament": "Abrir torneo",

  "founder.eyebrow": "Ops",
  "founder.title": "Salud del fundador",
  "founder.lede":
    "Pulso de solo lectura para la beta privada. Los conteos son lo que tu sesión ve bajo RLS.",
  "founder.beta":
    "FOUNDER_EMAILS no está definido — cualquier usuario con sesión puede abrir las herramientas de fundador (beta).",
  "founder.denied": "Esta cuenta no está en la lista de fundadores.",
  "founder.note.noServiceRole":
    "Sin clave service-role en el navegador ni en env público de Next. Las escrituras usan la sesión y el RLS existente.",
  "founder.link.disruption": "Disrupción del cuadro / anulación",
  "founder.link.integrity": "Integridad del cuadro y reparaciones",
  "founder.integrity.title": "Integridad del cuadro",
  "founder.integrity.lede":
    "La publicación está condicionada. Los errores bloqueantes dejan el cuadro pendiente; las reparaciones muestran lo que reconcilió el sync.",
  "founder.integrity.killSwitch":
    "Apagado de incidente: update tournaments set product_override = 'force_off' where slug = '…';",
  "founder.integrity.back": "Volver a salud del fundador",
  "founder.integrity.reports": "Informes de integridad",
  "founder.integrity.reportsEmpty": "Aún no hay informes de integridad.",
  "founder.integrity.repairs": "Ejecuciones de reparación",
  "founder.integrity.repairsEmpty": "Aún no hay ejecuciones de reparación.",
  "founder.integrity.alerts": "Alertas de integridad",
  "founder.integrity.alertsEmpty": "Aún no hay alertas de integridad.",
  "founder.integrity.safe": "Seguro",
  "founder.integrity.blocked": "Bloqueado",
  "founder.stat.leagues": "Ligas",
  "founder.stat.members": "Miembros (aprox.)",
  "founder.stat.submitted": "Cuadros enviados",
  "founder.stat.snapshots": "Instantáneas de cuadro",
  "founder.stat.results": "Resultados de partido",
  "founder.stat.lastRanked": "Último ranked_at de instantánea",
  "founder.stat.none": "Todavía ninguno",
  "founder.ops.title": "Errores y eventos",
  "founder.ops.empty": "Aún no hay capturas. Abre una página pública de torneo y vuelve a esta lista.",
  "founder.replacements.title": "Reemplazos en el cuadro",
  "founder.replacements.empty": "Aún no se detectaron cambios de asiento (LL / baja).",
  "founder.ops.kind.error": "Error",
  "founder.ops.kind.event": "Evento",

  "disruption.eyebrow": "Ops",
  "disruption.title": "Disrupción del cuadro",
  "disruption.lede":
    "Marca un retiro para que los miembros pierdan una pick — no un fallo. Las picks anuladas bajan el techo; no cuentan como error.",
  "disruption.preview":
    "Quien haya elegido a este jugador desde la ronda indicada pierde esa pick (anulada), no un fallo. Después vuelve a ejecutar el settlement para actualizar la clasificación.",
  "disruption.submit": "Registrar anulación",
  "disruption.submitting": "Registrando…",
  "disruption.after":
    "Anulación registrada. Vuelve a ejecutar settlement en cada liga afectada para actualizar la clasificación.",

  "offline.banner":
    "Estás sin conexión. Es posible que los cambios no se guarden hasta que vuelvas a conectarte.",
  "error.generic": "Algo salió mal.",
  "locale.label": "Idioma",

  // Auth
  "signin.title": "Entrar en MatchRead",
  "signin.lede":
    "Te enviamos un enlace y un código por email. Sin contraseña — una dirección nueva crea cuenta la primera vez que entra. Elige un nombre visible para que tu liga te reconozca en la clasificación.",
  "signin.email": "Email",
  "signin.displayName": "Nombre visible",
  "signin.displayName.hint": "Cómo apareces en la clasificación",
  "signin.sendLink": "Enviarme un enlace",
  "signin.sending": "Enviando",
  "signin.checkEmail.title": "Un enlace de acceso está en camino.",
  "signin.checkEmail.lede":
    "Lo enviamos a {email}. Prefiere el código de verificación si tu app de correo previsualiza enlaces (eso quema los enlaces de un solo uso).",
  "signin.otp": "Código de verificación",
  "signin.verify": "Verificar código",
  "signin.verifying": "Comprobando",
  "signin.resend": "Enviarlo de nuevo",
  "signin.resendWait": "Enviarlo de nuevo ({s}s)",
  "signin.differentEmail": "Usar otra dirección",
  "signin.remember": "Mantener sesión en este dispositivo",
  "signin.remember.hint":
    "No necesitarás un enlace nuevo cada visita. Desmárcalo en equipos compartidos.",
  "signin.redirectNote":
    "O haz clic en el enlace del email una sola vez en este mismo navegador — no pegues un enlace que ya abriste. Destino de redirección: {url}",
  "signin.errors.invalidEmail": "Introduce una dirección de email válida.",
  "signin.errors.invalidDisplayName":
    "Introduce un nombre visible (2–32 caracteres).",
  "signin.errors.generic":
    "No se pudo completar el acceso. Solicita un enlace nuevo abajo.",
  "signin.errors.rateLimited":
    "Se alcanzó el límite de emails de acceso (el envío integrado de Supabase está limitado incluso en Pro). Espera unos minutos, revisa spam, prueba otra bandeja, o añade SMTP personalizado en Supabase → Project Settings → Authentication → SMTP.",
  "signin.errors.otpExpired":
    "Ese enlace de email ya se usó o fue consumido por un escáner de correo. Solicita un enlace nuevo y haz clic una sola vez en este navegador — o escribe el código de verificación del email abajo.",
  "signin.errors.authFailed":
    "Ese enlace de acceso no es válido o caducó. Solicita uno nuevo abajo — tu destino de invitación sigue guardado.",
  "signin.errors.notConfigured":
    "El acceso no está configurado. Pide al anfitrión que revise el env de Supabase en este despliegue.",
  "signin.errors.invalidCode": "Introduce el código de verificación del email.",
  "signin.errors.codeExpired":
    "Ese código no es válido o caducó. Solicita un email nuevo y prueba el código nuevo.",
  "signin.errors.sameEmailHint":
    "Introduce el mismo email que usaste para el enlace.",
  "signin.eyebrow": "Entrar",
  "signin.checkEmail.eyebrow": "Revisa tu email",
  "signin.wait": "Espera {s}s",

  // Welcome
  "welcome.eyebrow": "Bienvenido",
  "welcome.title": "Elige un nombre visible",
  "welcome.lede":
    "Así apareces en la clasificación y en los destacados de liga — no es tu acceso. El email sigue siendo tu inicio de sesión.",
  "welcome.name": "Nombre visible",
  "welcome.continue": "Continuar",
  "welcome.hint": "2–32 caracteres. Puedes cambiarlo más tarde.",
  "welcome.saving": "Guardando",

  // League home / list
  "league.eyebrow": "Liga",
  "league.seasonStandings": "Clasificación de temporada",
  "league.allLeagues": "Todas las ligas",
  "league.openTournament": "Abrir torneo",
  "league.drawPendingCta": "Torneo (sorteo pendiente)",
  "league.grow.title": "Haz crecer la liga",
  "league.grow.lede":
    "Comparte un enlace. Los amigos se unen, rellenan cuadros y el Daily Check se pone interesante.",
  "league.tournaments": "Torneos",
  "league.members": "Miembros",
  "league.role.commissioner": "Comisionado",
  "league.role.member": "Miembro",
  "league.status.drawPending": "Sorteo pendiente",
  "league.status.drawOpen": "Sorteo abierto",
  "league.status.live": "En pista",
  "league.status.complete": "Completo",
  "league.status.settled": "Liquidado",
  "league.format.single": "Torneo único",
  "league.format.season": "Liga de temporada",
  "league.home": "Inicio de liga",
  "league.noTournaments": "Aún no hay torneos en el calendario.",
  "league.settings.title": "Ajustes de la liga",
  "league.settings.lede":
    "Cambia el nombre o quién puede ver la liga. El formato y el torneo no se pueden cambiar.",
  "league.settings.save": "Guardar cambios",
  "league.settings.saving": "Guardando…",
  "league.settings.saved": "Guardado.",
  "league.settings.danger":
    "Borrar elimina la liga, los miembros y los brackets.",
  "league.settings.delete": "Eliminar liga",
  "league.settings.deleteConfirm":
    "¿Eliminar esta liga de forma permanente? Se quitarán miembros y brackets.",
  "league.members.kick": "Quitar",
  "league.members.kickConfirm": "¿Quitar a este miembro de la liga?",
  "league.members.leave": "Salir de la liga",
  "league.members.leaveConfirm":
    "¿Salir de esta liga? Necesitarás una nueva invitación para volver.",

  "leagues.my.title": "Mis ligas",
  "leagues.my.lede":
    "Tus grupos. Abre el que tenga movimiento — o crea el siguiente.",
  "leagues.status.bracketOpen": "Cuadro abierto",
  "leagues.status.awaitingDraw": "Esperando sorteo",
  "leagues.status.season": "Temporada",
  "leagues.members.count": "{n} miembros",
  "leagues.members.count.one": "{n} miembro",
  "leagues.recent.eyebrow": "Más reciente",
  "leagues.recent.bracketSubmitted": "Cuadro enviado",
  "leagues.recent.bracketDraft": "Cuadro empezado — sin enviar",
  "leagues.recent.bracketNone": "Sin cuadro enviado",
  "leagues.recent.standing": "{n} de {field} · {score} puntos",
  "leagues.recent.openLeague": "Abrir liga",
  "leagues.recent.up": "Subes {n} puestos.",
  "leagues.recent.up.one": "Subes 1 puesto.",
  "leagues.recent.down": "Bajas {n} puestos.",
  "leagues.recent.down.one": "Bajas 1 puesto.",
  "leagues.recent.detail": "Vas {n} de {field} en {league}.",
  "leagues.recent.championAlive": "Tu campeón sigue en pie.",
  "leagues.recent.championOut": "Tu campeón está fuera.",

  // Tournament hub
  "tournament.leagueHome": "Inicio de liga",
  "tournament.openBracket": "Abrir mi cuadro",
  "tournament.reviewBracket": "Revisar mi cuadro",
  "tournament.viewBracket": "Ver mi cuadro",
  "tournament.yourEntry": "Tu inscripción",
  "tournament.eventStandings": "Clasificación del evento",
  "tournament.seeResult": "Ver mi resultado",
  "tournament.drawPending.title": "Sorteo pendiente",
  "tournament.drawPending.body":
    "El cuadro completo aún no está publicado. Los partidos de primera ronda ya nombrados abajo se pueden elegir.",
  "tournament.announced.title": "Primera ronda hasta ahora",
  "tournament.announced.body":
    "{have} de {need} partidos de primera ronda tienen nombre. Elige esos ahora; el resto aparece cuando termine la qualy.",
  "tournament.announced.body.locked":
    "{have} de {need} partidos de primera ronda tienen nombre. La inscripción está bloqueada — puedes mirar, no elegir.",
  "tournament.announced.matchStarted": "En juego",
  "tournament.locked": "Bloqueado",
  "tournament.entry.submitted":
    "Tu cuadro está enviado. Puedes seguir editando hasta el bloqueo.",
  "tournament.entry.draft":
    "Rellena el árbol, guarda sobre la marcha y envía cuando cada partido tenga una pick.",
  "tournament.entry.locked":
    "El sorteo está bloqueado. Puedes ver tus picks; ya no se pueden cambiar.",
  "publicTournament.pickingOpens":
    "Las picks se abren cuando se publique el sorteo oficial.",
  "publicTournament.startsIn": "Empieza {countdown}.",
  "publicTournament.entryLocksIn": "La inscripción cierra {countdown}.",
  "publicTournament.entryLocked": "La inscripción está cerrada.",
  "publicTournament.live": "Este torneo está en juego.",
  "publicTournament.complete": "Este torneo ha terminado.",
  "publicTournament.whenPicking":
    "Podrás rellenar el cuadro cuando salga el sorteo oficial, hasta que cierre la inscripción.",
  "publicTournament.backCalendar": "Todos los torneos",
  "publicTournament.officialDraw": "Cuadro oficial",

  // Official results
  "results.title": "Resultados oficiales",
  "results.lede":
    "Nada se selecciona hasta que un partido termina. Toca al ganador solo de ese partido — y vuelve al día siguiente. Cuando estés listo, ejecuta el settlement abajo.",
  "results.recorded": "{n} de {total} partidos registrados",
  "results.clear": "Borrar",
  "results.clearAll": "Borrar todos los resultados",
  "results.settleAll": "Liquidar todas las ligas",
  "results.settling": "Liquidando…",
  "results.saved": "Guardado",
  "results.notPlayed": "No jugado",
  "results.saving": "Guardando…",
  "results.done": "hecho",
  "results.inProgress": "en progreso",
  "results.waitingEarlier":
    "Esperando rondas anteriores — registra esos ganadores primero.",
  "results.busy.save": "Guardando ganador…",
  "results.busy.clear": "Borrando…",
  "results.busy.settle": "Liquidando ligas…",
  "results.msg.saved":
    "Guardado: {name} ganó. Registra más partidos según terminen, luego ejecuta el settlement.",
  "results.msg.savedCleared":
    "Guardado: {name} ganó. Las rondas posteriores se borraron — regístralas cuando esos partidos terminen.",
  "results.msg.cleared":
    "Resultado borrado. Toca a un ganador cuando ese partido termine.",
  "results.msg.clearedAll":
    "Todos los resultados oficiales se borraron. Registra los partidos uno a uno.",
  "results.vs": "vs",
  "results.bye": "Bye",
  "results.tbd": "Por determinar",
  "draw.tbd": "Clasificado / Lucky loser",
  "draw.entry.wc": "WC",
  "draw.entry.pr": "PR",
  "draw.entry.q": "Q",
  "draw.entry.ll": "LL",

  // Settle
  "settle.run": "Ejecutar settlement",
  "settle.settling": "Liquidando…",
  "settle.hint":
    "Califica los cuadros enviados contra los resultados oficiales del fixture (servidor).",
  "settle.ok":
    "Se liquidaron {n} cuadro(s). Abre Ver mi resultado (o Tu resultado) para ver la tarjeta.",
  "settle.okZero":
    "El settlement se ejecutó, pero nadie ha pulsado Enviar mi cuadro todavía — Tu resultado queda vacío hasta que alguien envíe.",

  // Result page
  "result.title": "Tu resultado",
  "result.finalPlace": "Puesto final",
  "result.score": "Puntuación",
  "result.ofPerfect": "de lo perfecto",
  "result.correct": "Aciertos",
  "result.misses": "Fallos",
  "result.champion": "Campeón",
  "result.season": "Temporada",
  "result.notAvailable": "Aún no disponible",
  "result.empty.submit":
    "El settlement solo califica cuadros que fueron enviados. Abre tu cuadro y pulsa Enviar mi cuadro, luego pide al comisionado que ejecute el settlement de nuevo.",
  "result.empty.noOfficial":
    "Aún no hay ganadores oficiales guardados. Guarda al menos un resultado en Resultados oficiales y luego ejecuta el settlement.",
  "result.empty.rerun":
    "Tu cuadro está enviado, pero el último settlement no te incluyó. Pide al comisionado que pulse Ejecutar settlement de nuevo.",
  "result.empty.settle":
    "Los resultados oficiales están guardados, pero el settlement aún no ha calificado ningún cuadro enviado. En la página del torneo, pulsa Ejecutar settlement (resultados parciales están bien).",
  "result.partialNote":
    "Los resultados oficiales parciales son suficientes — no necesitas el torneo completo decidido.",
  "result.myBracket": "Mi cuadro",
  "result.tournament": "Torneo",
  "result.pickByPick": "Pick por pick",
  "result.pickByPick.lede":
    "Tu pick frente al ganador oficial de cada partido decidido.",
  "result.you": "Tú",
  "result.official": "Oficial",
  "result.outcome.correct": "Correcto",
  "result.outcome.miss": "Fallo",
  "result.outcome.void": "Anulado",
  "result.outcome.awaiting": "Pendiente",
  "result.outcome.nopick": "Sin pick",
  "result.championBonus": "Bonus de campeón",
  "result.namingChampion": "Nombrar al campeón",
  "result.alive.won": "lo ganó",
  "result.alive.out": "fuera",
  "result.notGraded":
    "Aún no se ha calificado ningún partido. Tus picks aparecerán aquí a medida que se registren ganadores oficiales y se ejecute el settlement.",

  // Bracket
  "bracket.submit": "Enviar mi cuadro",
  "bracket.submitted": "Enviado",
  "bracket.locked": "Bloqueado",
  "bracket.picksMade": "{made} de {need} picks hechas",
  "bracket.saving": "Guardando tu cuadro",
  "bracket.saved": "Cuadro guardado",
  "bracket.autosave": "Los cambios se guardan automáticamente",
  "bracket.lock": "Bloquear el sorteo de esta liga",
  "bracket.unlock": "Desbloquear esta liga",
  "bracket.offline":
    "Estás sin conexión. Las ediciones del cuadro se quedan en esta página hasta que reconectes.",
  "bracket.fail":
    "Tu cuadro no se guardó. No se ha perdido nada — inténtalo de nuevo.",
  "bracket.completeHint":
    "Enviar queda desactivado hasta que cada partido tenga una pick ({left} restantes). Tras elegir, define confianza 1–5.",
  "bracket.confidence": "Confianza",
  "bracket.page.lockedLede":
    "Bloqueado — tus picks se califican contra los ganadores oficiales.",
  "bracket.page.lockedReadOnly": "Bloqueado — las picks son de solo lectura.",
  "bracket.page.editLede":
    "Elige un ganador en cada partido. Los cambios se guardan automáticamente.",
  "bracket.page.title": "Cuadro de {name}",
  "bracket.entrySubmitted": "Inscripción enviada para esta liga.",
  "bracket.lockedMsg": "El sorteo de esta liga está bloqueado. Los cuadros son de solo lectura.",
  "bracket.unlockedMsg": "Bloqueo de liga eliminado. Los cuadros vuelven a ser editables.",
  "bracket.gradedHint":
    "Bloqueado — verde es un acierto, rojo es un fallo; los ganadores oficiales están marcados.",
  "bracket.lockedHint": "Este sorteo está bloqueado.",
  "bracket.find.label": "Buscar un partido",
  "bracket.find.placeholder": "Nombre del jugador",
  "bracket.find.hint": "Escribe dos letras para buscar en el cuadro.",
  "bracket.find.empty": "No hay partidos con ese nombre.",

  // Engagement
  "engage.yourBracket": "Tu cuadro",
  "engage.health": "Salud",
  "engage.perfectLeft": "Picks perfectas restantes",
  "engage.perfectInLeague": "{n} cuadros perfectos en la liga",
  "engage.perfectInLeague.one": "{n} cuadro perfecto en la liga",
  "engage.highlights": "Destacados de la liga",
  "health.Elite": "Élite",
  "health.Surviving": "Sobreviviendo",
  "health.Hanging On": "Aguantando",
  "health.In Trouble": "En apuros",
  "highlight.Biggest Climber": "Mayor escalada",
  "highlight.Biggest Collapse": "Mayor caída",
  "highlight.Upset King": "Rey de las sorpresas",
  "highlight.Cold Streak": "Racha fría",

  // Standings
  "standings.empty": "Aún no hay clasificación. Envía cuadros y ejecuta el settlement.",
  "standings.member": "Miembro",
  "standings.score": "Puntuación",
  "standings.pts": "Pts",
  "standings.move": "Movimiento",
  "standings.championOut": "campeón fuera",
  "season.title": "Clasificación de temporada",
  "season.lede":
    "¿Te moviste? Los puntos se escalan por evento para que un 250 perfecto equivalga a un Grand Slam perfecto en la tabla.",

  // Invite
  "invite.eyebrow": "Invitar",
  "invite.title": "Un enlace. Cópialo en el chat del grupo.",
  "invite.hint":
    "Cualquiera con este enlace puede unirse tras iniciar sesión. Puedes revocarlo y emitir uno nuevo cuando quieras.",
  "invite.copy": "Copiar enlace de invitación",
  "invite.copied": "Copiado",
  "invite.revoke": "Revocar y reemitir",
  "invite.cta": "Invitar amigos",
  "invite.close": "Cerrar",
  "invite.working": "Trabajando…",
  "invite.copyFailed":
    "No se pudo copiar — selecciona el enlace y copia manualmente.",
  "invite.revoked":
    "Enlace anterior revocado. Actualiza si la URL de abajo parece antigua.",

  // Common
  "common.you": "Tú",
  "common.tournament": "Torneo",
  "common.leagueHome": "Inicio de liga",
  "common.cancel": "Cancelar",
  "common.create": "Crear",

  "create.eyebrow": "Nueva liga",
  "create.title": "Crear una liga",
  "create.lede":
    "Cuatro decisiones. Dos no se pueden cambiar después, y ambas están marcadas.",
  "create.name": "Nombre de la liga",
  "create.name.placeholder": "Desafío Slam del cuarto piso",
  "create.format.legend": "Formato — no se puede cambiar después",
  "create.format.single.body":
    "Un sorteo, una tabla, y la liga termina con la final.",
  "create.format.season.body":
    "Cada evento que añadas suma a una tabla continua. La liga mantiene a su gente entre torneos.",
  "create.visibility.legend": "Quién puede verla",
  "create.visibility.private": "Privada",
  "create.visibility.private.body":
    "Solo quien tenga el enlace de invitación. Es la opción por defecto.",
  "create.visibility.public": "Pública",
  "create.visibility.public.body":
    "Cualquiera puede encontrar y leer la clasificación. Los miembros guardan sus picks hasta el cierre.",
  "create.tournament": "Qué torneo",
  "create.tournament.hint.before":
    "Estos son eventos del calendario del tour, no tus ligas existentes. Este formulario siempre crea una liga",
  "create.tournament.hint.new": "nueva",
  "create.tournament.hint.mid": ". Tus ligas privadas siguen en",
  "create.tournament.hint.myLeagues": "Mis ligas",
  "create.tournament.hint.after":
    ". El sorteo no tiene que existir aún — los miembros se unen ahora y el cuadro abre cuando llegue.",
  "create.submit": "Crear liga",
  "create.creating": "Creando",

  "join.eyebrow": "Invitación",
  "join.invalid.title": "Esta invitación ya no es válida",
  "join.invalid.revoked":
    "El comisionado revocó este enlace. Pídele uno nuevo.",
  "join.invalid.missing":
    "Es posible que el enlace se haya reemplazado, o que nunca existiera.",
  "join.home": "Ir a MatchRead",
  "join.invited": "Te invitaron a {name}",
  "join.signIn": "Entrar y unirte",
  "join.format": "Formato",
  "join.members": "Miembros",
  "join.tournament": "Torneo",
  "join.cta": "Unirme a esta liga",
  "join.joining": "Uniéndote",
  "join.backLeagues": "Volver a mis ligas",
  "join.lede":
    "Los cuadros abren cuando se publica el sorteo. Únete ya para estar en el grupo cuando llegue.",
  "join.afterLink":
    "Después del enlace mágico, entrarás en la liga automáticamente.",

  "calendar.eyebrow": "Calendario",
  "calendar.title": "Calendario de torneos",
  "calendar.lede":
    "Abre un evento para rellenar un cuadro — solo primero, o en una liga que ya tengas.",
  "calendar.drawOpen": "sorteo abierto",
  "calendar.drawPending": "sorteo pendiente",
  "calendar.entryLocks": "cierre de inscripción",
  "calendar.starts": "empieza",
  "calendar.today": "Hoy",
  "calendar.tomorrow": "Mañana",
  "calendar.open": "Abierto",
  "calendar.onCourt": "En pista",
  "calendar.empty": "Aún no hay torneos en la base de datos.",
  "calendar.surfaceKey": "Clave de superficie",
  "calendar.dateTbc": "Por confirmar",
  "tour.atp": "ATP",
  "tour.wta": "WTA",
};

const ja: Record<MessageKey, string> = {
  "landing.eyebrow": "テニスリーグ",
  "landing.title": "仲間とテニスのシーズンを追う。",
  "landing.lede":
    "リーグを作ってリンクを共有し、一緒にブラケットを埋める。一つの大会でも、一年通しても——大会のあいだもリーグは続く。",
  "landing.hero.lede":
    "あなたのリーグ。一つのブラケット。毎朝のDaily Check——今日何が起きたか、そしてあなたは動いたか。",
  "landing.cta.leagues": "マイリーグへ",
  "landing.cta.bracket": "ブラケットを埋める",
  "landing.cta.start": "リーグを始める",
  "landing.cta.look": "見た目を見る",
  "landing.cue.tours": "ATP · WTA",
  "landing.cue.season": "2026シーズン",
  "landing.cue.singles": "シングルスドロー",
  "landing.chip.onCourt": "コート上",
  "landing.chip.drawsOpen": "{n}本のドローがオープン",
  "landing.chip.drawOpenOne": "1本のドローがオープン",
  "landing.close.title": "五セットの話をしたくなる相手を招待しよう。",
  "landing.footer.mark": "MatchRead · 2026シーズン",
  "surface.hard": "ハード",
  "surface.clay": "クレー",
  "surface.grass": "芝",
  "surface.indoor": "インドア",
  "surface.carpet": "カーペット",
  "surface.unknown": "サーフェス未定",
  "chip.onCourt": "コート上",
  "chip.onCourt.hint": " — 試合進行中",
  "chip.upcoming": "今後",
  "daily.yours": "あなたのDaily Check",
  "bracket.notPlayed": "未実施",
  "landing.calendar.title": "カレンダー",
  "landing.calendar.lede":
    "大会を選んでブラケットを埋める——リーグはあとで。友だちを誘うのはいつでも。",
  "landing.calendar.heading.openOne": "いま1本のドローが開いている。",
  "landing.calendar.heading.openMany": "いま{n}本のドローが開いている。",
  "landing.calendar.heading.none": "いま開いているドローはない。",
  "landing.calendar.heading.onCourt": "試合進行中の大会がある。",
  "landing.calendar.openNow": "受付中",
  "landing.calendar.openNow.empty":
    "いま公開中のドローはない——次のドローが出るとブラケットが開く。",
  "landing.calendar.onCourt": "コート上",
  "landing.calendar.upcoming": "今後の大会",
  "landing.calendar.upcoming.empty.next":
    "大会のあいだ。{tour}の次は {name}。",
  "landing.calendar.upcoming.empty.both":
    "大会のあいだ。次は {atp}（ATP）· {wta}（WTA）。",
  "landing.calendar.upcoming.empty.none":
    "大会のあいだ——次の大会はシーズン日程が確定してから。",
  "landing.how.title": "使い方",
  "landing.how.lede": "まずブラケット。あとから招待。",
  "landing.how.body": "Daily Checkに戻ってくる。",
  "landing.daily.title": "Daily Check",
  "landing.daily.heading": "火曜日に開く理由。",
  "landing.daily.body":
    "ダッシュボードではない。一晩で何が変わったかの一文と、その数字。動かなければ、そう書く。",
  "landing.daily.seeLeague": "リーグを見る",
  "landing.daily.sample.line": "一晩で4つ上がった。",
  "landing.daily.sample.detail": "Sunday Doublesで3位。",
  "landing.daily.sample.note": "あなたの優勝予想はまだ残っている。",
  "landing.daily.sample.when": "今朝",
  "landing.daily.stat.settled": "確定",
  "landing.daily.stat.correct": "的中",
  "landing.daily.stat.points": "ポイント",
  "landing.daily.stat.places": "順位",
  "landing.how.1.title": "ドローを埋める",
  "landing.how.1.body":
    "優勝まで全試合の勝者を選ぶ。リーグは不要。",
  "landing.how.2.title": "友達を招待",
  "landing.how.2.body":
    "仲間が欲しくなったらリンクを一つ。同じブラケットがリーグの土台になる。",
  "landing.how.3.title": "ロックと精算",
  "landing.how.3.body":
    "ロック後は編集不可。試合が進むとスコアが更新され、リーグなら順位も動く。",
  "landing.how.4.title": "翌日チェック",
  "landing.how.4.body": "試合が進むと順位が動く。",

  "nav.leagues": "リーグ",
  "nav.calendar": "カレンダー",
  "nav.signIn": "サインイン",
  "nav.signOut": "サインアウト",
  "nav.back": "戻る",
  "nav.loading": "読み込み中…",
  "cta.startLeague": "リーグを始める",
  "cta.fillBracket": "ブラケットを埋める",
  "nav.signedInAs": "サインイン中",

  "leagues.empty.title": "まだブラケットがありません",
  "leagues.empty.body":
    "一人で大会ブラケットを埋めるか、リーグを作ってグループを招待してください。",
  "leagues.solo.badge": "ソロブラケット",
  "leagues.solo.caption": "あなただけ——ロック前ならいつでも招待可",
  "league.solo.eyebrow": "あなたのブラケット",
  "league.solo.home": "マイ大会",
  "league.grow.solo.title": "誰かと比べる",
  "league.grow.solo.lede":
    "ソロのブラケットも正式なエントリー。友だちを招待すれば同じピックがリーグに入る。",
  "bracket.solo.invite.title": "誰かと比べる",
  "bracket.solo.invite.body":
    "このブラケットに友だちを招待。相手は自分の枠を埋める——あなたのはそのまま。",
  "bracket.solo.invite.cta": "友達を招待",
  "result.solo.scoreEyebrow": "あなたのスコア",
  "tournament.solo.scoreTitle": "あなたのスコア",
  "tournament.solo.noStandings":
    "誰かが参加すると順位表が出ます。それまではスコアだけです。",

  "daily.frame.today": "今日",
  "daily.frame.morning": "今朝",
  "daily.frame.live": "ライブ",
  "daily.frame.tonight": "今夜",
  "daily.frame.between": "大会のあいだ",
  "daily.headline.ready": "リーグの準備ができました。",
  "daily.headline.quiet": "リーグは静かな一日です。",
  "daily.headline.championOut": "あなたの優勝予想が敗退しました。",
  "daily.live": "ライブ",
  "daily.title": "Daily Check",
  "daily.cta.openBracket": "自分のブラケットを開く",
  "daily.cta.viewBracket": "自分のブラケットを見る",
  "daily.cta.invite": "友達を招待",
  "daily.cta.seeResult": "結果の全体を見る",
  "daily.cta.openTournament": "大会を開く",

  "founder.eyebrow": "Ops",
  "founder.title": "ファウンダー健全性",
  "founder.lede":
    "プライベートベータ向けの読み取り専用パルス。件数は RLS 下でセッションが見える範囲です。",
  "founder.beta":
    "FOUNDER_EMAILS 未設定 — サインイン済みなら誰でもファウンダーツールを開けます（ベータ）。",
  "founder.denied": "このアカウントはファウンダーリストにありません。",
  "founder.note.noServiceRole":
    "ブラウザや Next の公開 env に service-role キーはありません。書き込みはサインインセッションと既存 RLS を使います。",
  "founder.link.disruption": "ドロー中断 / ボイド",
  "founder.link.integrity": "ドロー整合性と修復",
  "founder.integrity.title": "ドロー整合性",
  "founder.integrity.lede":
    "公開はゲート制です。ブロッキングエラーはドロー保留のままにし、修復ランは reconcile の変更を示します。",
  "founder.integrity.killSwitch":
    "障害時キルスイッチ: update tournaments set product_override = 'force_off' where slug = '…';",
  "founder.integrity.back": "ファウンダーヘルスに戻る",
  "founder.integrity.reports": "整合性レポート",
  "founder.integrity.reportsEmpty": "まだ整合性レポートがありません。",
  "founder.integrity.repairs": "修復ラン",
  "founder.integrity.repairsEmpty": "まだ修復ランがありません。",
  "founder.integrity.alerts": "整合性アラート",
  "founder.integrity.alertsEmpty": "まだ整合性アラートがありません。",
  "founder.integrity.safe": "安全",
  "founder.integrity.blocked": "ブロック",
  "founder.stat.leagues": "リーグ",
  "founder.stat.members": "メンバー（概算）",
  "founder.stat.submitted": "提出済みブラケット",
  "founder.stat.snapshots": "ブラケットスナップショット",
  "founder.stat.results": "試合結果",
  "founder.stat.lastRanked": "最新スナップショット ranked_at",
  "founder.stat.none": "まだなし",
  "founder.ops.title": "エラーとイベント",
  "founder.ops.empty": "まだ記録がありません。公開トーナメントページを開いてから、この一覧を更新してください。",
  "founder.replacements.title": "ドロー交代",
  "founder.replacements.empty": "ラッキールーザー／棄権による座席変更はまだ検出されていません。",
  "founder.ops.kind.error": "エラー",
  "founder.ops.kind.event": "イベント",

  "disruption.eyebrow": "Ops",
  "disruption.title": "ドロー中断",
  "disruption.lede":
    "棄権を記録し、メンバーはピックを失う——ミスにはしない。ボイドされたピックは天井から外れ、不正解にはならない。",
  "disruption.preview":
    "指定ラウンド以降にこの選手を選んだ人は、そのピックを失います（ボイド＝ミスではない）。その後、影響するリーグで settlement を再実行して順位を更新してください。",
  "disruption.submit": "ボイドを記録",
  "disruption.submitting": "記録中…",
  "disruption.after":
    "ボイドを記録しました。影響するリーグで settlement を再実行し、順位を更新してください。",

  "offline.banner":
    "オフラインです。再接続するまで変更が保存されないことがあります。",
  "error.generic": "問題が発生しました。",
  "locale.label": "言語",

  // Auth
  "signin.title": "MatchRead にサインイン",
  "signin.lede":
    "リンクとコードをメールで送ります。パスワードは不要——初めてのアドレスは初回サインインでアカウントが作られます。順位表で分かるよう表示名を選んでください。",
  "signin.email": "メール",
  "signin.displayName": "表示名",
  "signin.displayName.hint": "順位表での表示名",
  "signin.sendLink": "リンクを送信",
  "signin.sending": "送信中",
  "signin.checkEmail.title": "サインインリンクを送信しました。",
  "signin.checkEmail.lede":
    "{email} に送信しました。メールアプリがリンクをプレビューする場合（一回限りのURLが失効します）は、確認コードをご利用ください。",
  "signin.otp": "確認コード",
  "signin.verify": "コードを確認",
  "signin.verifying": "確認中",
  "signin.resend": "再送信",
  "signin.resendWait": "再送信（{s}秒）",
  "signin.differentEmail": "別のアドレスを使う",
  "signin.remember": "この端末でサインイン状態を保持",
  "signin.remember.hint":
    "毎回新しいメールリンクは不要になります。共有端末ではチェックを外してください。",
  "signin.redirectNote":
    "またはこのブラウザでメールのリンクを一度だけクリックしてください——既に開いたリンクを貼り付けないでください。リダイレクト先：{url}",
  "signin.errors.invalidEmail": "有効なメールアドレスを入力してください。",
  "signin.errors.invalidDisplayName": "表示名を入力してください（2〜32文字）。",
  "signin.errors.generic":
    "サインインを完了できませんでした。下から新しいリンクを申請してください。",
  "signin.errors.rateLimited":
    "認証メールのレート制限に達しました（Supabase 標準送信は Pro でも上限があります）。数分待つか、迷惑メールを確認するか、別の受信箱を試すか、Supabase → Project Settings → Authentication → SMTP でカスタム SMTP を追加してください。",
  "signin.errors.otpExpired":
    "そのメールリンクは既に使用済みか、メールスキャナーによって消費されました。新しいリンクを申請し、このブラウザで一度だけクリックするか、下の確認コードを入力してください。",
  "signin.errors.authFailed":
    "そのサインインリンクは無効または期限切れです。下から新しいものを申請してください——招待先は保存されたままです。",
  "signin.errors.notConfigured":
    "サインインが設定されていません。このデプロイの Supabase env を確認するようホストに依頼してください。",
  "signin.errors.invalidCode": "メールの確認コードを入力してください。",
  "signin.errors.codeExpired":
    "そのコードは無効または期限切れです。新しいメールを申請し、新しいコードを試してください。",
  "signin.errors.sameEmailHint":
    "リンクに使用したものと同じメールを入力してください。",
  "signin.eyebrow": "サインイン",
  "signin.checkEmail.eyebrow": "メールを確認してください",
  "signin.wait": "{s}秒待ってください",

  // Welcome
  "welcome.eyebrow": "ようこそ",
  "welcome.title": "表示名を選んでください",
  "welcome.lede":
    "順位表やリーグのハイライトに表示される名前です——ログイン情報ではありません。メールがサインインのままです。",
  "welcome.name": "表示名",
  "welcome.continue": "続ける",
  "welcome.hint": "2〜32文字。後で変更できます。",
  "welcome.saving": "保存中",

  // League home / list
  "league.eyebrow": "リーグ",
  "league.seasonStandings": "シーズン順位表",
  "league.allLeagues": "すべてのリーグ",
  "league.openTournament": "大会を開く",
  "league.drawPendingCta": "大会（ドロー待ち）",
  "league.grow.title": "リーグを広げる",
  "league.grow.lede":
    "リンクを一つ共有。友達が参加し、ブラケットを埋め、Daily Check が面白くなります。",
  "league.tournaments": "大会",
  "league.members": "メンバー",
  "league.role.commissioner": "コミッショナー",
  "league.role.member": "メンバー",
  "league.status.drawPending": "ドロー待ち",
  "league.status.drawOpen": "ドロー公開",
  "league.status.live": "コート上",
  "league.status.complete": "完了",
  "league.status.settled": "確定済み",
  "league.format.single": "単一大会",
  "league.format.season": "シーズンリーグ",
  "league.home": "リーグホーム",
  "league.noTournaments": "カレンダーにまだ大会がありません。",
  "league.settings.title": "リーグ設定",
  "league.settings.lede":
    "表示名や公開範囲を変更できます。形式と大会は変更できません。",
  "league.settings.save": "変更を保存",
  "league.settings.saving": "保存中…",
  "league.settings.saved": "保存しました。",
  "league.settings.danger":
    "削除するとリーグ、メンバー、ブラケットがすべて消えます。",
  "league.settings.delete": "リーグを削除",
  "league.settings.deleteConfirm":
    "このリーグを完全に削除しますか？メンバーとブラケットも削除されます。",
  "league.members.kick": "削除",
  "league.members.kickConfirm": "このメンバーをリーグから外しますか？",
  "league.members.leave": "リーグを退出",
  "league.members.leaveConfirm":
    "このリーグを退出しますか？再参加には新しい招待が必要です。",

  "leagues.my.title": "マイリーグ",
  "leagues.my.lede": "あなたのグループ。動きがあるものを開くか、次のリーグを始めましょう。",
  "leagues.status.bracketOpen": "ブラケット公開中",
  "leagues.status.awaitingDraw": "ドロー待ち",
  "leagues.status.season": "シーズン",
  "leagues.members.count": "{n} 人のメンバー",
  "leagues.members.count.one": "{n} 人のメンバー",
  "leagues.recent.eyebrow": "いちばん最近",
  "leagues.recent.bracketSubmitted": "ブラケット提出済み",
  "leagues.recent.bracketDraft": "ブラケット作成中 — 未提出",
  "leagues.recent.bracketNone": "ブラケット未提出",
  "leagues.recent.standing": "{n} / {field} · {score} ポイント",
  "leagues.recent.openLeague": "リーグを開く",
  "leagues.recent.up": "{n}つ上がった。",
  "leagues.recent.up.one": "1つ上がった。",
  "leagues.recent.down": "{n}つ下がった。",
  "leagues.recent.down.one": "1つ下がった。",
  "leagues.recent.detail": "{league}で {n} / {field}。",
  "leagues.recent.championAlive": "優勝予想はまだ残っている。",
  "leagues.recent.championOut": "優勝予想が敗退した。",

  // Tournament hub
  "tournament.leagueHome": "リーグホーム",
  "tournament.openBracket": "自分のブラケットを開く",
  "tournament.reviewBracket": "自分のブラケットを確認",
  "tournament.viewBracket": "自分のブラケットを見る",
  "tournament.yourEntry": "あなたのエントリー",
  "tournament.eventStandings": "大会の順位表",
  "tournament.seeResult": "自分の結果を見る",
  "tournament.drawPending.title": "ドロー待ち",
  "tournament.drawPending.body":
    "フルブラケットはまだ公開されていません。下に名前が出ている1回戦は今すぐピックできます。",
  "tournament.announced.title": "ここまでの1回戦",
  "tournament.announced.body":
    "1回戦 {need} 試合中 {have} 試合が発表済みです。それらをピックしてください。残りは予選が終わり次第出ます。",
  "tournament.announced.body.locked":
    "1回戦 {need} 試合中 {have} 試合が発表済みです。エントリーはロック済みです。見るだけで、ピックはできません。",
  "tournament.announced.matchStarted": "開始済み",
  "tournament.locked": "ロック済み",
  "tournament.entry.submitted":
    "ブラケットは提出済みです。ロックまでは編集できます。",
  "tournament.entry.draft":
    "ツリーを埋め、随時保存し、すべての試合にピックが入ったら提出してください。",
  "tournament.entry.locked":
    "ドローはロックされています。ピックは閲覧のみで、変更はできません。",
  "publicTournament.pickingOpens":
    "公式ドローが発表されるとピックが始まります。",
  "publicTournament.startsIn": "開始 {countdown}。",
  "publicTournament.entryLocksIn": "エントリー締切 {countdown}。",
  "publicTournament.entryLocked": "エントリーは締め切られています。",
  "publicTournament.live": "この大会は進行中です。",
  "publicTournament.complete": "この大会は終了しました。",
  "publicTournament.whenPicking":
    "公式ドロー発表後、締切までブラケットを埋められます。",
  "publicTournament.backCalendar": "すべての大会",
  "publicTournament.officialDraw": "公式ドロー",

  // Official results
  "results.title": "公式結果",
  "results.lede":
    "試合が終わるまでは何も選ばれません。その試合の勝者だけをタップし——翌日また戻ってきてください。準備ができたら、下で settlement を実行してください。",
  "results.recorded": "{total} 試合中 {n} 試合を記録済み",
  "results.clear": "クリア",
  "results.clearAll": "すべての結果をクリア",
  "results.settleAll": "すべてのリーグを settle",
  "results.settling": "settlement 中…",
  "results.saved": "保存済み",
  "results.notPlayed": "未実施",
  "results.saving": "保存中…",
  "results.done": "完了",
  "results.inProgress": "進行中",
  "results.waitingEarlier": "前のラウンド待ち — 先にその勝者を記録してください。",
  "results.busy.save": "勝者を保存中…",
  "results.busy.clear": "クリア中…",
  "results.busy.settle": "リーグを settle 中…",
  "results.msg.saved":
    "保存しました：{name} が勝ちました。試合が終わるごとに記録し、settlement を実行してください。",
  "results.msg.savedCleared":
    "保存しました：{name} が勝ちました。以降のラウンドはクリアされました — それらの試合が終わったら記録してください。",
  "results.msg.cleared": "結果をクリアしました。その試合が終わったら勝者をタップしてください。",
  "results.msg.clearedAll": "すべての公式結果をクリアしました。試合を一つずつ記録してください。",
  "results.vs": "vs",
  "results.bye": "不戦勝",
  "results.tbd": "未定",
  "draw.tbd": "予選通過 / ラッキールーザー",
  "draw.entry.wc": "WC",
  "draw.entry.pr": "PR",
  "draw.entry.q": "Q",
  "draw.entry.ll": "LL",

  // Settle
  "settle.run": "settlement を実行",
  "settle.settling": "settlement 中…",
  "settle.hint": "提出済みブラケットを公式のフィクスチャ結果と照合して採点します（サーバー）。",
  "settle.ok": "{n} 件のブラケットを settle しました。「自分の結果を見る」からスコアカードを確認してください。",
  "settle.okZero":
    "settlement は実行されましたが、まだ誰も「自分のブラケットを提出」していません — 提出があるまで結果は空のままです。",

  // Result page
  "result.title": "あなたの結果",
  "result.finalPlace": "最終順位",
  "result.score": "スコア",
  "result.ofPerfect": "パーフェクト比",
  "result.correct": "正解",
  "result.misses": "ミス",
  "result.champion": "優勝予想",
  "result.season": "シーズン",
  "result.notAvailable": "まだ利用できません",
  "result.empty.submit":
    "settlement は提出済みのブラケットのみを採点します。ブラケットを開いて「自分のブラケットを提出」をクリックし、コミッショナーに settlement を再実行してもらってください。",
  "result.empty.noOfficial":
    "公式の勝者がまだ保存されていません。公式結果で少なくとも1件保存してから settlement を実行してください。",
  "result.empty.rerun":
    "ブラケットは提出済みですが、直近の settlement には含まれませんでした。コミッショナーに「settlement を実行」をもう一度クリックしてもらってください。",
  "result.empty.settle":
    "公式結果は保存されていますが、settlement はまだ提出済みブラケットを採点していません。大会ページで「settlement を実行」をクリックしてください（部分的な結果でも構いません）。",
  "result.partialNote":
    "部分的な公式結果で十分です — 大会全体が決着している必要はありません。",
  "result.myBracket": "自分のブラケット",
  "result.tournament": "大会",
  "result.pickByPick": "ピックごとの内訳",
  "result.pickByPick.lede": "決着した各試合について、あなたのピックと公式の勝者。",
  "result.you": "あなた",
  "result.official": "公式",
  "result.outcome.correct": "正解",
  "result.outcome.miss": "ミス",
  "result.outcome.void": "ボイド",
  "result.outcome.awaiting": "待機中",
  "result.outcome.nopick": "ピックなし",
  "result.championBonus": "優勝ボーナス",
  "result.namingChampion": "優勝予想の指名",
  "result.alive.won": "優勝しました",
  "result.alive.out": "敗退",
  "result.notGraded":
    "まだ採点された試合がありません。公式の勝者が記録され settlement が実行されると、ここにあなたのピックが表示されます。",

  // Bracket
  "bracket.submit": "自分のブラケットを提出",
  "bracket.submitted": "提出済み",
  "bracket.locked": "ロック済み",
  "bracket.picksMade": "{need} 試合中 {made} 試合ピック済み",
  "bracket.saving": "ブラケットを保存中",
  "bracket.saved": "ブラケットを保存しました",
  "bracket.autosave": "変更は自動的に保存されます",
  "bracket.lock": "このリーグのドローをロック",
  "bracket.unlock": "このリーグのロックを解除",
  "bracket.offline":
    "オフラインです。再接続するまでブラケットの編集はこのページに保持されます。",
  "bracket.fail": "ブラケットが保存されませんでした。何も失われていません — もう一度お試しください。",
  "bracket.completeHint":
    "すべての試合にピックが入るまで提出はできません（残り {left} 試合）。ピック後、確信度を1〜5で設定してください。",
  "bracket.confidence": "確信度",
  "bracket.page.lockedLede": "ロック済み — あなたのピックは公式の勝者と照合して採点されます。",
  "bracket.page.lockedReadOnly": "ロック済み — ピックは閲覧のみです。",
  "bracket.page.editLede": "各試合の勝者を選んでください。変更は自動的に保存されます。",
  "bracket.page.title": "{name} ブラケット",
  "bracket.entrySubmitted": "このリーグへのエントリーを提出しました。",
  "bracket.lockedMsg": "このリーグのドローをロックしました。ブラケットは読み取り専用です。",
  "bracket.unlockedMsg": "リーグのロックを解除しました。ブラケットは再び編集可能です。",
  "bracket.gradedHint":
    "ロック済み — 緑は正解、赤はミスです。公式の勝者にマークが付きます。",
  "bracket.lockedHint": "このドローはロックされています。",
  "bracket.find.label": "試合を探す",
  "bracket.find.placeholder": "選手名",
  "bracket.find.hint": "2文字以上でドローを検索。",
  "bracket.find.empty": "その名前の試合はない。",

  // Engagement
  "engage.yourBracket": "あなたのブラケット",
  "engage.health": "健全性",
  "engage.perfectLeft": "残りのパーフェクトピック",
  "engage.perfectInLeague": "リーグ内 {n} 件のパーフェクトブラケット",
  "engage.perfectInLeague.one": "リーグ内 {n} 件のパーフェクトブラケット",
  "engage.highlights": "リーグハイライト",
  "health.Elite": "エリート",
  "health.Surviving": "生存中",
  "health.Hanging On": "踏みとどまり中",
  "health.In Trouble": "危機的",
  "highlight.Biggest Climber": "最大の上昇",
  "highlight.Biggest Collapse": "最大の下落",
  "highlight.Upset King": "波乱王",
  "highlight.Cold Streak": "不振続き",

  // Standings
  "standings.empty": "まだ順位表がありません。ブラケットを提出し、settlement を実行してください。",
  "standings.member": "メンバー",
  "standings.score": "スコア",
  "standings.pts": "Pts",
  "standings.move": "順位変動",
  "standings.championOut": "優勝予想が敗退",
  "season.title": "シーズン順位表",
  "season.lede":
    "動きましたか？ポイントは大会ごとにスケールされ、パーフェクトな250がテーブル上でパーフェクトなグランドスラムと同等になります。",

  // Invite
  "invite.eyebrow": "招待",
  "invite.title": "リンクを一つ。グループチャットに貼ってください。",
  "invite.hint":
    "このリンクを持つ人はサインイン後に参加できます。いつでも失効させて新しく発行できます。",
  "invite.copy": "招待リンクをコピー",
  "invite.copied": "コピーしました",
  "invite.revoke": "失効させて再発行",
  "invite.cta": "友達を招待",
  "invite.close": "閉じる",
  "invite.working": "処理中…",
  "invite.copyFailed": "コピーできませんでした — リンクを選択して手動でコピーしてください。",
  "invite.revoked": "以前のリンクを失効させました。下のURLが古い場合は更新してください。",

  // Common
  "common.you": "あなた",
  "common.tournament": "大会",
  "common.leagueHome": "リーグホーム",
  "common.cancel": "キャンセル",
  "common.create": "作成",

  "create.eyebrow": "新しいリーグ",
  "create.title": "リーグを始める",
  "create.lede":
    "四つの決定。そのうち二つは後から変更できず、どちらも印が付いています。",
  "create.name": "リーグ名",
  "create.name.placeholder": "4階スラムチャレンジ",
  "create.format.legend": "形式 — 後から変更できません",
  "create.format.single.body":
    "一つのドロー、一つの表、決勝でリーグは終わります。",
  "create.format.season.body":
    "追加する大会ごとに通算表に加点。大会のあいだもメンバーはそのまま。",
  "create.visibility.legend": "公開範囲",
  "create.visibility.private": "非公開",
  "create.visibility.private.body":
    "招待リンクを持つ人だけ。これが初期設定です。",
  "create.visibility.public": "公開",
  "create.visibility.public.body":
    "誰でも順位を見つけ読めます。メンバーのピックはロックまで非公開です。",
  "create.tournament": "どの大会か",
  "create.tournament.hint.before":
    "これらはツアーカレンダー上の大会で、既存のリーグではありません。このフォームは常に",
  "create.tournament.hint.new": "新しい",
  "create.tournament.hint.mid": "リーグを作ります。非公開リーグは",
  "create.tournament.hint.myLeagues": "マイリーグ",
  "create.tournament.hint.after":
    "に残ります。ドローはまだ無くて構いません — 先に参加し、ドローが出たらブラケットが開きます。",
  "create.submit": "リーグを作成",
  "create.creating": "作成中",

  "join.eyebrow": "招待",
  "join.invalid.title": "この招待はもう無効です",
  "join.invalid.revoked":
    "コミッショナーがこのリンクを失効させました。新しいリンクを頼んでください。",
  "join.invalid.missing":
    "リンクが差し替えられたか、存在しなかった可能性があります。",
  "join.home": "MatchRead へ",
  "join.invited": "{name} への招待です",
  "join.signIn": "サインインして参加",
  "join.format": "形式",
  "join.members": "メンバー",
  "join.tournament": "大会",
  "join.cta": "このリーグに参加",
  "join.joining": "参加中",
  "join.backLeagues": "マイリーグへ戻る",
  "join.lede":
    "ドローが出るとブラケットが開きます。出たときにグループに入れるよう、今参加しておきましょう。",
  "join.afterLink":
    "マジックリンクの後、自動的にリーグへ入ります。",

  "calendar.eyebrow": "カレンダー",
  "calendar.title": "大会カレンダー",
  "calendar.lede":
    "大会を開いてブラケットを埋める——まず一人で、または既存のリーグへ。",
  "calendar.drawOpen": "ドロー公開中",
  "calendar.drawPending": "ドロー待ち",
  "calendar.entryLocks": "エントリー締切",
  "calendar.starts": "開始",
  "calendar.today": "今日",
  "calendar.tomorrow": "明日",
  "calendar.open": "受付中",
  "calendar.onCourt": "コート上",
  "calendar.empty": "データベースに大会がまだありません。",
  "calendar.surfaceKey": "コート面の凡例",
  "calendar.dateTbc": "未定",
  "tour.atp": "ATP",
  "tour.wta": "WTA",
};

const catalogues: Record<Locale, Record<MessageKey, string>> = {
  en,
  es,
  ja,
};

export function t(locale: Locale, key: MessageKey): string {
  return catalogues[locale][key] ?? catalogues.en[key];
}

/** `t` plus `{placeholder}` substitution — replaceAll for repeated placeholders. */
export function tf(
  locale: Locale,
  key: MessageKey,
  vars: Record<string, string | number>
): string {
  let s = t(locale, key);
  for (const [k, v] of Object.entries(vars)) {
    s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}
