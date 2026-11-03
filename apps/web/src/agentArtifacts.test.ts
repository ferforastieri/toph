import { describe, expect, it } from "vitest";
import { extractAgentDiffs, extractAgentFilePaths, extractAgentImages } from "./agentArtifacts";

describe("agent artifacts", () => {
  it("extracts OpenCode file parts and provider image payloads", () => {
    const images = extractAgentImages(
      JSON.stringify([{ type: "file", uri: "file:///workspace/read.png", mime: "image/png", name: "read.png" }]),
      { type: "output_image", b64_json: "YWJj", mimeType: "image/webp", name: "generated.webp" },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "ZGVm" } },
      { type: "image_url", image_url: { url: "https://images.example.test/generated" } },
    );

    expect(images).toEqual([
      { source: "file:///workspace/read.png", mime: "image/png", name: "read.png" },
      { source: "data:image/webp;base64,YWJj", mime: "image/webp", name: "generated.webp" },
      { source: "data:image/jpeg;base64,ZGVm", mime: "image/jpeg", name: undefined },
      { source: "https://images.example.test/generated", mime: "image/png", name: undefined },
    ]);
  });

  it("builds a line-numbered before and after diff", () => {
    const [diff] = extractAgentDiffs("edit", JSON.stringify({
      path: "src/app.ts",
      oldString: "const value = 1;\nrun(value);",
      newString: "const value = 2;\nrun(value);",
    }));

    expect(diff.title).toBe("src/app.ts");
    expect(diff.additions).toBe(1);
    expect(diff.deletions).toBe(1);
    expect(diff.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "remove", text: "const value = 1;", oldLine: 1 }),
      expect.objectContaining({ kind: "add", text: "const value = 2;", newLine: 1 }),
      expect.objectContaining({ kind: "context", text: "run(value);", oldLine: 2, newLine: 2 }),
    ]));
  });

  it("renders unified diffs returned by shell and patch tools", () => {
    const [diff] = extractAgentDiffs("shell", JSON.stringify({ command: "git diff" }), [
      "diff --git a/a.ts b/a.ts",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,2 +1,2 @@",
      "-const oldValue = true;",
      "+const newValue = true;",
      " keep();",
    ].join("\n"));

    expect(diff.title).toBe("a.ts");
    expect(diff.additions).toBe(1);
    expect(diff.deletions).toBe(1);
    expect(diff.lines.find((line) => line.kind === "add")).toMatchObject({ text: "const newValue = true;", newLine: 1 });
  });

  it("finds every file changed by a patch tool", () => {
    const paths = extractAgentFilePaths("apply_patch", JSON.stringify({ patch: [
      "*** Begin Patch",
      "*** Update File: src/one.ts",
      "@@",
      "-old",
      "+new",
      "*** Add File: src/two.ts",
      "+created",
      "*** End Patch",
    ].join("\n") }));

    expect(paths).toEqual(["src/one.ts", "src/two.ts"]);
  });
});
