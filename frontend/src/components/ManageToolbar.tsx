import type { Theme } from "../theme";
import { solidButtonStyle } from "./styles";

interface ManageToolbarProps {
  theme: Theme;
  onNewCategory: () => void;
  onNewQuestion: () => void;
}

/** Create shortcuts, only rendered in manage mode. */
export function ManageToolbar({ theme, onNewCategory, onNewQuestion }: ManageToolbarProps) {
  return (
    <div
      style={{
        padding: "1rem",
        background: theme.cardBg,
        borderBottom: `1px solid ${theme.border}`,
        display: "flex",
        gap: "1rem",
        justifyContent: "center",
      }}
    >
      <button
        data-testid="new-category"
        onClick={onNewCategory}
        style={solidButtonStyle("#2ecc71")}
      >
        + تصنيف جديد
      </button>
      <button
        data-testid="new-question"
        onClick={onNewQuestion}
        style={solidButtonStyle("#3498db")}
      >
        + سؤال جديد
      </button>
    </div>
  );
}
