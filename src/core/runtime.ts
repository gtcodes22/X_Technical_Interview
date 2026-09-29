// Wires the real dependencies for Netlify Functions. Loaded once per function instance
// (module scope), so the contract and search index aren't rebuilt on every request.

import { loadConfig } from "./config";
import { loadContract } from "./contract";
import { blobsConversationStore } from "./conversation-store";
import { mockLlm, openAiClient, type LlmClient } from "./llm";
import { createOrchestrator } from "./orchestrator";

const contract = loadContract();
const config = loadConfig();

function llmFromEnv(): LlmClient {
  const key = process.env.LLM_API_KEY;
  if (!key) {
    // No key configured: every LLM call fails, so the assistant falls back safely.
    return mockLlm(() => {
      throw new Error("LLM_API_KEY is not set");
    });
  }
  return openAiClient(key, process.env.LLM_MODEL || "gpt-4.1-mini");
}

export function runtimeFor(deployContext: string | undefined) {
  const store = blobsConversationStore(deployContext);
  return { store, contract, config, orchestrator: createOrchestrator({ store, contract, config, llm: llmFromEnv() }) };
}

/** Staff endpoints: the shared STAFF_TOKEN must be sent in the x-staff-token header. */
export function isStaff(req: Request): boolean {
  const expected = process.env.STAFF_TOKEN;
  return Boolean(expected) && req.headers.get("x-staff-token") === expected;
}
