/**
 * Post-processing for completions after the streaming filter pipeline.
 * Extracted from completion.ts to separate concerns.
 *
 * This runs after the streaming pipeline has already filtered obvious issues
 * (stop tokens, repeating lines, suffix duplication, etc.).
 * It handles: empty output, duplicate-line-above, markdown fences,
 * prefix/suffix overlap, leading newline/indent.
 */

/**
 * Match code that is likely to start a standalone statement.
 */
const STATEMENT_KEYWORD_RE =
  /^(?:if|else|for|while|do|switch|try|catch|finally|class|function|const|let|var|return|throw|export|import|default|break|continue|case|async|await|new|typeof|instanceof|void|delete)\b/;

const EXPRESSION_STATEMENT_RE =
  /^(?:this|super|[A-Za-z_$][\w$]*)(?:\s*(?:\.|\?\.)\s*[A-Za-z_$][\w$]*|\s*\[[^\]\n]+\])*\s*(?:\(|=|\+=|-=|\*=|\/=|%=|\+\+|--)/;

function startsLikeStatement(text: string): boolean {
  const trimmed = text.trimStart();
  return (
    STATEMENT_KEYWORD_RE.test(trimmed) ||
    EXPRESSION_STATEMENT_RE.test(trimmed)
  );
}

/**
 * Split accidentally glued statements such as
 * `console.log(a);console.log(b);` while avoiding semicolons inside
 * parenthesized expressions like for-loop headers.
 */
function normalizeStatementNewlines(completion: string): string {
  let result = "";
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  const skipHorizontalWhitespace = (start: number): number => {
    let i = start;
    while (completion[i] === " " || completion[i] === "\t") i++;
    return i;
  };

  const currentIndent = (): string => {
    const lineStart = result.lastIndexOf("\n") + 1;
    return result.slice(lineStart).match(/^[ \t]*/)?.[0] ?? "";
  };

  for (let i = 0; i < completion.length; i++) {
    const char = completion[i];
    const next = completion[i + 1];

    if (inLineComment) {
      result += char;
      if (char === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      result += char;
      if (char === "*" && next === "/") {
        result += next;
        i++;
        inBlockComment = false;
      }
      continue;
    }

    if (quote) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "/" && next === "/") {
      result += char + next;
      i++;
      inLineComment = true;
      continue;
    }

    if (char === "/" && next === "*") {
      result += char + next;
      i++;
      inBlockComment = true;
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      result += char;
      continue;
    }

    if (char === "(") parenDepth++;
    else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (char === "[") bracketDepth++;
    else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);

    if (char === ";" && parenDepth === 0 && bracketDepth === 0) {
      const nextTokenIndex = skipHorizontalWhitespace(i + 1);
      if (
        completion[nextTokenIndex] !== "\n" &&
        startsLikeStatement(completion.slice(nextTokenIndex))
      ) {
        result += ";\n" + currentIndent();
        i = nextTokenIndex - 1;
        continue;
      }
    }

    result += char;
  }

  return result;
}

/**
 * Check if the completion duplicates the line above the cursor.
 * If the first non-empty completion line matches the last non-empty prefix line, drop it.
 */
function rewritesLineAbove(completion: string, prefix: string): boolean {
  const lineAbove = prefix
    .split("\n")
    .filter((line) => line.trim())
    .slice(-1)[0];
  const firstCompletionLine = completion
    .split("\n")
    .find((line) => line.trim());
  return (
    Boolean(lineAbove) &&
    Boolean(firstCompletionLine) &&
    lineAbove!.trim() === firstCompletionLine!.trim()
  );
}

/**
 * Remove markdown code fence delimiters from completion.
 */
function removeBackticks(completion: string): string {
  return completion
    .replace(/^```[^\n]*\n/, "")
    .replace(/\n```$/, "");
}

/**
 * Remove suffix overlap at the start of completion.
 */
function removeSuffixOverlap(completion: string, suffix: string): string {
  if (
    suffix &&
    completion.startsWith(suffix.slice(0, Math.min(20, suffix.length)))
  ) {
    return completion.slice(Math.min(20, suffix.length));
  }
  return completion;
}

/**
 * Determine if a leading newline with proper indentation is needed.
 * This happens when cursor is at end of a statement-terminated line
 * and the completion starts a new statement keyword.
 */
function needsLeadingNewline(
  prefix: string,
  suffix: string,
  completion: string,
): boolean {
  if (completion.startsWith("\n")) return false;
  if (prefix.endsWith("\n")) return false;

  const lastLine = prefix.split("\n").pop() ?? "";
  if (lastLine.trim().length === 0) return false;

  // suffix must start with \n or be empty/whitespace — cursor at line end
  if (suffix.length > 0 && !/^\s*\n/.test(suffix) && suffix.trim().length > 0)
    return false;

  // last line must end with a statement terminator
  if (!/[;{}\])>]$/.test(lastLine.trimEnd())) return false;

  // completion must start with a standalone statement
  if (!startsLikeStatement(completion)) return false;

  // avoid breaking same-line continuation patterns like `foo();return x`
  if (/;\s*(const|let|var|return)\b/.test(lastLine)) return false;

  return true;
}

/**
 * Infer the indentation step from surrounding code lines.
 */
function inferIndentStep(lines: string[]): string | null {
  const indents: number[] = [];
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    if (/^\t/.test(line)) return "\t";
    const spaces = line.match(/^( +)/)?.[1]?.length ?? 0;
    indents.push(spaces);
  }
  if (indents.length < 2) return null;
  const sorted = [...indents].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i] - sorted[i - 1];
    if (diff > 0) return " ".repeat(diff);
  }
  return null;
}

/**
 * Infer indentation to apply before the completion.
 */
function inferIndentation(prefix: string, completion: string): string {
  const firstNonEmpty = completion
    .split("\n")
    .find((l) => l.trim().length > 0);
  if (firstNonEmpty && /^[ \t]/.test(firstNonEmpty)) return "";

  const lines = prefix.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().length > 0) {
      const indent = lines[i].match(/^(\s*)/)?.[1] ?? "";
      if (lines[i].trimEnd().endsWith("{")) {
        const step = inferIndentStep(lines);
        return step ? indent + step : indent;
      }
      return indent;
    }
  }
  return "";
}

/**
 * Main post-processing entry point.
 * Returns undefined if the completion should be dropped entirely.
 */
export function postprocessCompletion(
  completion: string,
  prefix: string,
  suffix: string,
): string | undefined {
  let result = completion;

  // Empty check
  if (!result || result.trim().length === 0) return undefined;

  // Duplicate line above
  if (rewritesLineAbove(result, prefix)) return undefined;

  // Leading space overlap
  if (prefix.endsWith(" ") && result.startsWith(" ")) {
    result = result.slice(1);
  }

  // Suffix overlap
  result = removeSuffixOverlap(result, suffix);

  // Markdown fences
  result = removeBackticks(result);

  // Split glued statement completions before deciding whether a leading
  // newline is needed.
  result = normalizeStatementNewlines(result);

  // Leading newline for new statements
  if (needsLeadingNewline(prefix, suffix, result)) {
    const indent = inferIndentation(prefix, result);
    result = "\n" + indent + result;
  }

  return result.trim().length === 0 ? undefined : result;
}

/**
 * Exported for use in completion.ts render step.
 */
export { needsLeadingNewline, inferIndentation };
