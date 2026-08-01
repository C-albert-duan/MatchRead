// supabase/functions/ingest-events
// Machine ingest for official match results. Settlement stays separate
// (commissioner Settle / founder Settle all / future Railway cron).
//
// Auth: Authorization: Bearer <INGEST_SECRET>
// Body JSON:
// {
//   "tournament_id": "<uuid>",
//   "results": [{ "match_key": "r0-m0", "winner_ref": "p001", "voided": false }]
// }
//
// Deploy: supabase functions deploy ingest-events
// Secrets: INGEST_SECRET, SUPABASE_SERVICE_ROLE_KEY (auto), SUPABASE_URL (auto)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const secret = Deno.env.get("INGEST_SECRET");
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!secret || token !== secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: {
    tournament_id?: string;
    results?: {
      match_key: string;
      winner_ref?: string | null;
      voided?: boolean;
    }[];
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const tournamentId = body.tournament_id?.trim();
  const results = body.results ?? [];
  if (!tournamentId || results.length === 0) {
    return new Response(
      JSON.stringify({ error: "tournament_id and results[] required" }),
      {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      }
    );
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const now = new Date().toISOString();
  const rows = results.map((r) => ({
    tournament_id: tournamentId,
    match_key: r.match_key,
    winner_ref: r.voided ? null : r.winner_ref ?? null,
    voided: Boolean(r.voided),
    settled_at: now,
  }));

  const { error } = await admin.from("match_results").upsert(rows, {
    onConflict: "tournament_id,match_key",
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, upserted: rows.length }),
    {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    }
  );
});
