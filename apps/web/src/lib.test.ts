import { describe, expect, it } from "vitest";
import { basename, languageFor, quoteIdentifier } from "./lib";

describe("web helpers", () => {
  it("derives editor languages", () => {
    expect(languageFor("src/main.go")).toBe("go");
    expect(languageFor("src/app.tsx")).toBe("typescript");
    expect(languageFor("Dockerfile")).toBe("dockerfile");
    expect(languageFor("unknown.zzz")).toBe("plaintext");
  });

  it("quotes table identifiers per driver", () => {
    expect(quoteIdentifier("postgres", "public", "users")).toBe('"public"."users"');
    expect(quoteIdentifier("mysql", "app", "users")).toBe("`app`.`users`");
    expect(quoteIdentifier("sqlite", "main", "users")).toBe('"users"');
  });

  it("returns the basename", () => {
    expect(basename("src/main.go")).toBe("main.go");
  });
});
