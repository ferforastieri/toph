import { describe, expect, it } from "vitest";
import { isImagePath } from "./image";

describe("isImagePath", () => {
  it("recognises raster images regardless of case", () => {
    expect(isImagePath("assets/logo.PNG")).toBe(true);
    expect(isImagePath("docs/photo.jpeg")).toBe(true);
    expect(isImagePath("img/anim.webp")).toBe(true);
    expect(isImagePath("favicon.ico")).toBe(true);
  });

  it("keeps text and code files in the editor", () => {
    expect(isImagePath("src/main.ts")).toBe(false);
    expect(isImagePath("README.md")).toBe(false);
    expect(isImagePath("icon.svg")).toBe(false);
    expect(isImagePath("Makefile")).toBe(false);
    expect(isImagePath("")).toBe(false);
    expect(isImagePath(undefined)).toBe(false);
  });

  it("handles windows separators and query strings", () => {
    expect(isImagePath("C:\\repo\\assets\\shot.jpg")).toBe(true);
    expect(isImagePath("assets/shot.png?v=2")).toBe(true);
  });
});
