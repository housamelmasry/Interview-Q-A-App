import type { ReactNode } from "react";

import type { Stats } from "../api/types";
import type { Theme } from "../theme";
import { StatsBar } from "./StatsBar";

interface HeaderProps {
  theme: Theme;
  stats: Stats;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  isManageMode: boolean;
  onToggleManageMode: () => void;
  children?: ReactNode;
}

const toggleButtonStyle = (theme: Theme, active: boolean) => ({
  padding: "0.4rem 0.8rem",
  background: active ? "#ff4444" : theme.isDark ? "#333" : "#fff",
  color: active || theme.isDark ? "white" : "#333",
  border: `1px solid ${theme.border}`,
  borderRadius: "4px",
  fontSize: "0.7rem",
  fontFamily: "inherit",
  cursor: "pointer",
  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
});

export function Header({
  theme,
  stats,
  isDarkMode,
  onToggleTheme,
  isManageMode,
  onToggleManageMode,
  children,
}: HeaderProps) {
  return (
    <div
      style={{
        background: theme.headerBg,
        padding: "2.5rem 2rem 2rem",
        borderBottom: `1px solid ${theme.border}`,
        textAlign: "center",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "1rem",
          left: "1rem",
          display: "flex",
          gap: "0.5rem",
        }}
      >
        <button
          data-testid="theme-toggle"
          onClick={onToggleTheme}
          style={toggleButtonStyle(theme, false)}
        >
          {isDarkMode ? "☀️ وضع النهار" : "🌙 وضع الليل"}
        </button>

        <button
          data-testid="manage-mode-toggle"
          onClick={onToggleManageMode}
          style={toggleButtonStyle(theme, isManageMode)}
        >
          {isManageMode ? "إغلاق الإدارة" : "وضع الإدارة"}
        </button>
      </div>

      <div
        style={{
          fontSize: "0.75rem",
          letterSpacing: "0.3em",
          color: theme.mutedText,
          marginBottom: "0.75rem",
          textTransform: "uppercase",
        }}
      >
        دليل المقابلات الشامل
      </div>
      <h1
        style={{
          fontSize: "clamp(1.6rem, 4vw, 2.5rem)",
          fontWeight: 900,
          margin: 0,
          background:
            "linear-gradient(90deg, #FF4444, #FF8C00, #2979FF, #AA00FF)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        Laravel · Node.js · React · React Native · Backend
      </h1>
      <div style={{ color: theme.subText, marginTop: "0.5rem", fontSize: "0.9rem" }}>
        {stats.total_questions} سؤال وإجابة موثّقة
      </div>

      <StatsBar theme={theme} stats={stats} />

      {children}
    </div>
  );
}
