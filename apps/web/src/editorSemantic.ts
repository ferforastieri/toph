import type { Monaco } from "@monaco-editor/react";
import type { languages } from "monaco-editor";

const TOKEN_TYPES = [
  "variable",
  "type.identifier",
  "keyword.control",
  "keyword.control.conditional",
  "keyword.control.loop",
  "keyword.other.new",
  "constant.language",
  "keyword.operator",
  "function",
  "parameter",
  "property",
] as const;

const tokenType = {
  variable: 0,
  type: 1,
  keyword: 2,
  conditional: 3,
  loop: 4,
  newKeyword: 5,
  constant: 6,
  operator: 7,
  function: 8,
  parameter: 9,
  property: 10,
} as const;

const keywordTypes: Record<string, number> = {
  private: tokenType.keyword,
  public: tokenType.keyword,
  protected: tokenType.keyword,
  readonly: tokenType.keyword,
  static: tokenType.keyword,
  abstract: tokenType.keyword,
  declare: tokenType.keyword,
  override: tokenType.keyword,
  async: tokenType.keyword,
  await: tokenType.keyword,
  export: tokenType.keyword,
  return: tokenType.keyword,
  throw: tokenType.keyword,
  break: tokenType.keyword,
  continue: tokenType.keyword,
  yield: tokenType.keyword,
  try: tokenType.keyword,
  catch: tokenType.keyword,
  finally: tokenType.keyword,
  as: tokenType.keyword,
  default: tokenType.keyword,
  if: tokenType.conditional,
  else: tokenType.conditional,
  switch: tokenType.conditional,
  case: tokenType.conditional,
  for: tokenType.loop,
  while: tokenType.loop,
  do: tokenType.loop,
  this: tokenType.constant,
  true: tokenType.constant,
  false: tokenType.constant,
  null: tokenType.constant,
  undefined: tokenType.constant,
  new: tokenType.newKeyword,
  typeof: tokenType.operator,
  instanceof: tokenType.operator,
  in: tokenType.operator,
  delete: tokenType.operator,
};

interface SemanticToken {
  start: number;
  length: number;
  type: number;
}

const registered = new WeakSet<object>();

const parameterStopWords = new Set([
  "any",
  "boolean",
  "false",
  "never",
  "null",
  "number",
  "object",
  "string",
  "symbol",
  "this",
  "true",
  "undefined",
  "unknown",
  "void",
]);

function markParameters(
  text: string,
  openIndex: number,
  add: (start: number, length: number, type: number) => void,
): void {
  let depth = 0;
  let closeIndex = -1;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        closeIndex = index;
        break;
      }
    }
  }
  if (closeIndex < 0) return;
  const regionStart = openIndex + 1;
  const region = text.slice(regionStart, closeIndex);
  for (const match of region.matchAll(/[A-Za-z_$][\w$]*/g)) {
    const word = match[0];
    if (parameterStopWords.has(word) || keywordTypes[word] !== undefined) continue;
    if (/^[A-Z]/.test(word)) continue;
    add(regionStart + (match.index ?? 0), word.length, tokenType.parameter);
  }
}

function collectTokens(text: string): SemanticToken[] {
  const tokens = new Map<number, SemanticToken>();
  const add = (start: number, length: number, type: number) => {
    if (length > 0) tokens.set(start, { start, length, type });
  };

  // TypeScript/JavaScript import declarations. Monaco's built-in tokenizer
  // treats imported values as types because they start with uppercase letters;
  // this restores the semantic distinction used by editor themes.
  const imports = /^[\t ]*import\b[\s\S]*?from\s+['"][^'"]+['"];?/gm;
  for (const match of text.matchAll(imports)) {
    const source = match[0];
    const base = match.index ?? 0;
    const importAt = source.search(/\bimport\b/);
    if (importAt < 0) continue;
    add(base + importAt, "import".length, tokenType.keyword);

    const typeMatch = /^[\t ]*import\s+(type)\b/.exec(source);
    const typeMode = Boolean(typeMatch);
    let headStart = importAt + "import".length;
    if (typeMatch) {
      const at = source.indexOf("type", importAt);
      add(base + at, "type".length, tokenType.keyword);
      headStart = at + "type".length;
    }

    const fromAt = source.search(/\bfrom\b/);
    if (fromAt >= 0) add(base + fromAt, "from".length, tokenType.keyword);
    const headEnd = fromAt >= 0 ? fromAt : source.length;
    const head = source.slice(0, headEnd);
    const braceStart = head.indexOf("{");

    const markIdentifier = (offset: number, word: string) => {
      if (word === "as") {
        add(offset, word.length, tokenType.keyword);
        return;
      }
      if (word === "type" || word === "default") return;
      add(offset, word.length, typeMode ? tokenType.type : tokenType.variable);
    };

    if (braceStart >= 0) {
      // Default import before the named-import block.
      const prefix = head.slice(headStart, braceStart);
      for (const identifier of prefix.matchAll(/[A-Za-z_$][\w$]*/g)) {
        markIdentifier(
          base + headStart + (identifier.index ?? 0),
          identifier[0],
        );
      }
      const braceEnd = source.indexOf("}", braceStart);
      const regionStart = base + braceStart + 1;
      const regionEnd = base + (braceEnd >= 0 ? braceEnd : headEnd);
      const region = text.slice(regionStart, regionEnd);
      for (const identifier of region.matchAll(/[A-Za-z_$][\w$]*/g)) {
        markIdentifier(
          regionStart + (identifier.index ?? 0),
          identifier[0],
        );
      }
    } else {
      const regionStart = base + headStart;
      const region = text.slice(regionStart, base + headEnd);
      for (const identifier of region.matchAll(/[A-Za-z_$][\w$]*/g)) {
        markIdentifier(regionStart + (identifier.index ?? 0), identifier[0]);
      }
    }
  }

  for (const match of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    const name = match[1];
    const start = (match.index ?? 0) + match[0].lastIndexOf(name);
    add(start, name.length, tokenType.variable);
  }

  for (const match of text.matchAll(/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = match[1];
    const start = (match.index ?? 0) + match[0].lastIndexOf("(") - name.length - 1;
    add(start, name.length, tokenType.function);
    markParameters(text, (match.index ?? 0) + match[0].lastIndexOf("("), add);
  }

  for (const match of text.matchAll(
    /^\s*(?:(?:public|private|protected|static|readonly|async|get|set)\s+)+([A-Za-z_$][\w$]*)\s*\(/gm,
  )) {
    const name = match[1];
    const open = (match.index ?? 0) + match[0].lastIndexOf("(");
    const nameAt = (match.index ?? 0) + match[0].indexOf(name);
    add(nameAt, name.length, tokenType.function);
    markParameters(text, open, add);
  }

  for (const match of text.matchAll(/\.\s*([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = match[1];
    const start = (match.index ?? 0) + match[0].lastIndexOf(name);
    add(start, name.length, tokenType.function);
  }

  for (const match of text.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) {
    const name = match[1];
    if (keywordTypes[name] === undefined && !/^[A-Z]/.test(name)) {
      add((match.index ?? 0) + match[0].indexOf(name), name.length, tokenType.parameter);
    }
  }

  // VS Code gives modifiers, control-flow words, literals and operators
  // different colors from regular keywords. Monaco's built-in TypeScript
  // tokenizer exposes them all as "keyword", so restore those distinctions.
  for (const match of text.matchAll(/\b[A-Za-z_$][\w$]*\b/g)) {
    const word = match[0];
    const type = keywordTypes[word];
    if (type !== undefined) add(match.index ?? 0, word.length, type);
  }

  return [...tokens.values()].sort((left, right) => left.start - right.start);
}

function encodeTokens(
  model: import("monaco-editor").editor.ITextModel,
  tokens: SemanticToken[],
): Uint32Array {
  const data: number[] = [];
  let previousLine = 0;
  let previousColumn = 0;
  for (const token of tokens) {
    const position = model.getPositionAt(token.start);
    const line = position.lineNumber - 1;
    const column = position.column - 1;
    data.push(
      line - previousLine,
      line === previousLine ? column - previousColumn : column,
      token.length,
      token.type,
      0,
    );
    previousLine = line;
    previousColumn = column;
  }
  return new Uint32Array(data);
}

export function registerEditorSemanticTokens(monaco: Monaco): void {
  if (registered.has(monaco)) return;
  registered.add(monaco);

  const provider: languages.DocumentSemanticTokensProvider = {
    getLegend() {
      return { tokenTypes: [...TOKEN_TYPES], tokenModifiers: [] };
    },
    provideDocumentSemanticTokens(model) {
      return { data: encodeTokens(model, collectTokens(model.getValue())) };
    },
    releaseDocumentSemanticTokens() {
      // Tokens are computed from the current model on every request.
    },
  };

  for (const language of ["typescript", "javascript"]) {
    monaco.languages.registerDocumentSemanticTokensProvider({ language }, provider);
  }
}
