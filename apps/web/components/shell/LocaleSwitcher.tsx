"use client";

import { useRouter } from "next/navigation";
import type { Locale } from "@matchread/i18n";
import { locales } from "@matchread/i18n";
import { LOCALE_COOKIE } from "@/lib/i18n-cookie";

type Props = {
  current: Locale;
  label: string;
};

export function LocaleSwitcher({ current, label }: Props) {
  const router = useRouter();

  return (
    <div className="locale-switch" role="group" aria-label={label}>
      <span className="t-caption">{label}</span>
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          className={
            locale === current
              ? "locale-switch__btn locale-switch__btn--active"
              : "locale-switch__btn"
          }
          aria-pressed={locale === current}
          onClick={() => {
            document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=31536000;samesite=lax`;
            router.refresh();
          }}
        >
          {locale}
        </button>
      ))}
    </div>
  );
}
