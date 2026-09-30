import { useMemo, useState } from "react";

import {
  createCategory,
  createQuestion,
  deleteCategory,
  deleteQuestion,
  updateCategory,
  updateQuestion,
} from "./api/client";
import type { Category, CategoryInput, Question, QuestionInput } from "./api/types";
import { CategoryForm } from "./components/CategoryForm";
import { CategoryTabs } from "./components/CategoryTabs";
import { ErrorBanner } from "./components/ErrorBanner";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { LoadingScreen } from "./components/LoadingScreen";
import { ManageToolbar } from "./components/ManageToolbar";
import { Modal } from "./components/Modal";
import { Pagination } from "./components/Pagination";
import { QuestionForm } from "./components/QuestionForm";
import { QuestionList } from "./components/QuestionList";
import { SearchBar } from "./components/SearchBar";
import { DEFAULT_CATEGORY_ID, PAGE_SIZE, SEARCH_DEBOUNCE_MS } from "./constants";
import { useCategories } from "./hooks/useCategories";
import { useDebounce } from "./hooks/useDebounce";
import { useQuestions } from "./hooks/useQuestions";
import { useStats } from "./hooks/useStats";
import { FONT_STACK, createTheme } from "./theme";

const CATEGORY_DELETE_WARNING =
  "Delete this category? Every question inside it and all of their answers will be permanently deleted.";

const QUESTION_DELETE_WARNING = "Delete this question and its answers?";

export default function InterviewGuide() {
  // View state
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isManageMode, setIsManageMode] = useState(false);
  const [openQuestionId, setOpenQuestionId] = useState<number | null>(null);

  // Browse state: the three inputs that decide which page of questions is shown
  const [selectedCategory, setSelectedCategory] = useState(DEFAULT_CATEGORY_ID);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

  // Manage mode state
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const theme = useMemo(() => createTheme(isDarkMode), [isDarkMode]);
  const debouncedSearch = useDebounce(searchTerm, SEARCH_DEBOUNCE_MS);

  const {
    categories,
    loading: loadingCategories,
    error: categoriesError,
    reload: reloadCategories,
    clearError: clearCategoriesError,
  } = useCategories();
  const {
    data: stats,
    error: statsError,
    reload: reloadStats,
    clearError: clearStatsError,
  } = useStats();

  // The default category can disappear while in manage mode, so the first one
  // takes over rather than leaving the list pointed at nothing.
  const activeCategory = useMemo(
    () =>
      categories.some((category) => category.id === selectedCategory)
        ? selectedCategory
        : (categories[0]?.id ?? ""),
    [categories, selectedCategory],
  );

  const isSearching = searchTerm.trim().length > 0;
  // True while the typed term has not reached the hook yet, or while its request
  // is still open: the previous total says nothing about the new query.
  const searchPending = searchTerm !== debouncedSearch;

  const questions = useQuestions({
    category: activeCategory,
    searchTerm: debouncedSearch,
    page,
    limit: PAGE_SIZE,
    enabled: activeCategory !== "",
  });

  const reloadAll = () => {
    questions.reload();
    reloadCategories();
    reloadStats();
  };

  const handleSelectCategory = (id: string) => {
    setSelectedCategory(id);
    setPage(1);
    setOpenQuestionId(null);
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setPage(1);
    setOpenQuestionId(null);
  };

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage);
    setOpenQuestionId(null);
  };

  const handleToggleQuestion = (id: number) =>
    setOpenQuestionId((current) => (current === id ? null : id));

  const reportFailure = (cause: unknown) => {
    console.error("Request failed:", cause);
    setFormError(
      cause instanceof Error
        ? cause.message
        : "The request failed. Is the API running?",
    );
  };

  const handleSaveCategory = async (input: CategoryInput) => {
    const exists = categories.some((category) => category.id === input.id);
    const { id, ...fields } = input;
    try {
      if (exists) await updateCategory(id, fields);
      else await createCategory(input);
      setShowCategoryForm(false);
      setEditingCategory(null);
      setFormError(null);
      reloadAll();
    } catch (cause) {
      reportFailure(cause);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm(CATEGORY_DELETE_WARNING)) return;
    try {
      await deleteCategory(id);
      setFormError(null);
      reloadAll();
    } catch (cause) {
      reportFailure(cause);
    }
  };

  const handleSaveQuestion = async (input: QuestionInput) => {
    try {
      if (editingQuestion) await updateQuestion(editingQuestion.id, input);
      else await createQuestion(input);
      setShowQuestionForm(false);
      setEditingQuestion(null);
      setFormError(null);
      reloadAll();
    } catch (cause) {
      reportFailure(cause);
    }
  };

  const handleDeleteQuestion = async (id: number) => {
    if (!confirm(QUESTION_DELETE_WARNING)) return;
    try {
      await deleteQuestion(id);
      setFormError(null);
      reloadAll();
    } catch (cause) {
      reportFailure(cause);
    }
  };

  const error = questions.error ?? categoriesError ?? statsError ?? formError;

  const handleDismissError = () => {
    questions.clearError();
    clearCategoriesError();
    clearStatsError();
    setFormError(null);
  };

  // Hold the whole UI back until the categories land, because the active
  // category decides which questions to ask for. Gating on the question request
  // as well would swap the tree for the loading screen mid-load and throw away
  // whatever the user had already typed.
  const booting = loadingCategories && categories.length === 0;

  if (booting) return <LoadingScreen theme={theme} />;

  return (
    <div
      style={{
        fontFamily: FONT_STACK,
        direction: "rtl",
        background: theme.bg,
        minHeight: "100vh",
        width: "100%",
        color: theme.text,
        transition: "all 0.3s ease",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap"
        rel="stylesheet"
      />

      <Header
        theme={theme}
        stats={stats}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode(!isDarkMode)}
        isManageMode={isManageMode}
        onToggleManageMode={() => setIsManageMode(!isManageMode)}
      >
        {!isManageMode && (
          <SearchBar
            theme={theme}
            value={searchTerm}
            onChange={handleSearchChange}
          />
        )}
      </Header>

      {isManageMode && (
        <ManageToolbar
          theme={theme}
          onNewCategory={() => {
            setEditingCategory(null);
            setShowCategoryForm(true);
          }}
          onNewQuestion={() => {
            setEditingQuestion(null);
            setShowQuestionForm(true);
          }}
        />
      )}

      {!isSearching && (
        <CategoryTabs
          theme={theme}
          categories={categories}
          activeCategory={activeCategory}
          isManageMode={isManageMode}
          onSelect={handleSelectCategory}
          onEdit={(category) => {
            setEditingCategory(category);
            setShowCategoryForm(true);
          }}
          onDelete={handleDeleteCategory}
        />
      )}

      {(showCategoryForm || showQuestionForm) && (
        <Modal theme={theme}>
          {showCategoryForm && (
            <CategoryForm
              theme={theme}
              initial={editingCategory}
              isExisting={
                !!editingCategory &&
                categories.some((category) => category.id === editingCategory.id)
              }
              onSave={handleSaveCategory}
              onCancel={() => setShowCategoryForm(false)}
            />
          )}
          {showQuestionForm && (
            <QuestionForm
              theme={theme}
              initial={editingQuestion}
              categories={categories}
              fallbackCategoryId={activeCategory}
              onSave={handleSaveQuestion}
              onCancel={() => setShowQuestionForm(false)}
            />
          )}
        </Modal>
      )}

      {error && (
        <ErrorBanner
          theme={theme}
          message={error}
          onRetry={reloadAll}
          onDismiss={handleDismissError}
        />
      )}

      <main style={{ padding: "1.5rem", maxWidth: "860px", margin: "0 auto" }}>
        {isSearching && (
          <div
            data-testid="search-summary"
            style={{ color: theme.subText, fontSize: "0.85rem", marginBottom: "1rem" }}
          >
            {searchPending || questions.loading
              ? "جاري البحث..."
              : `نتائج البحث: ${questions.total} سؤال`}
          </div>
        )}

        <QuestionList
          theme={theme}
          items={questions.items}
          loading={questions.loading}
          openQuestionId={openQuestionId}
          isSearching={isSearching}
          isManageMode={isManageMode}
          onToggle={handleToggleQuestion}
          onEdit={(question) => {
            setEditingQuestion(question);
            setShowQuestionForm(true);
          }}
          onDelete={handleDeleteQuestion}
        />

        <Pagination
          theme={theme}
          page={page}
          pages={questions.pages}
          total={questions.total}
          onPageChange={handlePageChange}
        />
      </main>

      <Footer theme={theme} totalQuestions={stats.total_questions} />
    </div>
  );
}
