import type { ReactNode } from "react";

import type { Theme } from "../theme";

interface ModalProps {
  theme: Theme;
  children: ReactNode;
}

/** Full-screen overlay wrapping the edit forms. */
export function Modal({ theme, children }: ModalProps) {
  return (
    <div
      data-testid="modal-overlay"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1rem",
      }}
    >
      <div
        style={{
          background: theme.bg,
          padding: "2rem",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "500px",
          maxHeight: "90vh",
          overflowY: "auto",
          border: `1px solid ${theme.border}`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
