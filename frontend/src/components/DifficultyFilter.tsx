import { DIFFICULTY_COLORS, DIFFICULTY_LABELS, DIFFICULTY_LEVELS } from "../constants";
import type { Difficulty } from "../api/types";
import type { Theme } from "../theme";
import { withAlpha } from "../theme";

interface DifficultyFilterProps {
  theme: Theme;
  /** `null` means every difficulty is shown. */
  value: Difficulty | null;
  onChange: (value: Difficulty | null) => void;
}

/**
 * A row of toggles narrowing the list to one difficulty.
 *
 * "الكل" is a real option rather than a separate button so the selection stays a
 * single value, and re-clicking the active level clears the filter: the common
 * case is a user who picks "متوسط" by mistake and wants to get back to the
 * unfiltered list without hunting for a separate reset control.
 *
 * It renders as a group of toggle buttons so a screen reader announces the
 * current selection through `aria-pressed`.
 */
export function DifficultyFilter({ theme, value, onChange }: DifficultyFilterProps) {
  const options: Array<{ value: Difficulty | null; label: string; color: string }> = [
    { value: null, label: "الكل", color: theme.mutedText },
    ...DIFFICULTY_LEVELS.map((level) => ({
      value: level,
      label: DIFFICULTY_LABELS[level],
      color: DIFFICULTY_COLORS[level],
    })),
  ];

  return (
    <div
      data-testid="difficulty-filter"
      role="group"
      aria-label="تصفية حسب المستوى"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexWrap: "wrap",
        gap: "0.5rem",
        padding: "0.75rem 1.5rem 0",
      }}
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value ?? "all"}
            data-testid={`difficulty-option-${option.value ?? "all"}`}
            onClick={() => onChange(active ? null : option.value)}
            aria-pressed={active}
            style={{
              padding: "0.35rem 0.9rem",
              borderRadius: "50px",
              border: active
                ? `1.5px solid ${option.color}`
                : `1.5px solid ${theme.border}`,
              background: active ? withAlpha(option.color, "18") : "transparent",
              color: active ? option.color : theme.mutedText,
              cursor: "pointer",
              fontSize: "0.8rem",
              fontWeight: active ? 700 : 400,
              whiteSpace: "nowrap",
              fontFamily: "inherit",
              transition: "all 0.2s",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
