import { describe, expect, it } from "vitest";

import { createTheme, withAlpha } from "./theme";

describe("withAlpha", () => {
  it("passes 6-digit hex colours through and appends the alpha", () => {
    expect(withAlpha("#2ecc71", "44")).toBe("#2ecc7144");
  });

  // Regression: `#666` + `44` used to produce `#66644`, five hex digits, which is
  // not a valid colour. Browsers and jsdom drop the whole declaration, so the tag
  // pill lost its border in dark mode.
  it("expands 3-digit shorthand before appending the alpha", () => {
    expect(withAlpha("#666", "44")).toBe("#66666644");
    expect(withAlpha("#333", "18")).toBe("#33333318");
  });

  it("is case insensitive and tolerates surrounding whitespace", () => {
    expect(withAlpha("  #ABC  ", "22")).toBe("#aabbcc22");
  });

  it("leaves colours that are not 3- or 6-digit hex untouched", () => {
    expect(withAlpha("transparent", "44")).toBe("transparent");
    expect(withAlpha("rgb(1, 2, 3)", "44")).toBe("rgb(1, 2, 3)");
  });
});

describe("createTheme", () => {
  it("keeps the muted colour and the tab tint consistent in dark mode", () => {
    const dark = createTheme(true);

    // The dark muted colour is a 3-digit shorthand, which is exactly the case
    // that used to break alpha concatenation.
    expect(dark.mutedText).toBe("#666");
    expect(withAlpha(dark.mutedText, "44")).toMatch(/^#[0-9a-f]{8}$/);
  });

  it("produces a valid 8-digit colour for every theme field", () => {
    for (const isDarkMode of [true, false]) {
      const theme = createTheme(isDarkMode);
      const fields = Object.entries(theme).filter(
        ([, value]) => typeof value === "string" && value.startsWith("#"),
      );

      expect(fields.length).toBeGreaterThan(0);
      for (const [field, value] of fields) {
        expect(value, `${field} in ${isDarkMode} mode`).toMatch(
          /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i,
        );
        expect(withAlpha(value, "44"), field).toMatch(/^#[0-9a-f]{8}$/i);
      }
    }
  });
});
