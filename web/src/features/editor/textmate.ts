import type { Monaco } from "@monaco-editor/react";
import type { languages } from "monaco-editor";
import {
  createOnigScanner,
  createOnigString,
  loadWASM,
} from "vscode-oniguruma";
import { INITIAL, Registry, type IRawGrammar, type StateStack } from "vscode-textmate";
import ts from "@shikijs/langs/ts";
import tsx from "@shikijs/langs/tsx";
import js from "@shikijs/langs/js";
import jsx from "@shikijs/langs/jsx";

type GrammarSet = {
  "source.ts": IRawGrammar;
  "source.tsx": IRawGrammar;
  "source.js": IRawGrammar;
  "source.jsx": IRawGrammar;
};

const grammarSources: GrammarSet = {
  "source.ts": ts[0] as IRawGrammar,
  "source.tsx": tsx[0] as IRawGrammar,
  "source.js": js[0] as IRawGrammar,
  "source.jsx": jsx[0] as IRawGrammar,
};

const attached = new WeakSet<object>();
let wasmPromise: Promise<void> | null = null;
let registryPromise: Promise<Registry> | null = null;

function loadOniguruma(): Promise<void> {
  if (!wasmPromise) {
    wasmPromise = fetch(`${import.meta.env.BASE_URL}onig.wasm`)
      .then((response) => response.arrayBuffer())
      .then((buffer) => loadWASM(buffer));
  }
  return wasmPromise;
}

function createRegistry(): Promise<Registry> {
  if (!registryPromise) {
    registryPromise = loadOniguruma().then(
      () =>
        new Registry({
          onigLib: Promise.resolve({ createOnigScanner, createOnigString }),
          loadGrammar: async (scopeName) => grammarSources[scopeName as keyof GrammarSet] ?? null,
        }),
    );
  }
  return registryPromise;
}

function normalizeScope(scope: string | undefined): string {
  return (scope ?? "source").replace(/\.(tsx?|jsx?)$/i, "") || "source";
}

function installTokenProvider(
  monaco: Monaco,
  language: string,
  grammar: Awaited<ReturnType<Registry["loadGrammar"]>>,
): void {
  if (!grammar) return;
  const provider: languages.TokensProvider = {
    getInitialState: () => INITIAL,
    tokenize(line: string, state: languages.IState) {
      const result = grammar.tokenizeLine(line, state as StateStack);
      return {
        tokens: result.tokens.map((token) => ({
          startIndex: token.startIndex,
          scopes: normalizeScope(token.scopes[token.scopes.length - 1]),
        })),
        endState: result.ruleStack,
      };
    },
  };
  try {
    monaco.languages.setTokensProvider(language, provider);
  } catch (error) {
    console.warn(`Could not install TextMate tokenizer for ${language}`, error);
  }
}

export function registerEditorTextMate(monaco: Monaco): void {
  if (attached.has(monaco)) return;
  attached.add(monaco);
  void createRegistry()
    .then(async (registry) => {
      const [typescript, javascript] = await Promise.all([
        registry.loadGrammar("source.ts"),
        registry.loadGrammar("source.js"),
      ]);
      installTokenProvider(monaco, "typescript", typescript);
      installTokenProvider(monaco, "javascript", javascript);
    })
    .catch((error) => {
      console.warn("Could not initialize TextMate tokenization", error);
    });
}
