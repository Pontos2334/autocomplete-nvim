// Standalone SSE stream parser (replaces @continuedev/fetch streamSse)
export async function* streamSse(response: Response): AsyncGenerator<any> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    let currentData = "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        currentData = line.slice(6);
      } else if (line === "" && currentData) {
        if (currentData === "[DONE]") return;
        try {
          yield JSON.parse(currentData);
        } catch {
          // Skip malformed JSON
        }
        currentData = "";
      }
    }
  }
}

export async function fetchwithRequestOptions(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: any,
): Promise<Response> {
  return fetch(input, init);
}

export function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

export async function* streamResponse(response: Response): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield decoder.decode(value, { stream: true });
  }
}

export async function* streamJSON(response: Response): AsyncGenerator<any> {
  for await (const chunk of streamResponse(response)) {
    try {
      yield JSON.parse(chunk);
    } catch {
      // Skip
    }
  }
}

export async function* toAsyncIterable(response: Response): AsyncGenerator<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield value;
  }
}
