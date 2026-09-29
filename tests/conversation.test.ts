// Scripted conversations through the real orchestrator, with a mocked LLM and in-memory store.
// These pin the rules that must never break: no figures before verification, figures from data,
// 3 failed verifications -> handover, bot silence after handover, sessions, superseded policy.

import { describe, expect, it } from "vitest";
import { loadContract } from "../src/core/contract";
import { memoryConversationStore } from "../src/core/conversation-store";
import { mockLlm } from "../src/core/llm";
import { createOrchestrator } from "../src/core/orchestrator";

const contract = loadContract();

// Mock LLM: routes by keywords; answers policy questions by citing extract 1.
const llm = mockLlm((system, user) => {
  if (system.includes('{"intent"')) {
    const intent = /balance|owe|next payment|due/i.test(user) ? "account" : /^(hi|hello)/i.test(user) ? "smalltalk" : "policy";
    return JSON.stringify({ intent });
  }
  return "Here is the answer from our policy. SOURCES: 1";
});

function setup(nowIso = "2026-10-06T10:00:00+02:00") {
  const store = memoryConversationStore();
  const config = { today: "2026-10-06", nowOverride: new Date(nowIso) };
  return { store, config, bot: createOrchestrator({ store, contract, llm, config }) };
}

// Neo Mokgethi, KM-L-0007: +267 71 555 204, ID last 4 = 4821 (from loans.json)
const NEO = { phone: "71 555 204", idLast4: "4821" };

describe("verification and account answers", () => {
  it("asks for verification before sharing any figures", async () => {
    const { bot } = setup();
    const turn = await bot.handleTurn(null, { kind: "message", text: "What is my balance?" });
    expect(turn.state).toBe("VERIFYING");
    expect(turn.messages.map((m) => m.type)).toContain("verify_form");
    expect(turn.messages.some((m) => /P\d/.test(m.text))).toBe(false);
  });

  it("after verification, shows figures taken from loans.json", async () => {
    const { bot } = setup();
    const first = await bot.handleTurn(null, { kind: "message", text: "What is my balance?" });
    const turn = await bot.handleTurn(first.conversationId, { kind: "verify", ...NEO });
    expect(turn.state).toBe("VERIFIED");
    const card = turn.messages.find((m) => m.type === "account_card")!;
    expect(card.text).toContain("KM-L-0007");
    expect(card.text).toContain("P1,500.00"); // monthly instalment
    expect(card.text).toContain("P7,500.00"); // outstanding balance
    expect(card.text).toContain("25 October 2026");
  });

  it("hands over after three failed verifications", async () => {
    const { bot, store } = setup();
    let turn = await bot.handleTurn(null, { kind: "message", text: "my balance please" });
    for (let i = 0; i < 3; i++) turn = await bot.handleTurn(turn.conversationId, { kind: "verify", phone: "71 555 204", idLast4: "0000" });
    expect(turn.state).toBe("HANDED_OVER");
    expect((await store.getHandover(turn.conversationId))?.reason).toMatch(/verification failed/i);
  });

  it("never stores verification details unmasked", async () => {
    const { bot, store } = setup();
    const turn = await bot.handleTurn(null, { kind: "verify", ...NEO });
    const stored = JSON.stringify(await store.listMessages(turn.conversationId)) + JSON.stringify(await store.listAudit(turn.conversationId));
    expect(stored).not.toContain("71555204");
    expect(stored).not.toContain("4821");
  });
});

describe("handover", () => {
  it("hands over on a dispute and then stays silent", async () => {
    const { bot } = setup();
    const turn = await bot.handleTurn(null, { kind: "message", text: "I already paid and you are still calling me" });
    expect(turn.state).toBe("HANDED_OVER");
    expect(turn.messages[0]?.type).toBe("handover_notice");
    const next = await bot.handleTurn(turn.conversationId, { kind: "message", text: "hello?" });
    expect(next.messages).toHaveLength(0);
  });

  it("outside agent hours, says when agents are next available", async () => {
    const { bot } = setup("2026-10-10T14:00:00+02:00"); // Saturday afternoon
    const turn = await bot.handleTurn(null, { kind: "message", text: "I want to speak to a person" });
    expect(turn.messages[0]?.text).toContain("Monday at 08:00");
  });
});

describe("policy answers", () => {
  it("answers with a source and never cites the superseded 2023 penalty rules", async () => {
    const { bot } = setup();
    const turn = await bot.handleTurn(null, { kind: "message", text: "What is the penalty for late payment?" });
    const sources = turn.messages.find((m) => m.type === "sources")!;
    expect(sources.text).not.toContain("v2.1");
    expect(sources.text.length).toBeGreaterThan(0);
  });
});

describe("sessions", () => {
  it("closes after 5 minutes idle while the bot is in control", async () => {
    const early = setup("2026-10-06T10:00:00+02:00");
    const first = await early.bot.handleTurn(null, { kind: "message", text: "hi" });
    const later = createOrchestrator({ store: early.store, contract, llm, config: { today: "2026-10-06", nowOverride: new Date("2026-10-06T10:06:00+02:00") } });
    const turn = await later.handleTurn(first.conversationId, { kind: "message", text: "are you there?" });
    expect(turn.state).toBe("CLOSED");
  });
});
