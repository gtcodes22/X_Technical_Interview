// One wrapper around the LLM provider (OpenAI Chat Completions, called with fetch — no SDK).
// Handles the third-party failure modes in one place: timeout, one retry, and a clear error
// the orchestrator turns into a safe fallback reply. Tests use `mockLlm` instead.

export interface LlmClient {
  /** Returns the model's text reply. Throws LlmError on failure (after one retry). */
  complete(system: string, user: string, options?: { json?: boolean }): Promise<string>;
}

export class LlmError extends Error {}

const TIMEOUT_MS = 20_000;

export function openAiClient(apiKey: string, model: string): LlmClient {
  async function callOnce(system: string, user: string, json: boolean): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!response.ok) {
      throw new LlmError(`LLM HTTP ${response.status}`);
    }
    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content;
    if (!text) throw new LlmError("LLM returned an empty reply");
    return text;
  }

  return {
    async complete(system, user, options) {
      try {
        return await callOnce(system, user, options?.json ?? false);
      } catch (firstError) {
        // One retry covers brief network blips and 5xx responses; anything longer falls back.
        try {
          return await callOnce(system, user, options?.json ?? false);
        } catch (secondError) {
          throw new LlmError(`LLM failed twice: ${String(firstError)} / ${String(secondError)}`);
        }
      }
    },
  };
}

/** Deterministic stand-in for tests: `respond` decides the reply from the prompts. */
export function mockLlm(respond: (system: string, user: string) => string): LlmClient {
  return { complete: async (system, user) => respond(system, user) };
}
