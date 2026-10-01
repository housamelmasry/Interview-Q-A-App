import type { CSSProperties } from "react";

import type { Theme } from "../theme";
import { withAlpha } from "../theme";

/** Text inputs, selects and textareas all share the same box. */
export const fieldStyle = (theme: Theme): CSSProperties => ({
  width: "100%",
  padding: "0.5rem",
  background: theme.cardBg,
  border: `1px solid ${theme.border}`,
  color: theme.text,
  borderRadius: "4px",
  fontFamily: "inherit",
});

export const textareaStyle = (theme: Theme): CSSProperties => ({
  ...fieldStyle(theme),
  minHeight: "80px",
});

export const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: "0.5rem",
};

export const solidButtonStyle = (background: string): CSSProperties => ({
  padding: "0.5rem 1rem",
  background,
  color: "white",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
  fontFamily: "inherit",
});

export const submitRowStyle: CSSProperties = {
  display: "flex",
  gap: "1rem",
  marginTop: "2rem",
};

export const growButtonStyle = (background: string): CSSProperties => ({
  ...solidButtonStyle(background),
  flex: 1,
  padding: "0.75rem",
});

export const ghostButtonStyle: CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "0.8rem",
};

/** Small outlined pill, used for difficulty, tags and category badges. */
export const badgeStyle = (color: string): CSSProperties => ({
  fontSize: "0.7rem",
  color,
  border: `1px solid ${withAlpha(color, "44")}`,
  background: withAlpha(color, "18"),
  padding: "2px 8px",
  borderRadius: "20px",
  whiteSpace: "nowrap",
});
