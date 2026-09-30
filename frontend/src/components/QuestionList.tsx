import type { Question } from "../api/types";
import type { Theme } from "../theme";
import { QuestionCard } from "./QuestionCard";

interface QuestionListProps {
  theme: Theme;
  items: Question[];
  loading: boolean;
  openQuestionId: number | null;
  isSearching: boolean;
  isManageMode: boolean;
  onToggle: (id: number) => void;
  onEdit: (question: Question) => void;
  onDelete: (id: number) => void;
}

/** One page of questions, plus the loading and empty states around it. */
export function QuestionList({
  theme,
  items,
  loading,
  openQuestionId,
  isSearching,
  isManageMode,
  onToggle,
  onEdit,
  onDelete,
}: QuestionListProps) {
  // Refreshing swaps in an inline spinner rather than leaving stale cards up; a
  // cold start never reaches here because the composition root holds the loader.
  if (loading) {
    return (
      <div
        data-testid="questions-loading"
        style={{ textAlign: "center", color: theme.mutedText, padding: "2rem" }}
      >
        جاري التحميل...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        data-testid="questions-empty"
        style={{ textAlign: "center", color: theme.mutedText, padding: "3rem" }}
      >
        لا توجد نتائج
      </div>
    );
  }

  return (
    <div data-testid="question-list">
      {items.map((question) => (
        <QuestionCard
          key={question.id}
          theme={theme}
          question={question}
          isOpen={openQuestionId === question.id}
          showCategory={isSearching}
          isManageMode={isManageMode}
          onToggle={() => onToggle(question.id)}
          onEdit={() => onEdit(question)}
          onDelete={() => onDelete(question.id)}
        />
      ))}
    </div>
  );
}
