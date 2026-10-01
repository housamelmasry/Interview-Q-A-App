export interface Theme {
  /** Lets components branch on depth without re-deriving it from a colour. */
  isDark: boolean;
  bg: string;
  text: string;
  headerBg: string;
  cardBg: string;
  cardBgOpen: string;
  border: string;
  tabBg: string;
  searchBg: string;
  searchBorder: string;
  footerText: string;
  subText: string;
  mutedText: string;
  answerText: string;
}

export const createTheme = (isDarkMode: boolean): Theme => ({
  isDark: isDarkMode,
  bg: isDarkMode ? "#0d0d0d" : "#f5f7fa",
  text: isDarkMode ? "#e8e8e8" : "#2c3e50",
  headerBg: isDarkMode
    ? "linear-gradient(135deg, #1a0533 0%, #0d1a2e 50%, #0d0d0d 100%)"
    : "linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)",
  cardBg: isDarkMode ? "#111" : "#ffffff",
  cardBgOpen: isDarkMode ? "#141414" : "#f9f9f9",
  border: isDarkMode ? "#1e1e1e" : "#e1e8ed",
  tabBg: isDarkMode ? "#0f0f0f" : "#ffffff",
  searchBg: isDarkMode ? "#1a1a1a" : "#ffffff",
  searchBorder: isDarkMode ? "#333" : "#d1d8e0",
  footerText: isDarkMode ? "#333" : "#aaa",
  subText: isDarkMode ? "#555" : "#7f8c8d",
  mutedText: isDarkMode ? "#666" : "#95a5a6",
  answerText: isDarkMode ? "#c8c8c8" : "#4b5563",
});

export const FONT_STACK = "'Tajawal', 'Cairo', sans-serif";

/**
 * Appends an alpha suffix to a hex colour.
 *
 * Theme and category colours are written as 3-digit shorthands (`#666`) about as
 * often as 6-digit values, so concatenating `44` straight onto the string is not
 * safe: `#666` + `44` yields `#66644`, five hex digits, which is an invalid
 * colour that browsers and jsdom silently drop. Expand the shorthand first so
 * the result is always a valid 8-digit `#rrggbbaa`.
 *
 * Anything that is not a 3- or 6-digit hex is passed through untouched, which
 * leaves `transparent`, `rgb(...)` and named colours alone.
 */
export const withAlpha = (color: string, alpha: string): string => {
  const hex = color.trim();

  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    const [r, g, b] = hex.slice(1).toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}${alpha}`;
  }

  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return `${hex}${alpha}`;
  }

  return color;
};
