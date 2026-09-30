import type { Theme } from "../theme";

interface SearchBarProps {
  theme: Theme;
  value: string;
  onChange: (value: string) => void;
}

/**
 * Controlled search input. It stays fully responsive: the value is held here in
 * the parent while `useDebounce` decides when to hit `/api/search`.
 */
export function SearchBar({ theme, value, onChange }: SearchBarProps) {
  return (
    <div style={{ maxWidth: "420px", margin: "1.5rem auto 0" }}>
      <input
        data-testid="search-input"
        placeholder="🔍  ابحث في الأسئلة..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          width: "100%",
          padding: "0.75rem 1.25rem",
          borderRadius: "50px",
          border: `1px solid ${theme.searchBorder}`,
          background: theme.searchBg,
          color: theme.text,
          fontSize: "0.95rem",
          fontFamily: "inherit",
          outline: "none",
          boxSizing: "border-box",
          textAlign: "right",
          boxShadow: theme.isDark ? "none" : "0 4px 12px rgba(0,0,0,0.05)",
        }}
      />
    </div>
  );
}
