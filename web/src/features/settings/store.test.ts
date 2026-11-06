import { afterEach, describe, expect, it } from "vitest";
import { useSettings } from "./store";

const originalTheme = useSettings.getState().theme;

afterEach(() => useSettings.getState().setTheme(originalTheme));

describe("appearance settings", () => {
  it("changes the active theme when the single toggle is clicked", () => {
    useSettings.getState().setTheme("light");
    expect(useSettings.getState().theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    useSettings.getState().setTheme("dark");
    expect(useSettings.getState().theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
