import {
  defaultLocale,
  isLocale,
  t as translate,
  type Locale,
  type MessageKey,
} from "@matchread/i18n";
import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "@/lib/i18n-cookie";

export { LOCALE_COOKIE } from "@/lib/i18n-cookie";

export function getLocale(): Locale {
  const raw = cookies().get(LOCALE_COOKIE)?.value;
  if (isLocale(raw)) return raw;
  return defaultLocale;
}

export function t(key: MessageKey): string {
  return translate(getLocale(), key);
}

export type { Locale, MessageKey };
