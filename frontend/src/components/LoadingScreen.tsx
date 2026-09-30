import type { Theme } from "../theme";
import { FONT_STACK } from "../theme";

export function LoadingScreen({ theme }: { theme: Theme }) {
  return (
    <div
      data-testid="loading-screen"
      style={{
        fontFamily: FONT_STACK,
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
        <div style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>جاري التحميل...</div>
      </div>
    </div>
  );
}
