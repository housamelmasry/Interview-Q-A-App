import type { Category } from "../api/types";
import type { Theme } from "../theme";
import { ghostButtonStyle } from "./styles";

interface CategoryTabsProps {
  theme: Theme;
  categories: Category[];
  activeCategory: string;
  isManageMode: boolean;
  onSelect: (id: string) => void;
  onEdit: (category: Category) => void;
  onDelete: (id: string) => void;
}

/** One tab per category, each labelled with the count from `/api/categories`. */
export function CategoryTabs({
  theme,
  categories,
  activeCategory,
  isManageMode,
  onSelect,
  onEdit,
  onDelete,
}: CategoryTabsProps) {
  return (
    <div
      data-testid="category-tabs"
      style={{
        display: "flex",
        gap: "0.5rem",
        padding: "1.25rem 1.5rem",
        overflowX: "auto",
        borderBottom: `1px solid ${theme.border}`,
        background: theme.tabBg,
      }}
    >
      {categories.map((category) => {
        const active = activeCategory === category.id;
        return (
          <div
            key={category.id}
            style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}
          >
            <button
              data-testid={`category-tab-${category.id}`}
              onClick={() => onSelect(category.id)}
              aria-pressed={active}
              style={{
                padding: "0.55rem 1.1rem",
                borderRadius: "50px",
                border: active
                  ? `1.5px solid ${category.color}`
                  : `1.5px solid ${theme.border}`,
                background: active ? `${category.color}18` : "transparent",
                color: active ? category.color : theme.mutedText,
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: active ? 700 : 400,
                whiteSpace: "nowrap",
                fontFamily: "inherit",
                transition: "all 0.2s",
              }}
            >
              {category.icon} {category.label}
              <span style={{ marginRight: "0.4rem", fontSize: "0.75rem", opacity: 0.7 }}>
                ({category.question_count})
              </span>
            </button>
            {isManageMode && (
              <div style={{ display: "flex", gap: "2px" }}>
                <button
                  data-testid={`category-edit-${category.id}`}
                  onClick={() => onEdit(category)}
                  aria-label={`تعديل ${category.label}`}
                  style={ghostButtonStyle}
                >
                  ✏️
                </button>
                <button
                  data-testid={`category-delete-${category.id}`}
                  onClick={() => onDelete(category.id)}
                  aria-label={`حذف ${category.label}`}
                  style={ghostButtonStyle}
                >
                  🗑️
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
