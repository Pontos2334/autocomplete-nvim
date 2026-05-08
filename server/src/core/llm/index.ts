// Simplified LLM module for autocomplete-only extension
// Only includes BaseLLM base class and essential types

import {
  ChatMessage,
  Chunk,
  CompletionOptions,
  ILLM,
  LLMOptions,
  ModelCapability,
  PromptTemplate,
  TemplateType,
  TabAutocompleteOptions,
  ToolOverride,
  CacheBehavior,
  Tool,
  RequestOptions,
} from "../index.d";

export { ILLM } from "../index.d";

export class LLMError extends Error {
  constructor(
    message: string,
    public llm: ILLM,
  ) {
    super(message);
  }
}

export const DEFAULT_ARGS = {
  contextLength: 128000,
  maxTokens: 4096,
  temperature: 0.5,
  topP: 1,
  topK: 40,
  presencePenalty: 0,
  frequencyPenalty: 0,
};

export const DEFAULT_CONTEXT_LENGTH = 128000;
export const DEFAULT_MAX_TOKENS = 4096;
export const DEFAULT_MAX_CHUNK_SIZE = 500;
export const DEFAULT_MAX_BATCH_SIZE = 1;

export const LLMConfigurationStatuses = {
  OK: "ok",
  NO_AUTOCOMPLETE_MODEL: "no_autocomplete_model",
};

export function isModelInstaller(provider: any): provider is { installModel: Function; isInstallingModel: Function } {
  return (
    provider &&
    typeof provider.installModel === "function" &&
    typeof provider.isInstallingModel === "function"
  );
}

export abstract class BaseLLM implements ILLM {
  static providerName: string;
  static defaultOptions: Partial<LLMOptions> | undefined = undefined;

  get providerName(): string {
    return (this.constructor as typeof BaseLLM).providerName;
  }

  get underlyingProviderName(): string {
    return this.providerName;
  }

  autocompleteOptions?: Partial<TabAutocompleteOptions>;
  title: string;
  model: string;
  apiKey?: string;
  apiBase?: string;
  contextLength: number;
  maxTokens: number;
  temperature: number;
  topP: number;
  topK: number;
  presencePenalty: number;
  frequencyPenalty: number;
  capabilities?: ModelCapability;
  template?: TemplateType;
  promptTemplates?: Record<string, string>;
  completionOptions?: CompletionOptions;
  requestOptions?: RequestOptions;
  systemMessage?: string;
  tools?: Tool[];
  toolOverrides?: ToolOverride[];

  supportsFim(): boolean {
    return false;
  }

  supportsImages(): boolean {
    return false;
  }

  supportsCompletions(): boolean {
    return true;
  }

  maxStopWordReturn = 2;

  constructor(options: LLMOptions & { title?: string; provider?: string }) {
    this.title = options.title ?? options.model ?? "";
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.apiBase = options.apiBase;
    this.contextLength = options.contextLength ?? DEFAULT_CONTEXT_LENGTH;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.temperature = options.temperature ?? DEFAULT_ARGS.temperature;
    this.topP = options.topP ?? DEFAULT_ARGS.topP;
    this.topK = options.topK ?? DEFAULT_ARGS.topK;
    this.presencePenalty = options.presencePenalty ?? DEFAULT_ARGS.presencePenalty;
    this.frequencyPenalty = options.frequencyPenalty ?? DEFAULT_ARGS.frequencyPenalty;
    this.capabilities = options.capabilities;
    this.template = options.template;
    this.promptTemplates = options.promptTemplates;
    this.completionOptions = options.completionOptions ?? {};
    this.requestOptions = options.requestOptions;
    this.systemMessage = options.systemMessage;
    this.tools = options.tools;
    this.autocompleteOptions = options.autocompleteOptions;
  }

  abstract streamChat(
    messages: ChatMessage[],
    signal: AbortSignal,
    options?: CompletionOptions,
  ): AsyncGenerator<ChatMessage>;

  abstract streamFim(
    prefix: string,
    suffix: string,
    signal: AbortSignal,
    options?: CompletionOptions,
  ): AsyncGenerator<string>;

  async *streamComplete(
    prompt: string,
    signal: AbortSignal,
    options?: CompletionOptions,
  ): AsyncGenerator<string> {
    const messages = [{ role: "user" as const, content: prompt }];
    for await (const msg of this.streamChat(messages, signal, options)) {
      if (msg.content) {
        yield msg.content;
      }
    }
  }

  async complete(
    prompt: string,
    signal: AbortSignal,
    options?: CompletionOptions,
  ): Promise<string> {
    let result = "";
    for await (const chunk of this.streamComplete(prompt, signal, options)) {
      result += chunk;
    }
    return result;
  }

  async chat(
    messages: ChatMessage[],
    signal: AbortSignal,
    options?: CompletionOptions,
  ): Promise<ChatMessage> {
    let content = "";
    for await (const msg of this.streamChat(messages, signal, options)) {
      if (msg.content) {
        content += msg.content;
      }
    }
    return { role: "assistant", content };
  }

  async embed(chunks: string[]): Promise<number[][]> {
    throw new Error("Embedding not supported");
  }

  async rerank(query: string, chunks: Chunk[]): Promise<number[]> {
    throw new Error("Reranking not supported");
  }

  async listModels(): Promise<string[]> {
    return [];
  }

  protected fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    return fetch(input, init);
  };
}

export function autodetectPromptTemplates(providerName: string, model: string): Record<string, string> | undefined {
  return undefined;
}

export function autodetectTemplateType(providerName: string, model: string): TemplateType | undefined {
  return undefined;
}

export function autodetectTemplateFunction(providerName: string, model: string): Function | undefined {
  return undefined;
}

export function modelSupportsImages(providerName: string, model: string): boolean {
  return false;
}
