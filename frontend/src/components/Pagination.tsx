import type { Theme } from "../theme";

interface PaginationProps {
  theme: Theme;
  page: number;
  pages: number;
  total: number;
  onPageChange: (page: number) => void;
}

const controlStyle = (theme: Theme) => ({
  padding: "0.45rem 1rem",
  borderRadius: "50px",
  border: `1px solid ${theme.searchBorder}`,
  background: theme.cardBg,
  color: theme.text,
  fontFamily: "inherit",
  fontSize: "0.85rem",
  cursor: "pointer",
});

/**
 * Page controls driven by the `total`/`pages` of the response envelope.
 *
 * The layout is RTL, so "previous" sits on the right and points right, while
 * "next" sits on the left. Both buttons are omitted entirely for a single page.
 */
export function Pagination({ theme, page, pages, total, onPageChange }: PaginationProps) {
  if (pages <= 1) return null;

  return (
    <div
      data-testid="pagination"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
        marginTop: "1.5rem",
      }}
    >
      <button
        data-testid="pagination-prev"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        style={{ ...controlStyle(theme), opacity: page <= 1 ? 0.4 : 1 }}
      >
        ‹ السابق
      </button>

      <span
        data-testid="pagination-info"
        style={{ color: theme.mutedText, fontSize: "0.85rem" }}
      >
        صفحة {page} من {pages}
      </span>

      <button
        data-testid="pagination-next"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pages}
        style={{ ...controlStyle(theme), opacity: page >= pages ? 0.4 : 1 }}
      >
        التالي ›
      </button>

      <span
        data-testid="pagination-total"
        style={{
          color: theme.subText,
          fontSize: "0.8rem",
          width: "100%",
          textAlign: "center",
        }}
      >
        {total} سؤال
      </span>
    </div>
  );
}
