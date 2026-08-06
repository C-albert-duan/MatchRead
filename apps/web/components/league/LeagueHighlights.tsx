import { t, type MessageKey } from "@/lib/i18n";

type HighlightItem = {
  label: string;
  memberLabel: string;
  isYou: boolean;
};

type Props = {
  items: HighlightItem[];
};

function highlightKey(label: string): MessageKey {
  return `highlight.${label}` as MessageKey;
}

export function LeagueHighlights({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="section stack gap-md" aria-labelledby="highlights-heading">
      <h2 id="highlights-heading" className="section-title">
        {t("engage.highlights")}
      </h2>
      <ul className="highlight-strip">
        {items.map((item) => (
          <li key={item.label} className="highlight-item">
            <span className="highlight-label">{t(highlightKey(item.label))}</span>
            <span className="highlight-who">{item.memberLabel}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
