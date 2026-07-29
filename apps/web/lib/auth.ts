import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export type SessionUser = {
  id: string;
  email: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  // Touch cookies so the route is never statically prerendered as signed-out.
  cookies();

  if (!hasSupabaseEnv()) return null;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? null };
}
