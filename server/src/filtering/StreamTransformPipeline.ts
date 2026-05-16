/**
 * Streaming filter pipeline for completion output.
 * Chains character-level and line-level async generators to filter
 * low-quality output early, aborting the LLM request when possible.
 */

import {
  stopAtStopTokens,
  stopAtStartOfSuffix,
} from "./charStream.js";
import {
  streamLines,
  stopAtRepeatingLines,
  skipPrefixes,
  noDoubleNewLine,
  stopAtSimilarLine,
  streamWithNewLines,
} from "./lineStream.js";

export interface PipelineContext {
  prefix: string;
  suffix: string;
  stopTokens: string[];
  lineBelowCursor: string;
  /** Called when pipeline decides to abort upstream */
  fullStop: () => void;
}

/**
 * Run the streaming filter pipeline.
 *
 * Takes a raw SSE chunk generator and returns a filtered generator.
 * The pipeline:
 *   1. Character-level: stop tokens, suffix matching
 *   2. Line-level: repeating lines, prefixes, double newlines, similar line detection
 *   3. Rejoin lines with newlines
 *
 * The returned generator yields filtered character chunks.
 * Call `fullStop()` or abort the upstream request when done.
 */
export async function* runFilterPipeline(
  rawStream: AsyncGenerator<string>,
  ctx: PipelineContext,
): AsyncGenerator<string> {
  // Character-level filters
  let charStream: AsyncGenerator<string> = rawStream;
  charStream = stopAtStopTokens(charStream, [
    ...ctx.stopTokens,
    "diff --git",
  ]);
  charStream = stopAtStartOfSuffix(charStream, ctx.suffix);

  // Convert to line stream
  let lineStream: AsyncGenerator<string> = streamLines(charStream);

  // Line-level filters
  lineStream = stopAtRepeatingLines(lineStream, ctx.fullStop);
  lineStream = skipPrefixes(lineStream);
  lineStream = noDoubleNewLine(lineStream);
  lineStream = stopAtSimilarLine(
    lineStream,
    ctx.lineBelowCursor,
    ctx.fullStop,
  );

  // Rejoin to character stream
  const finalStream = streamWithNewLines(lineStream);
  for await (const chunk of finalStream) {
    yield chunk;
  }
}
