import { describe, it, expect, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useDebounce } from "./useDebounce";

const DELAY = 300;

describe("useDebounce", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value straight away", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDebounce("first", DELAY));

    expect(result.current).toBe("first");
  });

  it("holds the old value until the delay has elapsed", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, DELAY),
      { initialProps: { value: "first" } },
    );

    rerender({ value: "second" });
    act(() => {
      vi.advanceTimersByTime(DELAY - 1);
    });
    expect(result.current).toBe("first");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("second");
  });

  it("restarts the clock on every change and only settles once", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, DELAY),
      { initialProps: { value: "" } },
    );

    ["e", "ev", "eve"].forEach((value) => {
      rerender({ value });
      act(() => {
        vi.advanceTimersByTime(DELAY - 1);
      });
      expect(result.current).toBe("");
    });

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("eve");
  });

  it("clears its timer when the caller unmounts", () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const { rerender, unmount } = renderHook(
      ({ value }) => useDebounce(value, DELAY),
      { initialProps: { value: "first" } },
    );

    rerender({ value: "second" });
    expect(clearSpy).toHaveBeenCalled();

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
