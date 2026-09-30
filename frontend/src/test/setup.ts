import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  // A test that drives the debounce with fake timers can leave them installed,
  // which would stall the timers the next test relies on.
  vi.useRealTimers();
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
