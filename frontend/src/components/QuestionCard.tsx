import type { Question } from "../api/types";
import { DIFFICULTY_COLORS, DIFFICULTY_LABELS } from "../constants";
import type { Theme } from "../theme";
import { withAlpha } from "../theme";
import { badgeStyle, ghostButtonStyle } from "./styles";

interface QuestionCardProps {
  theme: Theme;
  question: Question;
  isOpen: boolean;
  /** Search spans every category, so each hit carries its own label. */
  showCategory: boolean;
  isManageMode: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function QuestionCard({
  theme,
  question,
  isOpen,
  showCategory,
  isManageMode,
  onToggle,
  onEdit,
  onDelete,
}: QuestionCardProps) {
  const difficultyColor = DIFFICULTY_COLORS[question.difficulty];

  return (
    <div
      data-testid="question-card"
      style={{
        marginBottom: "0.75rem",
        border: `1px solid ${isOpen ? question.color + "44" : theme.border}`,
        borderRadius: "12px",
        overflow: "hidden",
        background: isOpen ? theme.cardBgOpen : theme.cardBg,
        transition: "all 0.25s",
        boxShadow: theme.isDark ? "none" : "0 2px 8px rgba(0,0,0,0.05)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        <button
          data-testid={`question-toggle-${question.id}`}
          onClick={onToggle}
          aria-expanded={isOpen}
          style={{
            flex: 1,
            padding: "1.1rem 1.25rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            textAlign: "right",
            color: theme.text,
            fontFamily: "inherit",
            fontSize: "1rem",
            fontWeight: 600,
          }}
        >
          <span
            style={{ color: question.color, fontSize: "1.1rem", flexShrink: 0 }}
          >
            {isOpen ? "▾" : "▸"}
          </span>
          <span style={{ flex: 1, lineHeight: 1.5 }}>{question.question_text}</span>
          {showCategory && (
            <span data-testid="question-category" style={badgeStyle(question.color)}>
              {question.category_label}
            </span>
          )}
        </button>
        {isManageMode && (
          <div style={{ padding: "0 1rem", display: "flex", gap: "0.5rem" }}>
            <button
              data-testid={`question-edit-${question.id}`}
              onClick={onEdit}
              aria-label={`تعديل السؤال`}
              style={ghostButtonStyle}
            >
              ✏️
            </button>
            <button
              data-testid={`question-delete-${question.id}`}
              onClick={onDelete}
              aria-label={`حذف السؤال`}
              style={ghostButtonStyle}
            >
              🗑️
            </button>
          </div>
        )}
      </div>

      <div
        data-testid="question-meta"
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.4rem",
          padding: isOpen ? "0.75rem 1.25rem 0" : "0.75rem 1.25rem 1.1rem",
        }}
      >
        <span
          data-testid="question-difficulty"
          style={{ ...badgeStyle(difficultyColor), fontWeight: 700 }}
        >
          {DIFFICULTY_LABELS[question.difficulty]}
        </span>
        {question.tags.map((tag) => (
          <span
            key={tag}
            data-testid="question-tag"
            style={{
              ...badgeStyle(theme.mutedText),
              background: "transparent",
              border: `1px dashed ${withAlpha(theme.mutedText, "44")}`,
            }}
          >
            #{tag}
          </span>
        ))}
      </div>

      {isOpen && (
        <div style={{ padding: "0 1.25rem 1.25rem 1.25rem" }}>
          <div
            style={{
              height: "1px",
              background: withAlpha(question.color, "22"),
              marginBottom: "1rem",
            }}
          />
          {question.answers.map((answer, index) => (
            <div
              key={answer.id}
              data-testid="question-answer"
              style={{
                marginBottom:
                  index < question.answers.length - 1 ? "1rem" : 0,
                position: "relative",
                paddingRight: "1.5rem",
                borderRight: `2px solid ${withAlpha(question.color, "33")}`,
              }}
            >
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  fontFamily: "inherit",
                  fontSize: "0.92rem",
                  lineHeight: 1.8,
                  color: theme.answerText,
                }}
              >
                {answer.answer_text}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
