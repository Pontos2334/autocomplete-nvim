// Re-export types from index.d.ts
// This module serves as the main entry point for core types

export type {
  IDE,
  ILLM,
  Range,
  Position,
  RangeInFile,
  RangeInFileWithContents,
  TabAutocompleteOptions,
  CompletionOptions,
  ChatMessage,
  ContextItem,
  ContextItemWithId,
  Tool,
  MessageOption,
  ModelCapability,
  PromptTemplate,
  TemplateType,
  CacheBehavior,
  LLMOptions,
  LLMFullCompletionOptions,
  ILLMLogger,
  ILLMInteractionLog,
  ModelInstaller,
  ToolOverride,
  Usage,
  PromptLog,
  RequestOptions,
} from "./index.d";

// Re-export from submodules that are used
export { BaseLLM, LLMError } from "./llm/index.js";
