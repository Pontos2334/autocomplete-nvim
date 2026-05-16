/**
 * Line-level stream transforms for filtering completion output.
 * Ported from autocomplete-vscode streamTransforms/lineStream.ts.
 */

export type LineStream = AsyncGenerator<string>;

const PREFIXES_TO_SKIP = ["<COMPLETION>"];
const MAX_REPEATS = 3;

/**
 * Convert a character-level AsyncGenerator into a line-level AsyncGenerator.
 * Splits on newlines, yielding complete lines one at a time.
 */
export async function* streamLines(
  stream: AsyncGenerator<string>,
): LineStream {
  let buffer = "";
  for await (const chunk of stream) {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      yield line;
    }
  }
  if (buffer.length > 0) {
    yield buffer;
  }
}

/**
 * Stop when a line is repeated MAX_REPEATS (3) consecutive times.
 * Only the first occurrence of the repeating line is yielded.
 */
export async function* stopAtRepeatingLines(
  lines: LineStream,
  fullStop: () => void,
): LineStream {
  let previousLine: string | undefined;
  let repeatCount = 0;

  for await (const line of lines) {
    if (line === previousLine) {
      repeatCount++;
      if (repeatCount === MAX_REPEATS) {
        fullStop();
        return;
      }
    } else {
      yield line;
      repeatCount = 1;
    }
    previousLine = line;
  }
}

/**
 * Skip specified prefixes on the first line (e.g. "<COMPLETION>").
 */
export async function* skipPrefixes(lines: LineStream): LineStream {
  let isFirstLine = true;
  for await (const line of lines) {
    if (isFirstLine) {
      const match = PREFIXES_TO_SKIP.find((prefix) =>
        line.startsWith(prefix),
      );
      if (match) {
        yield line.slice(match.length);
        continue;
      }
      isFirstLine = false;
    }
    yield line;
  }
}

/**
 * Stop yielding after the first blank line following non-blank content.
 */
export async function* noDoubleNewLine(lines: LineStream): LineStream {
  let hasContent = false;

  for await (const line of lines) {
    if (hasContent && line.trim() === "") {
      return;
    }
    if (line.trim() !== "") {
      hasContent = true;
    }
    yield line;
  }
}

/**
 * Rejoin line stream back into a character stream with newlines.
 */
export async function* streamWithNewLines(
  stream: LineStream,
): AsyncGenerator<string> {
  let firstLine = true;
  for await (const line of stream) {
    if (!firstLine) {
      yield "\n";
    }
    firstLine = false;
    yield line;
  }
}

/**
 * Determine if two lines are very similar (Levenshtein distance < 10% of length).
 * Lines shorter than 5 characters are never considered repeated.
 */
function lineIsRepeated(a: string, b: string): boolean {
  if (a.length <= 4 || b.length <= 4) return false;
  const aTrim = a.trim();
  const bTrim = b.trim();
  if (aTrim === bTrim) return true;
  // Simple distance approximation without external dependency:
  // If 90%+ characters match at same positions, consider repeated.
  if (aTrim.length === 0 || bTrim.length === 0) return false;
  const maxLen = Math.max(aTrim.length, bTrim.length);
  let matches = 0;
  const minLen = Math.min(aTrim.length, bTrim.length);
  for (let i = 0; i < minLen; i++) {
    if (aTrim[i] === bTrim[i]) matches++;
  }
  return matches / maxLen >= 0.9;
}

/**
 * Stop when a line similar to the provided reference line is encountered.
 * Used to prevent completions from echoing the line below cursor.
 */
export async function* stopAtSimilarLine(
  stream: LineStream,
  line: string,
  fullStop: () => void,
): AsyncGenerator<string> {
  const trimmedLine = line.trim();

  for await (const nextLine of stream) {
    if (trimmedLine === "") {
      yield nextLine;
      continue;
    }

    if (nextLine === line) {
      fullStop();
      break;
    }

    if (lineIsRepeated(nextLine, trimmedLine)) {
      fullStop();
      break;
    }

    yield nextLine;
  }
}
