type HighlightItem = {
  label: string;
  memberLabel: string;
  isYou: boolean;
};

type Props = {
  items: HighlightItem[];
};

export function LeagueHighlights({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="section stack gap-md" aria-labelledby="highlights-heading">
      <h2 id="highlights-heading" className="section-title">
        League Highlights
      </h2>
      <ul className="highlight-strip">
        {items.map((item) => (
          <li key={item.label} className="highlight-item">
            <span className="highlight-label">{item.label}</span>
            <span className="highlight-who">
              {item.isYou ? "You" : item.memberLabel}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
