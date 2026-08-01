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
  "landing.cta.leagues": "Go to my leagues",
  "landing.cta.start": "Start a league",
  "landing.cta.showcase": "See what it looks like",
  "landing.calendar.title": "On the calendar",
  "landing.how.title": "How it works",
  "landing.how.1.title": "Start a league",
  "landing.how.1.body":
    "Name it, pick a tournament or a whole season, and you are the commissioner.",
  "landing.how.2.title": "Share one link",
  "landing.how.2.body": "Drop it in the group chat. People join in two taps.",
  "landing.how.3.title": "Fill in a bracket",
  "landing.how.3.body":
    "When the draw lands, everyone picks. Nobody sees anyone else’s until it locks.",
  "landing.how.4.title": "Check it tomorrow",
  "landing.how.4.body":
    "Standings move as matches finish. That is the part people come back for.",

  "nav.leagues": "Leagues",
  "nav.signIn": "Sign in",
  "nav.signOut": "Sign out",
  "nav.back": "Back",
  "nav.loading": "Loading…",
  "cta.startLeague": "Start a league",
  "nav.signedInAs": "Signed in as",

  "leagues.empty.title": "No leagues yet",
  "leagues.empty.body":
    "Start one in under a minute, then drop the invite link in the group chat.",

  "daily.frame.today": "Today",
  "daily.frame.morning": "This morning",
  "daily.frame.live": "Live now",
  "daily.frame.tonight": "Tonight",
  "daily.frame.between": "Between tournaments",
  "daily.headline.ready": "Your league is ready.",
  "daily.headline.quiet": "A quiet day in your league.",
  "daily.headline.championOut": "Your champion is out.",

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
  "founder.stat.leagues": "Leagues",
  "founder.stat.members": "Members (approx)",
  "founder.stat.submitted": "Submitted brackets",
  "founder.stat.snapshots": "Bracket snapshots",
  "founder.stat.results": "Match results",
  "founder.stat.lastRanked": "Last snapshot ranked_at",
  "founder.stat.none": "None yet",

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
} as const;

export type MessageKey = keyof typeof en;

const es: Record<MessageKey, string> = {
  "landing.eyebrow": "Ligas de tenis",
  "landing.title": "Sigue la temporada de tenis con tu gente.",
  "landing.lede":
    "Crea una liga, comparte un enlace y rellenad el cuadro juntos. Un torneo, o todo el año — la liga sigue entre eventos.",
  "landing.cta.leagues": "Ir a mis ligas",
  "landing.cta.start": "Crear una liga",
  "landing.cta.showcase": "Ver cómo se ve",
  "landing.calendar.title": "En el calendario",
  "landing.how.title": "Cómo funciona",
  "landing.how.1.title": "Crea una liga",
  "landing.how.1.body":
    "Ponle nombre, elige un torneo o toda la temporada, y eres el comisionado.",
  "landing.how.2.title": "Comparte un enlace",
  "landing.how.2.body":
    "Pégalo en el chat del grupo. La gente entra en dos toques.",
  "landing.how.3.title": "Rellena el cuadro",
  "landing.how.3.body":
    "Cuando sale el sorteo, todos eligen. Nadie ve las picks de los demás hasta el cierre.",
  "landing.how.4.title": "Míralo mañana",
  "landing.how.4.body":
    "La clasificación se mueve al terminar los partidos. Por eso vuelve la gente.",

  "nav.leagues": "Ligas",
  "nav.signIn": "Entrar",
  "nav.signOut": "Salir",
  "nav.back": "Atrás",
  "nav.loading": "Cargando…",
  "cta.startLeague": "Crear una liga",
  "nav.signedInAs": "Sesión de",

  "leagues.empty.title": "Aún no hay ligas",
  "leagues.empty.body":
    "Crea una en menos de un minuto y suelta el enlace de invitación en el chat.",

  "daily.frame.today": "Hoy",
  "daily.frame.morning": "Esta mañana",
  "daily.frame.live": "En directo",
  "daily.frame.tonight": "Esta noche",
  "daily.frame.between": "Entre torneos",
  "daily.headline.ready": "Tu liga está lista.",
  "daily.headline.quiet": "Un día tranquilo en tu liga.",
  "daily.headline.championOut": "Tu campeón está fuera.",

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
  "founder.stat.leagues": "Ligas",
  "founder.stat.members": "Miembros (aprox.)",
  "founder.stat.submitted": "Cuadros enviados",
  "founder.stat.snapshots": "Instantáneas de cuadro",
  "founder.stat.results": "Resultados de partido",
  "founder.stat.lastRanked": "Último ranked_at de instantánea",
  "founder.stat.none": "Todavía ninguno",

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
};

const ja: Record<MessageKey, string> = {
  "landing.eyebrow": "テニスリーグ",
  "landing.title": "仲間とテニスのシーズンを追う。",
  "landing.lede":
    "リーグを作ってリンクを共有し、一緒にブラケットを埋める。一つの大会でも、一年通しても——大会のあいだもリーグは続く。",
  "landing.cta.leagues": "マイリーグへ",
  "landing.cta.start": "リーグを始める",
  "landing.cta.showcase": "見た目を見る",
  "landing.calendar.title": "カレンダー",
  "landing.how.title": "使い方",
  "landing.how.1.title": "リーグを始める",
  "landing.how.1.body":
    "名前を付け、大会かシーズンを選ぶ。あなたがコミッショナーになる。",
  "landing.how.2.title": "リンクを一つ共有",
  "landing.how.2.body":
    "グループチャットに貼る。二タップで参加できる。",
  "landing.how.3.title": "ブラケットを埋める",
  "landing.how.3.body":
    "ドローが出たらみんなで選ぶ。ロックまで他人のピックは見えない。",
  "landing.how.4.title": "翌日チェック",
  "landing.how.4.body":
    "試合が進むと順位が動く。だからまた開きたくなる。",

  "nav.leagues": "リーグ",
  "nav.signIn": "サインイン",
  "nav.signOut": "サインアウト",
  "nav.back": "戻る",
  "nav.loading": "読み込み中…",
  "cta.startLeague": "リーグを始める",
  "nav.signedInAs": "サインイン中",

  "leagues.empty.title": "まだリーグがありません",
  "leagues.empty.body":
    "一分以内に作れます。招待リンクをグループチャットに貼ってください。",

  "daily.frame.today": "今日",
  "daily.frame.morning": "今朝",
  "daily.frame.live": "ライブ",
  "daily.frame.tonight": "今夜",
  "daily.frame.between": "大会のあいだ",
  "daily.headline.ready": "リーグの準備ができました。",
  "daily.headline.quiet": "リーグは静かな一日です。",
  "daily.headline.championOut": "あなたの優勝予想が敗退しました。",

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
  "founder.stat.leagues": "リーグ",
  "founder.stat.members": "メンバー（概算）",
  "founder.stat.submitted": "提出済みブラケット",
  "founder.stat.snapshots": "ブラケットスナップショット",
  "founder.stat.results": "試合結果",
  "founder.stat.lastRanked": "最新スナップショット ranked_at",
  "founder.stat.none": "まだなし",

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
};

const catalogues: Record<Locale, Record<MessageKey, string>> = {
  en,
  es,
  ja,
};

export function t(locale: Locale, key: MessageKey): string {
  return catalogues[locale][key] ?? catalogues.en[key];
}
