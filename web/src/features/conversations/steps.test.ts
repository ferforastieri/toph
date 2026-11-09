import { describe, expect, it } from "vitest";
import type { NativeMessage } from "../agents/api";
import { maskSecrets, toolStep } from "./steps";

const message = (patch: Partial<NativeMessage>): NativeMessage => ({
  id: "tool",
  chatId: "chat",
  role: "tool",
  content: "{}",
  status: "complete",
  createdAt: 1,
  ...patch,
});

describe("toolStep", () => {
  it("shows the exact shell command, output and error", () => {
    const step = toolStep(message({
      title: "shell",
      detail: JSON.stringify({ input: { command: "printf 'ok'" }, output: { exitCode: 0, stdout: "ok\n", stderr: "" } }),
    }));
    expect(step.label).toBe("Rodou");
    expect(step.detail).toBe("printf 'ok'");
    expect(step.input).toBe("printf 'ok'");
    expect(step.output).toBe("ok");

    const failed = toolStep(message({
      status: "error",
      title: "shell",
      detail: JSON.stringify({ input: { command: "exit 7" }, output: { exitCode: 7, stdout: "", stderr: "broken\n" } }),
    }));
    expect(failed.error).toBe("exit code 7: broken");
  });

  it("masks credentials in commands", () => {
    const step = toolStep(message({
      title: "shell",
      detail: JSON.stringify({ input: { command: "curl -H 'Authorization: Bearer abcdefgh12345678' https://x" }, output: { exitCode: 0, stdout: "", stderr: "" } }),
    }));
    expect(step.input).not.toContain("abcdefgh12345678");
    expect(step.input).toContain("••••");
    expect(maskSecrets("--password hunter2")).toContain("••••");
  });

  it("describes reads and searches with their paths and queries", () => {
    const read = toolStep(message({ title: "read_file", content: JSON.stringify({ path: "src/a.ts" }) }));
    expect(read.label).toBe("Leu");
    expect(read.detail).toBe("src/a.ts");

    const search = toolStep(message({ title: "search", content: JSON.stringify({ query: "approval" }) }));
    expect(search.label).toBe("Pesquisou");
    expect(search.detail).toBe("approval");
  });

  it("turns a reasoning message into a thought step", () => {
    const thought = toolStep(message({ role: "reasoning", content: "Vou verificar o contrato." }));
    expect(thought.label).toBe("Pensou");
    expect(thought.note).toBe("Vou verificar o contrato.");
  });
});
