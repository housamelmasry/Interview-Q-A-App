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
