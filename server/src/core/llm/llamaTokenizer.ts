// Simple tokenizer implementation using js-tiktoken as fallback
// Replaces the original llamaTokenizer which required a native WASM module

import { Tiktoken } from "js-tiktoken";

// Use a basic cl100k_base encoding (GPT-4 class) as universal fallback
let _encoding: Tiktoken | null = null;

function getEncoding(): Tiktoken {
  if (!_encoding) {
    try {
      // cl100k_base is the most common encoding
      const { encodingForModel } = require("js-tiktoken");
      _encoding = encodingForModel("gpt-4");
    } catch {
      // Fallback: rough character-based estimation
      _encoding = null;
    }
  }
  return _encoding!;
}

class SimpleTokenizer {
  encode(text: string): number[] {
    const enc = getEncoding();
    if (enc) {
      return enc.encode(text);
    }
    // Fallback: fake token IDs (1 char ≈ 0.25 token for code)
    return Array.from({ length: Math.ceil(text.length / 4) }, (_, i) => i);
  }

  decode(tokens: number[]): string {
    const enc = getEncoding();
    if (enc) {
      try {
        return enc.decode(tokens);
      } catch {
        return tokens.map(String).join("");
      }
    }
    return "";
  }
}

const llamaTokenizer = new SimpleTokenizer();
export default llamaTokenizer;
export { SimpleTokenizer as LlamaTokenizer };
