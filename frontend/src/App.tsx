import { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface Category {
  id: string;
  label: string;
  icon: string;
  color: string;
}

export interface Question {
  id: number;
  question_text: string;
  category_id: string;
  category_label: string;
  icon: string;
  color: string;
}

export interface Answer {
  id: number;
  question_id: number;
  answer_text: string;
}

export interface QuestionWithAnswers extends Question {
  answers: Answer[];
}

export default function InterviewGuide() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [questions, setQuestions] = useState<QuestionWithAnswers[]>([]);
  const [activeCategory, setActiveCategory] = useState("laravel-core");
  const [openQuestion, setOpenQuestion] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Manage Mode States
  const [isManageMode, setIsManageMode] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Partial<QuestionWithAnswers> | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showQuestionForm, setShowQuestionForm] = useState(false);

  // Fetch categories and questions on mount
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch categories
      const categoriesResponse = await fetch(`${API_URL}/api/categories`);
      if (!categoriesResponse.ok)
        throw new Error("Failed to fetch categories");
      const categoriesData = await categoriesResponse.json();
      setCategories(categoriesData);

      // Keep the selected tab valid: fall back to the first category when the
      // default one no longer exists (e.g. it was deleted in manage mode).
      setActiveCategory((current) =>
        categoriesData.some((c: Category) => c.id === current)
          ? current
          : (categoriesData[0]?.id ?? ""),
      );

      // Fetch questions (now including answers from backend)
      const questionsResponse = await fetch(`${API_URL}/api/questions`);
      if (!questionsResponse.ok) throw new Error("Failed to fetch questions");
      const questionsData = await questionsResponse.json();

      setQuestions(questionsData);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load data. Is the API running?",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Loading data from the API on mount is a legitimate effect: the request
    // is an external subscription, and the setState calls happen inside it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, []);

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;

    try {
      const isNew = !categories.find((c) => c.id === editingCategory.id);
      const url = isNew
        ? `${API_URL}/api/categories`
        : `${API_URL}/api/categories/${editingCategory.id}`;

      const response = await fetch(url, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingCategory),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? `Failed to save category (${response.status})`);
        return;
      }

      setShowCategoryForm(false);
      setEditingCategory(null);
      setError(null);
      fetchData();
    } catch (err) {
      console.error("Error saving category:", err);
      setError("Error saving category. Is the API running?");
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (
      !confirm(
        "Delete this category? Every question inside it and all of their answers will be permanently deleted.",
      )
    )
      return;
    try {
      const response = await fetch(`${API_URL}/api/categories/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? `Failed to delete category (${response.status})`);
        return;
      }
      setError(null);
      fetchData();
    } catch (err) {
      console.error("Error deleting category:", err);
      setError("Error deleting category. Is the API running?");
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;

    try {
      const isNew = !editingQuestion.id;
      const url = isNew
        ? `${API_URL}/api/questions`
        : `${API_URL}/api/questions/${editingQuestion.id}`;

      const response = await fetch(url, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editingQuestion,
          category_id: editingQuestion.category_id || activeCategory,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? `Failed to save question (${response.status})`);
        return;
      }

      setShowQuestionForm(false);
      setEditingQuestion(null);
      setError(null);
      fetchData();
    } catch (err) {
      console.error("Error saving question:", err);
      setError("Error saving question. Is the API running?");
    }
  };

  const handleDeleteQuestion = async (id: number) => {
    if (!confirm("Delete this question and its answers?")) return;
    try {
      const response = await fetch(`${API_URL}/api/questions/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? `Failed to delete question (${response.status})`);
        return;
      }
      setError(null);
      fetchData();
    } catch (err) {
      console.error("Error deleting question:", err);
      setError("Error deleting question. Is the API running?");
    }
  };

  const filtered = search.trim()
    ? questions
        .filter(
          (q) =>
            q.question_text.includes(search) ||
            (q.answers || []).some((a) => a.answer_text.includes(search)),
        )
        .map((q) => ({
          ...q,
          catColor: q.color,
          catLabel: q.category_label,
        }))
    : questions
        .filter((q) => q.category_id === activeCategory)
        .map((q) => ({
          ...q,
          catColor: q.color,
          catLabel: q.category_label,
        }));

  const totalQ = questions.length;

  const theme = {
    bg: isDarkMode ? "#0d0d0d" : "#f5f7fa",
    text: isDarkMode ? "#e8e8e8" : "#2c3e50",
    headerBg: isDarkMode 
      ? "linear-gradient(135deg, #1a0533 0%, #0d1a2e 50%, #0d0d0d 100%)"
      : "linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)",
    cardBg: isDarkMode ? "#111" : "#ffffff",
    cardBgOpen: isDarkMode ? "#141414" : "#f9f9f9",
    border: isDarkMode ? "#1e1e1e" : "#e1e8ed",
    tabBg: isDarkMode ? "#0f0f0f" : "#ffffff",
    searchBg: isDarkMode ? "#1a1a1a" : "#ffffff",
    searchBorder: isDarkMode ? "#333" : "#d1d8e0",
    footerText: isDarkMode ? "#333" : "#aaa",
    subText: isDarkMode ? "#555" : "#7f8c8d",
    mutedText: isDarkMode ? "#666" : "#95a5a6",
    answerText: isDarkMode ? "#c8c8c8" : "#4b5563",
  };

  if (loading && questions.length === 0) {
    return (
      <div
        style={{
          fontFamily: "'Tajawal', 'Cairo', sans-serif",
          direction: "rtl",
          background: theme.bg,
          minHeight: "100vh",
          color: theme.text,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
            جاري التحميل...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: "'Tajawal', 'Cairo', sans-serif",
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

      {/* Header */}
      <div
        style={{
          background: theme.headerBg,
          padding: "2.5rem 2rem 2rem",
          borderBottom: `1px solid ${theme.border}`,
          textAlign: "center",
          position: "relative"
        }}
      >
        <div style={{ position: "absolute", top: "1rem", left: "1rem", display: "flex", gap: "0.5rem" }}>
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            style={{
              padding: "0.4rem 0.8rem",
              background: isDarkMode ? "#333" : "#fff",
              color: isDarkMode ? "white" : "#333",
              border: `1px solid ${theme.border}`,
              borderRadius: "4px",
              fontSize: "0.7rem",
              cursor: "pointer",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
            }}
          >
            {isDarkMode ? "☀️ وضع النهار" : "🌙 وضع الليل"}
          </button>
          
          <button 
            onClick={() => setIsManageMode(!isManageMode)}
            style={{
              padding: "0.4rem 0.8rem",
              background: isManageMode ? "#ff4444" : isDarkMode ? "#333" : "#fff",
              color: isManageMode ? "white" : isDarkMode ? "white" : "#333",
              border: `1px solid ${theme.border}`,
              borderRadius: "4px",
              fontSize: "0.7rem",
              cursor: "pointer",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
            }}
          >
            {isManageMode ? "إغلاق الإدارة" : "وضع الإدارة"}
          </button>
        </div>

        <div
          style={{
            fontSize: "0.75rem",
            letterSpacing: "0.3em",
            color: theme.mutedText,
            marginBottom: "0.75rem",
            textTransform: "uppercase",
          }}
        >
          دليل المقابلات الشامل
        </div>
        <h1
          style={{
            fontSize: "clamp(1.6rem, 4vw, 2.5rem)",
            fontWeight: 900,
            margin: 0,
            background:
              "linear-gradient(90deg, #FF4444, #FF8C00, #2979FF, #AA00FF)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Laravel · Node.js · React · React Native · Backend
        </h1>
        <div style={{ color: theme.subText, marginTop: "0.5rem", fontSize: "0.9rem" }}>
          {totalQ} سؤال وإجابة موثّقة
        </div>

        {/* Search */}
        {!isManageMode && (
          <div
            style={{
              marginTop: "1.5rem",
              maxWidth: "420px",
              margin: "1.5rem auto 0",
            }}
          >
            <input
              placeholder="🔍  ابحث في الأسئلة..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOpenQuestion(null);
              }}
              style={{
                width: "100%",
                padding: "0.75rem 1.25rem",
                borderRadius: "50px",
                border: `1px solid ${theme.searchBorder}`,
                background: theme.searchBg,
                color: theme.text,
                fontSize: "0.95rem",
                outline: "none",
                boxSizing: "border-box",
                textAlign: "right",
                boxShadow: isDarkMode ? "none" : "0 4px 12px rgba(0,0,0,0.05)"
              }}
            />
          </div>
        )}
      </div>

      {/* Admin Controls */}
      {isManageMode && (
        <div style={{ padding: "1rem", background: theme.cardBg, borderBottom: `1px solid ${theme.border}`, display: "flex", gap: "1rem", justifyContent: "center" }}>
          <button 
            onClick={() => { setEditingCategory({ id: "", label: "", icon: "📁", color: "#666666" }); setShowCategoryForm(true); }}
            style={{ padding: "0.5rem 1rem", background: "#2ecc71", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
          >
            + تصنيف جديد
          </button>
          <button 
            onClick={() => { setEditingQuestion({ question_text: "", category_id: activeCategory, answers: [{ id: Date.now(), question_id: 0, answer_text: "" }] }); setShowQuestionForm(true); }}
            style={{ padding: "0.5rem 1rem", background: "#3498db", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
          >
            + سؤال جديد
          </button>
        </div>
      )}

      {/* Category Tabs */}
      {!search && (
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            padding: "1.25rem 1.5rem",
            overflowX: "auto",
            borderBottom: `1px solid ${theme.border}`,
            background: theme.tabBg,
          }}
        >
          {categories.map((cat) => {
            const active = activeCategory === cat.id;
            const questionCount = questions.filter(
              (q) => q.category_id === cat.id,
            ).length;
            return (
              <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                <button
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setOpenQuestion(null);
                  }}
                  style={{
                    padding: "0.55rem 1.1rem",
                    borderRadius: "50px",
                    border: active
                      ? `1.5px solid ${cat.color}`
                      : `1.5px solid ${theme.border}`,
                    background: active ? `${cat.color}18` : "transparent",
                    color: active ? cat.color : theme.mutedText,
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    fontWeight: active ? 700 : 400,
                    whiteSpace: "nowrap",
                    fontFamily: "inherit",
                    transition: "all 0.2s",
                  }}
                >
                  {cat.icon} {cat.label}
                  <span style={{ marginRight: "0.4rem", fontSize: "0.75rem", opacity: 0.7 }}>
                    ({questionCount})
                  </span>
                </button>
                {isManageMode && (
                  <div style={{ display: "flex", gap: "2px" }}>
                    <button onClick={() => { setEditingCategory(cat); setShowCategoryForm(true); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem" }}>✏️</button>
                    <button onClick={() => handleDeleteCategory(cat.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem" }}>🗑️</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Forms Overlay */}
      {(showCategoryForm || showQuestionForm) && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
          <div style={{ background: theme.bg, padding: "2rem", borderRadius: "12px", width: "100%", maxWidth: "500px", maxHeight: "90vh", overflowY: "auto", border: `1px solid ${theme.border}` }}>
            {showCategoryForm && editingCategory && (
              <form onSubmit={handleSaveCategory}>
                <h2 style={{ marginTop: 0 }}>{categories.find(c => c.id === editingCategory.id) ? "تعديل تصنيف" : "تصنيف جديد"}</h2>
                <div style={{ marginBottom: "1rem" }}>
                  <label htmlFor="category-id" id="category-id-label" style={{ display: "block", marginBottom: "0.5rem" }}>المعرف (ID):</label>
                  <input
                    id="category-id"
                    value={editingCategory.id} 
                    onChange={e => setEditingCategory({...editingCategory, id: e.target.value})}
                    style={{ width: "100%", padding: "0.5rem", background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.text, borderRadius: "4px" }}
                    disabled={!!categories.find(c => c.id === editingCategory.id)}
                  />
                </div>
                <div style={{ marginBottom: "1rem" }}>
                  <label htmlFor="category-label" id="category-label-label" style={{ display: "block", marginBottom: "0.5rem" }}>الاسم:</label>
                  <input
                    id="category-label"
                    value={editingCategory.label} 
                    onChange={e => setEditingCategory({...editingCategory, label: e.target.value})}
                    style={{ width: "100%", padding: "0.5rem", background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.text, borderRadius: "4px" }}
                  />
                </div>
                <div style={{ marginBottom: "1rem", display: "flex", gap: "1rem" }}>
                  <div style={{ flex: 1 }}>
                    <label htmlFor="category-icon" id="category-icon-label" style={{ display: "block", marginBottom: "0.5rem" }}>الأيقونة:</label>
                    <input 
                      value={editingCategory.icon} 
                      onChange={e => setEditingCategory({...editingCategory, icon: e.target.value})}
                      style={{ width: "100%", padding: "0.5rem", background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.text, borderRadius: "4px" }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label htmlFor="category-color" id="category-color-label" style={{ display: "block", marginBottom: "0.5rem" }}>اللون:</label>
                    <input
                      id="category-color"
                      type="color"
                      value={editingCategory.color} 
                      onChange={e => setEditingCategory({...editingCategory, color: e.target.value})}
                      style={{ width: "100%", height: "38px", background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.text, borderRadius: "4px" }}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: "1rem", marginTop: "2rem" }}>
                  <button type="submit" style={{ flex: 1, padding: "0.75rem", background: "#2ecc71", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>حفظ</button>
                  <button type="button" onClick={() => setShowCategoryForm(false)} style={{ flex: 1, padding: "0.75rem", background: "#e74c3c", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>إلغاء</button>
                </div>
              </form>
            )}

            {showQuestionForm && editingQuestion && (
              <form onSubmit={handleSaveQuestion}>
                <h2 style={{ marginTop: 0 }}>{editingQuestion.id ? "تعديل سؤال" : "سؤال جديد"}</h2>
                <div style={{ marginBottom: "1rem" }}>
                  <label htmlFor="question-category" id="question-category-label" style={{ display: "block", marginBottom: "0.5rem" }}>التصنيف:</label>
                  <select
                    id="question-category"
                    value={editingQuestion.category_id}
                    onChange={e => setEditingQuestion({...editingQuestion, category_id: e.target.value})}
                    style={{ width: "100%", padding: "0.5rem", background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.text, borderRadius: "4px" }}
                  >
                    {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: "1rem" }}>
                  <label htmlFor="question-text" id="question-text-label" style={{ display: "block", marginBottom: "0.5rem" }}>السؤال:</label>
                  <textarea
                    id="question-text"
                    value={editingQuestion.question_text} 
                    onChange={e => setEditingQuestion({...editingQuestion, question_text: e.target.value})}
                    style={{ width: "100%", padding: "0.5rem", background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.text, borderRadius: "4px", minHeight: "80px" }}
                  />
                </div>
                <div style={{ marginBottom: "1rem" }}>
                  <label htmlFor="question-answers" id="question-answers-label" style={{ display: "block", marginBottom: "0.5rem" }}>الإجابات:</label>
                  {editingQuestion.answers?.map((ans, idx) => (
                    <div key={ans.id} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <textarea 
                        value={ans.answer_text} 
                        onChange={e => {
                          const newAnswers = [...(editingQuestion.answers || [])];
                          newAnswers[idx] = { ...newAnswers[idx], answer_text: e.target.value };
                          setEditingQuestion({...editingQuestion, answers: newAnswers});
                        }}
                        style={{ flex: 1, padding: "0.5rem", background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.text, borderRadius: "4px" }}
                      />
                      <button 
                        type="button" 
                        onClick={() => {
                          const newAnswers = (editingQuestion.answers || []).filter((_, i) => i !== idx);
                          setEditingQuestion({...editingQuestion, answers: newAnswers});
                        }}
                        style={{ background: "#e74c3c", color: "white", border: "none", borderRadius: "4px", padding: "0 0.5rem" }}
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                  <button 
                    type="button" 
                    onClick={() => {
                      const newAnswers = [...(editingQuestion.answers || []), { id: Date.now(), question_id: editingQuestion.id || 0, answer_text: "" }];
                      setEditingQuestion({...editingQuestion, answers: newAnswers});
                    }}
                    style={{ width: "100%", padding: "0.5rem", background: theme.cardBg, border: `1px dashed ${theme.mutedText}`, color: theme.mutedText, borderRadius: "4px", cursor: "pointer" }}
                  >
                    + إضافة إجابة أخرى
                  </button>
                </div>
                <div style={{ display: "flex", gap: "1rem", marginTop: "2rem" }}>
                  <button type="submit" style={{ flex: 1, padding: "0.75rem", background: "#2ecc71", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>حفظ</button>
                  <button type="button" onClick={() => setShowQuestionForm(false)} style={{ flex: 1, padding: "0.75rem", background: "#e74c3c", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>إلغاء</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            margin: "1rem 1.5rem 0",
            padding: "0.85rem 1.1rem",
            borderRadius: "8px",
            border: `1px solid ${isDarkMode ? "#7f1d1d" : "#fca5a5"}`,
            background: isDarkMode ? "#2a1414" : "#fef2f2",
            color: isDarkMode ? "#fca5a5" : "#991b1b",
            fontSize: "0.9rem",
            maxWidth: "860px",
            marginInline: "auto",
          }}
        >
          <span aria-hidden="true">⚠️</span>
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={fetchData}
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
            onClick={() => setError(null)}
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
      )}

      {/* Questions List */}
      <div style={{ padding: "1.5rem", maxWidth: "860px", margin: "0 auto" }}>
        {search && (
          <div
            style={{ color: theme.subText, fontSize: "0.85rem", marginBottom: "1rem" }}
          >
            نتائج البحث: {filtered.length} سؤال
          </div>
        )}

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", color: theme.mutedText, padding: "3rem" }}>لا توجد نتائج</div>
        )}

        {filtered.map((item, i) => {
          const isOpen = openQuestion === i;
          return (
            <div
              key={i}
              style={{
                marginBottom: "0.75rem",
                border: `1px solid ${isOpen ? item.catColor + "44" : theme.border}`,
                borderRadius: "12px",
                overflow: "hidden",
                background: isOpen ? theme.cardBgOpen : theme.cardBg,
                transition: "all 0.25s",
                boxShadow: isDarkMode ? "none" : "0 2px 8px rgba(0,0,0,0.05)"
              }}
            >
              <div style={{ display: "flex", alignItems: "center" }}>
                <button
                  onClick={() => setOpenQuestion(isOpen ? null : i)}
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
                    style={{
                      color: item.catColor,
                      fontSize: "1.1rem",
                      flexShrink: 0,
                    }}
                  >
                    {isOpen ? "▾" : "▸"}
                  </span>
                  <span style={{ flex: 1, lineHeight: 1.5 }}>
                    {item.question_text}
                  </span>
                  {search && (
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: item.catColor,
                        border: `1px solid ${item.catColor}44`,
                        padding: "2px 8px",
                        borderRadius: "20px",
                        flexShrink: 0,
                      }}
                    >
                      {item.catLabel}
                    </span>
                  )}
                </button>
                {isManageMode && (
                  <div style={{ padding: "0 1rem", display: "flex", gap: "0.5rem" }}>
                    <button onClick={() => { setEditingQuestion(item); setShowQuestionForm(true); }} style={{ background: "none", border: "none", cursor: "pointer" }}>✏️</button>
                    <button onClick={() => handleDeleteQuestion(item.id)} style={{ background: "none", border: "none", cursor: "pointer" }}>🗑️</button>
                  </div>
                )}
              </div>

              {isOpen && (
                <div style={{ padding: "0 1.25rem 1.25rem 1.25rem" }}>
                  <div
                    style={{
                      height: "1px",
                      background: `${item.catColor}22`,
                      marginBottom: "1rem",
                    }}
                  />
                  {(item.answers || []).map((answer, answerIndex) => (
                    <div
                      key={answer.id}
                      style={{
                        marginBottom:
                          answerIndex < (item.answers || []).length - 1 ? "1rem" : 0,
                        position: "relative",
                        paddingRight: "1.5rem",
                        borderRight: `2px solid ${item.catColor}33`
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
        })}
      </div>

      {/* Footer */}
      <div
        style={{
          textAlign: "center",
          padding: "2rem",
          color: theme.footerText,
          fontSize: "0.8rem",
          borderTop: `1px solid ${theme.border}`,
        }}
      >
        {totalQ} سؤال • Laravel · Node.js · React · React Native · Backend ·
        System Design · Testing
      </div>
    </div>
  );
}
