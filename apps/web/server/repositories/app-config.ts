/**
 * Server settings from public.app_config, cached briefly so a founder can
 * retune them without a deploy. A missing or malformed row falls back to the
 * core defaults; it never throws into a page.
 */
import { DEFAULT_IMPORTANCE, type ImportanceConfig } from "@matchread/core";

export const APP_CONFIG_TTL_MS = 60_000;

type ConfigQuery = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string
      ) => {
        maybeSingle: () => PromiseLike<{ data: unknown | null; error: { message: string } | null }>;
      };
    };
  };
};

function threshold(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 6
    ? value
    : null;
}

export function parseImportanceConfig(value: unknown): ImportanceConfig {
  if (!value || typeof value !== "object") return DEFAULT_IMPORTANCE;
  const record = value as Record<string, unknown>;
  const critical = threshold(record.criticalAtOrBelow);
  const important = threshold(record.importantAtOrBelow);
  if (critical == null || important == null) return DEFAULT_IMPORTANCE;
  return { criticalAtOrBelow: critical, importantAtOrBelow: important };
}

let cached: { at: number; config: ImportanceConfig } | null = null;

export async function readImportanceConfig(
  supabase: ConfigQuery,
  nowMs: number
): Promise<ImportanceConfig> {
  if (cached && nowMs - cached.at < APP_CONFIG_TTL_MS) return cached.config;
  const { data, error } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "importance")
    .maybeSingle();
  const value = data && typeof data === "object" ? (data as { value?: unknown }).value : null;
  const config = error ? DEFAULT_IMPORTANCE : parseImportanceConfig(value);
  cached = { at: nowMs, config };
  return config;
}

/** Tests only. */
export function resetImportanceConfigCache(): void {
  cached = null;
}
