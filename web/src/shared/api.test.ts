import { afterEach, describe, expect, it, vi } from "vitest";
import { api, setApiBase } from "./api";

describe("api client", () => {
  afterEach(() => {
    setApiBase("");
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

  it("shares concurrent reads but fetches fresh data after completion", async () => {
    let complete!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { complete = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const first = api.projects();
    const second = api.projects();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    complete(new Response(JSON.stringify([{ id: "one" }])));
    expect(await first).toEqual(await second);
    const next = api.projects();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    complete(new Response("[]"));
    expect(await next).toEqual([]);
  });

  it("does not reuse reads across mutations or server switches", async () => {
    const responses: Array<(value: Response) => void> = [];
    const fetchMock = vi.fn((_input: RequestInfo | URL) => new Promise<Response>((resolve) => { responses.push(resolve); }));
    vi.stubGlobal("fetch", fetchMock);
    const oldRead = api.projects();
    const logout = api.logout();
    const afterLogout = api.projects();
    setApiBase("https://other.example");
    const otherServer = api.projects();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][0]).toBe("https://other.example/api/projects");
    responses.forEach((resolve) => resolve(new Response("[]")));
    await Promise.all([oldRead, logout, afterLogout, otherServer]);
  });

  it("releases failed reads so a retry can succeed", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response("[]"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.projects()).rejects.toThrow("offline");
    await expect(api.projects()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
