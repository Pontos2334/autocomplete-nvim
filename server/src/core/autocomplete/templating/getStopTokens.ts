import { CompletionOptions } from "../..";
import { AutocompleteLanguageInfo } from "../constants/AutocompleteLanguageInfo";

// Starcoder2 tends to output artifacts starting with the letter "t"
const STARCODER2_T_ARTIFACTS = ["t.", "\nt", "<file_sep>"];
const CODE_BLOCK_END = "```";

export function getStopTokens(
  completionOptions: Partial<CompletionOptions> | undefined,
  lang: AutocompleteLanguageInfo,
  model: string,
): string[] {
  const stopTokens = [
    ...(completionOptions?.stop || []),
    ...(model.toLowerCase().includes("starcoder2")
      ? STARCODER2_T_ARTIFACTS
      : []),
    CODE_BLOCK_END,
  ];

  return stopTokens;
}
