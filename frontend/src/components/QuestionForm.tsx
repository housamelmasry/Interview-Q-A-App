import { useState } from "react";

import type { Category, Difficulty, Question, QuestionInput } from "../api/types";
import { DIFFICULTY_LABELS, DIFFICULTY_LEVELS } from "../constants";
import type { Theme } from "../theme";
import {
  fieldStyle,
  growButtonStyle,
  labelStyle,
  solidButtonStyle,
  submitRowStyle,
  textareaStyle,
} from "./styles";

interface QuestionFormProps {
  theme: Theme;
  /** The question being edited, or null while creating a new one. */
  initial: Question | null;
  categories: Category[];
  /** Category a brand new question lands in. */
  fallbackCategoryId: string;
  onSave: (input: QuestionInput) => void;
  onCancel: () => void;
}

interface DraftAnswer {
  /** Stable list key: answer ids from the API are reused while editing. */
  key: number;
  answer_text: string;
}

/** Answer drafts only need keys unique to the open form. */
let keySequence = 0;
const nextKey = () => (keySequence += 1);

/** Commas separate tags, so `laravel, facades` becomes two entries. */
const parseTags = (raw: string): string[] =>
  raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

export function QuestionForm({
  theme,
  initial,
  categories,
  fallbackCategoryId,
  onSave,
  onCancel,
}: QuestionFormProps) {
  const [questionText, setQuestionText] = useState(initial?.question_text ?? "");
  const [categoryId, setCategoryId] = useState(
    initial?.category_id ?? fallbackCategoryId,
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(
    initial?.difficulty ?? "intermediate",
  );
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [answers, setAnswers] = useState<DraftAnswer[]>(() => {
    if (!initial) return [{ key: nextKey(), answer_text: "" }];
    return initial.answers.map((answer) => ({
      key: nextKey(),
      answer_text: answer.answer_text,
    }));
  });

  return (
    <form
      data-testid="question-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          question_text: questionText,
          category_id: categoryId || fallbackCategoryId,
          difficulty,
          tags: parseTags(tags),
          answers: answers.map((answer) => ({ answer_text: answer.answer_text })),
        });
      }}
    >
      <h2 style={{ marginTop: 0 }}>{initial ? "تعديل سؤال" : "سؤال جديد"}</h2>

      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="question-category" style={labelStyle}>
          التصنيف:
        </label>
        <select
          id="question-category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          style={fieldStyle(theme)}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="question-difficulty" style={labelStyle}>
          المستوى:
        </label>
        <select
          id="question-difficulty"
          value={difficulty}
          onChange={(event) => setDifficulty(event.target.value as Difficulty)}
          style={fieldStyle(theme)}
        >
          {DIFFICULTY_LEVELS.map((level) => (
            <option key={level} value={level}>
              {DIFFICULTY_LABELS[level]}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="question-tags" style={labelStyle}>
          الوسوم:
        </label>
        <input
          id="question-tags"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="laravel, facades"
          style={fieldStyle(theme)}
        />
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="question-text" style={labelStyle}>
          السؤال:
        </label>
        <textarea
          id="question-text"
          value={questionText}
          onChange={(event) => setQuestionText(event.target.value)}
          style={textareaStyle(theme)}
        />
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <span style={labelStyle}>الإجابات:</span>
        {answers.map((answer, index) => (
          <div
            key={answer.key}
            style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}
          >
            <textarea
              aria-label={`الإجابة ${index + 1}`}
              value={answer.answer_text}
              onChange={(event) =>
                setAnswers(
                  answers.map((current, i) =>
                    i === index
                      ? { ...current, answer_text: event.target.value }
                      : current,
                  ),
                )
              }
              style={{ ...textareaStyle(theme), flex: 1, minHeight: "60px" }}
            />
            <button
              type="button"
              aria-label="حذف الإجابة"
              onClick={() => setAnswers(answers.filter((_, i) => i !== index))}
              style={solidButtonStyle("#e74c3c")}
            >
              🗑️
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setAnswers([...answers, { key: nextKey(), answer_text: "" }])}
          style={{
            ...fieldStyle(theme),
            border: `1px dashed ${theme.mutedText}`,
            color: theme.mutedText,
            cursor: "pointer",
          }}
        >
          + إضافة إجابة أخرى
        </button>
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
