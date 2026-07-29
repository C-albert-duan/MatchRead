import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TournamentsPage() {
  const user = await getSessionUser();
  const supabase = createClient();

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id, ref, name, surface, starts_on, draw_size")
    .order("starts_on", { ascending: true });

  const { data: draws } = await supabase.from("draws").select("tournament_id");
  const publishedIds = new Set((draws ?? []).map((d) => d.tournament_id));

  return (
    <AppShell signedIn={Boolean(user)} email={user?.email}>
      <div className="stack gap-2xl">
        <div className="stack gap-lg">
          <p className="eyebrow">Tournaments</p>
          <h1 className="t-page-title">Tournament calendar</h1>
          <p className="t-lead">
            Fixture events for local play. Brackets open inside a league once
            the draw is published.
          </p>
        </div>

        {(tournaments ?? []).length === 0 ? (
          <p className="stub-note">
            No tournaments yet. Apply{" "}
            <code>supabase/migrations/0003_brackets.sql</code> in the SQL
            Editor.
          </p>
        ) : (
          <ul className="league-list">
            {(tournaments ?? []).map((t) => (
              <li key={t.ref} className="league-card" style={{ cursor: "default" }}>
                <div className="stack gap-sm" style={{ flex: 1 }}>
                  <span className="league-card-name">{t.name}</span>
                  <span className="t-caption">
                    {t.surface}
                    {t.starts_on ? ` · ${t.starts_on}` : ""}
                    {" · "}
                    {t.draw_size}-draw
                    {" · "}
                    {publishedIds.has(t.id) ? "draw published" : "draw pending"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Link href="/" className="act act--standard act--standard-size">
          Back to landing
        </Link>
      </div>
    </AppShell>
  );
}
