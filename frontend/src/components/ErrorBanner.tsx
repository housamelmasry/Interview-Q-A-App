import type { Theme } from "../theme";

interface ErrorBannerProps {
  theme: Theme;
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}

export function ErrorBanner({ theme, message, onRetry, onDismiss }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        margin: "1rem 1.5rem 0",
        padding: "0.85rem 1.1rem",
        borderRadius: "8px",
        border: `1px solid ${theme.isDark ? "#7f1d1d" : "#fca5a5"}`,
        background: theme.isDark ? "#2a1414" : "#fef2f2",
        color: theme.isDark ? "#fca5a5" : "#991b1b",
        fontSize: "0.9rem",
        maxWidth: "860px",
        marginInline: "auto",
      }}
    >
      <span aria-hidden="true">⚠️</span>
      <span style={{ flex: 1 }}>{message}</span>
      <button
        data-testid="error-retry"
        onClick={onRetry}
        style={{
          background: "transparent",
          border: "1px solid currentColor",
          color: "inherit",
          borderRadius: "4px",
          padding: "0.2rem 0.6rem",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "0.8rem",
        }}
      >
        إعادة المحاولة
      </button>
      <button
        onClick={onDismiss}
        aria-label="Dismiss error"
        style={{
          background: "transparent",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          fontSize: "1rem",
          lineHeight: 1,
        }}
      >
        ✕
      </button>
    </div>
  );
}
