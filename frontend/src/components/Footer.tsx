import type { Theme } from "../theme";

interface FooterProps {
  theme: Theme;
  totalQuestions: number;
}

export function Footer({ theme, totalQuestions }: FooterProps) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "2rem",
        color: theme.footerText,
        fontSize: "0.8rem",
        borderTop: `1px solid ${theme.border}`,
      }}
    >
      {totalQuestions} سؤال • Laravel · Node.js · React · React Native · Backend ·
      System Design · Testing
    </div>
  );
}
