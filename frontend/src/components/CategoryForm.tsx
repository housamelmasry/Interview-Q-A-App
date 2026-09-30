import { useState } from "react";

import type { Category, CategoryInput } from "../api/types";
import type { Theme } from "../theme";
import {
  fieldStyle,
  growButtonStyle,
  labelStyle,
  submitRowStyle,
} from "./styles";

interface CategoryFormProps {
  theme: Theme;
  /** The category being edited, or null while creating a new one. */
  initial: Category | null;
  /** True when `initial` refers to a category that already exists server side. */
  isExisting: boolean;
  onSave: (input: CategoryInput) => void;
  onCancel: () => void;
}

export function CategoryForm({
  theme,
  initial,
  isExisting,
  onSave,
  onCancel,
}: CategoryFormProps) {
  const [draft, setDraft] = useState<CategoryInput>({
    id: initial?.id ?? "",
    label: initial?.label ?? "",
    icon: initial?.icon ?? "📁",
    color: initial?.color ?? "#666666",
  });

  return (
    <form
      data-testid="category-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <h2 style={{ marginTop: 0 }}>{isExisting ? "تعديل تصنيف" : "تصنيف جديد"}</h2>

      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="category-id" style={labelStyle}>
          المعرف (ID):
        </label>
        <input
          id="category-id"
          value={draft.id}
          onChange={(event) => setDraft({ ...draft, id: event.target.value })}
          style={fieldStyle(theme)}
          disabled={isExisting}
        />
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="category-label" style={labelStyle}>
          الاسم:
        </label>
        <input
          id="category-label"
          value={draft.label}
          onChange={(event) => setDraft({ ...draft, label: event.target.value })}
          style={fieldStyle(theme)}
        />
      </div>

      <div style={{ marginBottom: "1rem", display: "flex", gap: "1rem" }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="category-icon" style={labelStyle}>
            الأيقونة:
          </label>
          <input
            id="category-icon"
            value={draft.icon}
            onChange={(event) => setDraft({ ...draft, icon: event.target.value })}
            style={fieldStyle(theme)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="category-color" style={labelStyle}>
            اللون:
          </label>
          <input
            id="category-color"
            type="color"
            value={draft.color}
            onChange={(event) => setDraft({ ...draft, color: event.target.value })}
            style={{ ...fieldStyle(theme), height: "38px" }}
          />
        </div>
      </div>

      <div style={submitRowStyle}>
        <button type="submit" data-testid="form-save" style={growButtonStyle("#2ecc71")}>
          حفظ
        </button>
        <button type="button" onClick={onCancel} style={growButtonStyle("#e74c3c")}>
          إلغاء
        </button>
      </div>
    </form>
  );
}
