// Agent view actions: claim a handed-over chat, reply in it, and return it to the assistant.
// Client decision D10/D11 (ARCHITECTURE.md §5): the agent replies in the SAME chat, the bot is
// paused meanwhile, and only the agent's "Return to assistant" resumes the bot.

import type { ConversationStore } from "./conversation-store";
import { newId } from "./conversation-store";

export class AgentActionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function load(store: ConversationStore, conversationId: string) {
  const [meta, handover] = await Promise.all([store.getMeta(conversationId), store.getHandover(conversationId)]);
  if (!meta || !handover) throw new AgentActionError("Conversation not found", 404);
  return { meta, handover };
}

/** Takes ownership so only one agent replies. Refused if another agent already holds it. */
export async function claim(store: ConversationStore, conversationId: string, agentName: string, now: Date) {
  const { meta, handover } = await load(store, conversationId);
  if (meta.state === "WITH_AGENT" && meta.agentName !== agentName) {
    throw new AgentActionError(`Already with ${meta.agentName}`, 409);
  }
  if (meta.state !== "HANDED_OVER" && meta.state !== "WITH_AGENT") {
    throw new AgentActionError("This conversation is not waiting for an agent", 409);
  }
  meta.state = "WITH_AGENT";
  meta.agentName = agentName;
  handover.status = "with_agent";
  handover.agentName = agentName;
  handover.claimedAt = now.toISOString();
  await store.saveMeta(meta);
  await store.saveHandover(handover);
  await store.appendMessage(conversationId, {
    id: newId(now), role: "system", type: "notice", text: `${agentName} from Kopano has joined the chat.`, createdAt: now.toISOString(),
  });
  await store.appendAudit({ conversationId, at: now.toISOString(), actor: "agent", event: "agent_claim", details: { agentName } });
}

/** Posts an agent message into the customer's chat. Only the claiming agent may reply. */
export async function reply(store: ConversationStore, conversationId: string, agentName: string, text: string, now: Date) {
  const { meta } = await load(store, conversationId);
  if (meta.state !== "WITH_AGENT" || meta.agentName !== agentName) {
    throw new AgentActionError("Claim the conversation before replying", 409);
  }
  await store.appendMessage(conversationId, {
    id: newId(now), role: "agent", type: "text", text, author: agentName, createdAt: now.toISOString(),
  });
  await store.appendAudit({ conversationId, at: now.toISOString(), actor: "agent", event: "agent_reply", details: { agentName, text } });
}

/** Hands the chat back to the bot. Verification carries over for the rest of the session; timers restart. */
export async function returnToAssistant(store: ConversationStore, conversationId: string, agentName: string, note: string, now: Date) {
  const { meta, handover } = await load(store, conversationId);
  if (meta.state !== "WITH_AGENT" || meta.agentName !== agentName) {
    throw new AgentActionError("Only the agent handling this chat can return it", 409);
  }
  meta.state = meta.verifiedLoanIds.length > 0 ? "VERIFIED" : "ANONYMOUS";
  meta.agentName = null;
  meta.handoverReason = null;
  meta.startedAt = now.toISOString();
  meta.lastCustomerMessageAt = now.toISOString();
  handover.status = "returned";
  handover.returnedAt = now.toISOString();
  await store.saveMeta(meta);
  await store.saveHandover(handover);
  await store.appendMessage(conversationId, {
    id: newId(now), role: "system", type: "notice", text: "You're back with the Kopano Assistant. How else can I help?", createdAt: now.toISOString(),
  });
  // The internal note goes to the audit log only — never shown to the customer.
  await store.appendAudit({ conversationId, at: now.toISOString(), actor: "agent", event: "agent_return", details: { agentName, note } });
}
