import type { Stats } from "../api/types";
import type { Theme } from "../theme";

interface StatsBarProps {
  theme: Theme;
  stats: Stats;
}

const chipStyle = (theme: Theme) => ({
  display: "inline-flex",
  alignItems: "baseline",
  gap: "0.35rem",
  padding: "0.3rem 0.75rem",
  borderRadius: "50px",
  border: `1px solid ${theme.border}`,
  background: theme.cardBg,
  color: theme.mutedText,
  fontSize: "0.8rem",
});

/** Site-wide totals from `/api/stats`, shown under the title. */
export function StatsBar({ theme, stats }: StatsBarProps) {
  const chips = [
    { testId: "stat-categories", value: stats.total_categories, label: "تصنيف" },
    { testId: "stat-questions", value: stats.total_questions, label: "سؤال" },
    { testId: "stat-answers", value: stats.total_answers, label: "إجابة" },
  ];

  return (
    <div
      data-testid="stats-bar"
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "0.5rem",
        marginTop: "1rem",
      }}
    >
      {chips.map((chip) => (
        <span key={chip.testId} data-testid={chip.testId} style={chipStyle(theme)}>
          <strong style={{ color: theme.text, fontSize: "0.9rem" }}>{chip.value}</strong>{" "}
          {chip.label}
        </span>
      ))}
    </div>
  );
}
