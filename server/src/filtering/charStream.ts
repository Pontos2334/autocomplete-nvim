/**
 * Character-level stream transforms for filtering completion output.
 * Ported from autocomplete-vscode streamTransforms/charStream.ts.
 */

/**
 * Stop yielding when a stop token appears at the start of the buffer.
 * Handles stop tokens that span across chunk boundaries.
 */
export async function* stopAtStopTokens(
  stream: AsyncGenerator<string>,
  stopTokens: string[],
): AsyncGenerator<string> {
  if (stopTokens.length === 0) {
    for await (const chunk of stream) {
      yield chunk;
    }
    return;
  }

  const maxStopTokenLength = Math.max(
    ...stopTokens.map((token) => token.length),
  );
  let buffer = "";

  for await (const chunk of stream) {
    buffer += chunk;

    while (buffer.length >= maxStopTokenLength) {
      let found = false;
      for (const stopToken of stopTokens) {
        if (buffer.startsWith(stopToken)) {
          found = true;
          return;
        }
      }

      if (!found) {
        yield buffer[0];
        buffer = buffer.slice(1);
      }
    }
  }

  // Filter out possible stop tokens from remaining buffer
  for (const token of stopTokens) {
    buffer = buffer.replace(token, "");
  }

  for (const char of buffer) {
    yield char;
  }
}

/**
 * Stop yielding when the stream starts matching the suffix.
 * Compares against the first `sequenceLength` characters of the trimmed suffix.
 */
export async function* stopAtStartOfSuffix(
  stream: AsyncGenerator<string>,
  suffix: string,
  sequenceLength: number = 20,
): AsyncGenerator<string> {
  const fullSuffixTrimmed = suffix.trimStart();
  if (fullSuffixTrimmed.length === 0) {
    for await (const chunk of stream) {
      yield chunk;
    }
    return;
  }

  const checkLength = Math.min(sequenceLength, fullSuffixTrimmed.length);
  let buffer = "";

  for await (const chunk of stream) {
    buffer += chunk;

    while (buffer.length >= checkLength) {
      const candidate = buffer.slice(0, checkLength);
      if (fullSuffixTrimmed.startsWith(candidate)) {
        return;
      }
      yield buffer[0];
      buffer = buffer.slice(1);
    }
  }

  if (buffer.length > 0 && !fullSuffixTrimmed.startsWith(buffer)) {
    yield buffer;
  }
}
