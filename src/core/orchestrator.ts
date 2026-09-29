// The conversation state machine: one customer turn in, the new messages out.
// States and session rules: ARCHITECTURE.md §5. Routing order matters:
//   1. session / handover state  2. verification form  3. handover rules  4. LLM intent
//   5. policy answer or account answer  — and every turn writes an audit record.

import { buildAccountCard, findVerifiedLoans, formatDate, formatPula, paymentCandidates } from "./account";
import type { AppConfig } from "./config";
import { now as clockNow } from "./config";
import type { Contract } from "./contract";
import type { ChatMessage, ConversationMeta, ConversationStore } from "./conversation-store";
import { newId } from "./conversation-store";
import { matchHandoverRule } from "./handover-rules";
import { isWithinAgentHours, nextAgentAvailability } from "./hours";
import type { LlmClient } from "./llm";
import { maskIdLast4, maskPhone, redactSensitive } from "./masking";
import { normalisePhone } from "./phone";
import { buildIndex } from "./retrieval";

const SESSION_MAX_MINUTES = 60;
const SESSION_IDLE_MINUTES = 5;
const MAX_VERIFICATION_ATTEMPTS = 3;

export type TurnInput =
  | { kind: "message"; text: string }
  | { kind: "verify"; phone: string; idLast4: string };

export interface TurnResult {
  conversationId: string;
  state: ConversationMeta["state"];
  messages: ChatMessage[];
}

export interface Deps {
  store: ConversationStore;
  contract: Contract;
  llm: LlmClient;
  config: AppConfig;
}

export function createOrchestrator(deps: Deps) {
  const { store, contract, llm, config } = deps;
  const index = buildIndex(contract.chunks);

  async function handleTurn(conversationId: string | null, input: TurnInput): Promise<TurnResult> {
    const now = clockNow(config);
    const meta = (conversationId && (await store.getMeta(conversationId))) || newConversation(now);
    const out: ChatMessage[] = [];
    const say = (message: Omit<ChatMessage, "id" | "createdAt">) => {
      out.push({ ...message, id: newId(new Date(now.getTime() + out.length)), createdAt: now.toISOString() });
    };
    const audit: Record<string, unknown> = {};

    // Store what the customer said — verification details are masked, other text redacted.
    const customerText =
      input.kind === "verify"
        ? `Verification submitted: phone ${maskPhone(normalisePhone(input.phone) ?? "")}, ID ${maskIdLast4(input.idLast4)}`
        : redactSensitive(input.text);
    await store.appendMessage(meta.id, { id: newId(now), role: "customer", type: "text", text: customerText, createdAt: now.toISOString() });

    // 1. Session and handover state.
    if (meta.state !== "HANDED_OVER" && meta.state !== "WITH_AGENT" && meta.state !== "CLOSED" && sessionExpired(meta, now)) {
      meta.state = "CLOSED";
      audit.closed = "session limit reached";
    }
    if (meta.state === "CLOSED") {
      say({ role: "system", type: "notice", text: "This chat has ended. Please start a new chat to continue." });
    } else if (meta.state === "HANDED_OVER" || meta.state === "WITH_AGENT") {
      // The bot is silent while a human is responsible. Nothing else happens.
      audit.silent = true;
    } else {
      meta.lastCustomerMessageAt = now.toISOString();
      if (input.kind === "verify") {
        await handleVerification(meta, input, say, audit, now);
      } else {
        await handleMessage(meta, input.text, say, audit, now);
      }
    }

    for (const message of out) await store.appendMessage(meta.id, message);
    await store.saveMeta(meta);
    await store.appendAudit({
      conversationId: meta.id,
      at: now.toISOString(),
      actor: "customer",
      event: "turn",
      details: { input: customerText, state: meta.state, replies: out.map((m) => `${m.type}: ${m.text}`), ...audit },
    });
    return { conversationId: meta.id, state: meta.state, messages: out };
  }

  async function handleMessage(meta: ConversationMeta, rawText: string, say: Say, audit: Record<string, unknown>, now: Date) {
    const text = redactSensitive(rawText);

    // 3. Rules first: obvious handover cases never depend on the model.
    const ruleReason = matchHandoverRule(text);
    if (ruleReason) {
      audit.handoverRule = ruleReason;
      await handOver(meta, ruleReason, say, now);
      return;
    }

    // 4. LLM intent. If the LLM is down, fall back to a keyword guess so account questions still work.
    const intent = await classifyIntent(text, audit);

    if (intent === "handover") {
      await handOver(meta, "Assistant judged a human is needed", say, now);
    } else if (intent === "account") {
      if (meta.state === "VERIFIED") {
        sayAccountCard(meta, say, audit);
      } else {
        meta.state = "VERIFYING";
        say({ role: "bot", type: "text", text: "I can help with that. First I need to confirm it's you." });
        say({ role: "bot", type: "verify_form", text: "Enter your registered mobile number and the last 4 digits of your Omang or passport." });
      }
    } else if (intent === "smalltalk") {
      say({ role: "bot", type: "text", text: "Hello! I can help with payments, balances, due dates and Kopano's policies. What would you like to know?" });
    } else {
      await answerPolicy(meta, text, say, audit, now);
    }
  }

  async function classifyIntent(text: string, audit: Record<string, unknown>): Promise<"policy" | "account" | "handover" | "smalltalk"> {
    const system = `You route messages for Kopano Microfinance's customer chat. Reply with JSON {"intent": ...} where intent is one of:
"account" — about THEIR OWN loan: balance, amount owed, next payment date or amount, arrears, their penalties.
"policy" — general questions about products, how to pay, fees, penalties rules, branches, hours, settlement, privacy.
"handover" — needs a human: complaints, disputes, hardship, payment holidays, restructuring, top-ups, fraud, anything you cannot answer.
"smalltalk" — greetings or thanks only.`;
    try {
      const started = Date.now();
      const reply = JSON.parse(await llm.complete(system, text, { json: true })) as { intent?: string };
      audit.intent = reply.intent;
      audit.intentLatencyMs = Date.now() - started;
      if (reply.intent === "account" || reply.intent === "handover" || reply.intent === "smalltalk") return reply.intent;
      return "policy";
    } catch (error) {
      audit.llmError = String(error);
      const looksLikeAccount = /\b(my (balance|loan|payment|account)|how much do i owe|when is my|next payment|outstanding)\b/i.test(text);
      audit.intent = looksLikeAccount ? "account (fallback)" : "policy (fallback)";
      return looksLikeAccount ? "account" : "policy";
    }
  }

  async function answerPolicy(meta: ConversationMeta, text: string, say: Say, audit: Record<string, unknown>, now: Date) {
    const hits = index.search(text);
    audit.retrieved = hits.map((h) => `${h.chunk.chunk_id} (${h.score.toFixed(1)})`);
    if (hits.length === 0) {
      await handOver(meta, "Question not covered by Kopano's policies", say, now);
      return;
    }

    const context = hits.map((h, i) => `[${i + 1}] ${h.chunk.title} — ${h.chunk.section}\n${h.chunk.text}`).join("\n\n");
    const system = `You are Kopano Microfinance's website assistant. Answer ONLY from the numbered policy extracts below.
Be polite, clear and brief (max 5 sentences). Never guess amounts, dates or policy. Never promise waivers, payment holidays or approvals.
If the extracts do not answer the question, reply exactly: NO_ANSWER
End your reply with the extract numbers you used, like: SOURCES: 1,3

${context}`;

    let reply: string;
    try {
      reply = await llm.complete(system, text);
    } catch (error) {
      audit.llmError = String(error);
      say({ role: "bot", type: "error", text: "Sorry, I'm having trouble answering right now. You can try again, or ask to speak to an agent." });
      return;
    }

    if (reply.includes("NO_ANSWER")) {
      await handOver(meta, "Question not covered by Kopano's policies", say, now);
      return;
    }
    const [answer, sourcesPart] = reply.split(/SOURCES:/i);
    const used = (sourcesPart ?? "1").match(/\d+/g)?.map(Number) ?? [1];
    const sources = [...new Set(used.map((n) => hits[n - 1]?.chunk).filter((c) => c !== undefined).map((c) => sourceLabel(c.title, c.version)))];
    audit.sources = sources;
    say({ role: "bot", type: "text", text: (answer ?? reply).trim() });
    say({ role: "bot", type: "sources", text: sources.join(" · "), data: sources });
  }

  async function handleVerification(meta: ConversationMeta, input: { phone: string; idLast4: string }, say: Say, audit: Record<string, unknown>, now: Date) {
    const loans = findVerifiedLoans(contract, input.phone, input.idLast4);
    if (loans.length > 0) {
      meta.state = "VERIFIED";
      meta.verifiedLoanIds = loans.map((l) => l.loan_id);
      meta.verifiedBorrowerId = loans[0]!.borrower_id;
      meta.failedVerifications = 0;
      audit.verified = meta.verifiedBorrowerId;
      say({ role: "bot", type: "text", text: `Thank you, ${loans[0]!.first_name}. You're verified.` });
      sayAccountCard(meta, say, audit);
      return;
    }

    meta.failedVerifications += 1;
    audit.verifyFailed = meta.failedVerifications;
    if (meta.failedVerifications >= MAX_VERIFICATION_ATTEMPTS) {
      await handOver(meta, "Identity verification failed three times", say, now);
    } else {
      const left = MAX_VERIFICATION_ATTEMPTS - meta.failedVerifications;
      say({ role: "bot", type: "text", text: `Those details don't match our records. Please try again (${left} attempt${left === 1 ? "" : "s"} left).` });
      say({ role: "bot", type: "verify_form", text: "Enter your registered mobile number and the last 4 digits of your Omang or passport." });
    }
  }

  function sayAccountCard(meta: ConversationMeta, say: Say, audit: Record<string, unknown>) {
    const card = buildAccountCard(contract, meta.verifiedLoanIds);
    audit.accountRows = meta.verifiedLoanIds;
    const lines = card.loans.map((l) =>
      l.inArrears
        ? `${l.loanId} (${l.product}): overdue since ${formatDate(l.nextDueDate)} — ${formatPula(l.amountDueThebe)} due now including penalties. Outstanding balance ${formatPula(l.outstandingBalanceThebe)}.`
        : `${l.loanId} (${l.product}): next payment ${formatPula(l.amountDueThebe)} due ${formatDate(l.nextDueDate)}. Outstanding balance ${formatPula(l.outstandingBalanceThebe)}.`,
    );
    say({ role: "bot", type: "account_card", text: lines.join("\n"), data: card });
  }

  async function handOver(meta: ConversationMeta, reason: string, say: Say, now: Date) {
    meta.state = "HANDED_OVER";
    meta.handoverReason = reason;
    const loans = contract.loans.filter((l) => meta.verifiedLoanIds.includes(l.loan_id));
    const alreadyPaid = /paid/i.test(reason) || reason.includes("disputes");
    await store.saveHandover({
      conversationId: meta.id,
      reason,
      createdAt: now.toISOString(),
      status: "waiting",
      agentName: null,
      claimedAt: null,
      returnedAt: null,
      customerName: loans[0] ? `${loans[0].first_name} ${loans[0].last_name}` : null,
      loanIds: meta.verifiedLoanIds,
      paymentCandidates: alreadyPaid ? paymentCandidates(contract, meta.verifiedLoanIds, loans[0]?.phone_normalised ?? null) : [],
    });
    const when = isWithinAgentHours(now)
      ? "An agent will join this chat shortly."
      : `Our agents are available Mon–Fri 08:00–17:00 and Sat 08:30–13:00. An agent will reply here from ${nextAgentAvailability(now)} — you can come back to this chat on this device.`;
    say({ role: "system", type: "handover_notice", text: `I'm transferring you to a Kopano customer service agent (${reason.toLowerCase()}). ${when}` });
  }

  return { handleTurn };
}

type Say = (message: Omit<ChatMessage, "id" | "createdAt">) => void;

function newConversation(now: Date): ConversationMeta {
  return {
    id: crypto.randomUUID(),
    state: "ANONYMOUS",
    startedAt: now.toISOString(),
    lastCustomerMessageAt: now.toISOString(),
    failedVerifications: 0,
    verifiedLoanIds: [],
    verifiedBorrowerId: null,
    handoverReason: null,
    agentName: null,
  };
}

/** 60 minutes from the (re)start, or 5 minutes idle — only while the bot is in control. */
export function sessionExpired(meta: ConversationMeta, now: Date): boolean {
  const minutesSince = (iso: string) => (now.getTime() - new Date(iso).getTime()) / 60_000;
  return minutesSince(meta.startedAt) > SESSION_MAX_MINUTES || minutesSince(meta.lastCustomerMessageAt) > SESSION_IDLE_MINUTES;
}

function sourceLabel(title: string, version: string | null): string {
  return version ? `${title} (v${version})` : title;
}
