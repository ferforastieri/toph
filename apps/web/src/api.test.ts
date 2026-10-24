import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

describe("api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = "toph_csrf=; Max-Age=0; path=/";
  });

  it("sends the CSRF header on unsafe requests", async () => {
    document.cookie = "toph_csrf=csrf-value; path=/";
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            path: "main.go",
            content: "package main\n",
            hash: "hash",
            modTime: "now",
            size: 13,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.saveFile("project", "main.go", "package main\n", "old-hash");

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(request.headers);
    expect(headers.get("X-Toph-CSRF")).toBe("csrf-value");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("throws ApiError with the server message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ error: "invalid credentials" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(api.me()).rejects.toMatchObject({
      status: 401,
      message: "invalid credentials",
    });
  });
});
