// Agent view round trip: handover -> claim -> reply -> return; bot resumes with verification kept.
import { describe, expect, it } from "vitest";
import { claim, reply, returnToAssistant } from "../src/core/agent";
import { loadContract } from "../src/core/contract";
import { memoryConversationStore } from "../src/core/conversation-store";
import { mockLlm } from "../src/core/llm";
import { createOrchestrator } from "../src/core/orchestrator";

const llm = mockLlm((system, user) =>
  system.includes('{"intent"') ? JSON.stringify({ intent: /balance/i.test(user) ? "account" : "policy" }) : "Answer. SOURCES: 1",
);

describe("agent round trip", () => {
  it("claim, reply, return — then the bot answers again and the customer is still verified", async () => {
    const store = memoryConversationStore();
    const config = { today: "2026-10-06", nowOverride: new Date("2026-10-06T10:00:00+02:00") };
    const bot = createOrchestrator({ store, contract: loadContract(), llm, config });
    const now = new Date("2026-10-06T10:01:00+02:00");

    let turn = await bot.handleTurn(null, { kind: "message", text: "my balance" });
    turn = await bot.handleTurn(turn.conversationId, { kind: "verify", phone: "71555204", idLast4: "4821" });
    turn = await bot.handleTurn(turn.conversationId, { kind: "message", text: "I already paid" });
    const id = turn.conversationId;
    expect(turn.state).toBe("HANDED_OVER");

    await claim(store, id, "Kagiso", now);
    await expect(claim(store, id, "Lorato", now)).rejects.toThrow(/Already with Kagiso/);
    await expect(reply(store, id, "Lorato", "hi", now)).rejects.toThrow();
    await reply(store, id, "Kagiso", "I can see your payment, give me a moment.", now);
    expect((await store.getMeta(id))?.state).toBe("WITH_AGENT");

    await returnToAssistant(store, id, "Kagiso", "payment found, allocation requested", now);
    expect((await store.getMeta(id))?.state).toBe("VERIFIED");

    const after = await bot.handleTurn(id, { kind: "message", text: "what is my balance now?" });
    expect(after.messages.some((m) => m.type === "account_card")).toBe(true);
    const audit = await store.listAudit(id);
    expect(audit.map((a) => a.event)).toEqual(expect.arrayContaining(["agent_claim", "agent_reply", "agent_return"]));
  });
});
