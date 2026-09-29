// Optional live check against the real LLM. Skipped unless LIVE=1 (never runs in CI / Netlify build).
import { readFileSync } from "node:fs";
import { it } from "vitest";
import { loadContract } from "../src/core/contract";
import { memoryConversationStore } from "../src/core/conversation-store";
import { openAiClient } from "../src/core/llm";
import { createOrchestrator } from "../src/core/orchestrator";

it.skipIf(process.env.LIVE !== "1")("live: policy and account questions", async () => {
  const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
  const bot = createOrchestrator({ store: memoryConversationStore(), contract: loadContract(), llm: openAiClient(env.LLM_API_KEY!, env.LLM_MODEL || "gpt-4.1-mini"), config: { today: "2026-10-06", nowOverride: new Date("2026-10-06T10:00:00+02:00") } });
  for (const q of ["How do I pay with MyZaka?", "What happens if I pay late?", "When is my next payment?"]) {
    const t = await bot.handleTurn(null, { kind: "message", text: q });
    console.log(`\nQ: ${q}\n` + t.messages.map((m) => `  [${m.type}] ${m.text}`).join("\n"));
  }
}, 60_000);
