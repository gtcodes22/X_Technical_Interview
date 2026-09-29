// Where conversations, handovers and audit records live.
//
// Netlify Blobs is last-write-wins, and with Agent view the customer and the agent can write
// at the same moment. So every message is its OWN key (appends never overwrite each other),
// and the small conversation state lives separately in `meta`. See ARCHITECTURE.md §3.2.
//
// `ConversationStore` is an interface so tests can use the in-memory version below.

import { getStore } from "@netlify/blobs";
import { storeName } from "./store";

export type ConversationState = "ANONYMOUS" | "VERIFYING" | "VERIFIED" | "HANDED_OVER" | "WITH_AGENT" | "CLOSED";

export interface ConversationMeta {
  id: string;
  state: ConversationState;
  startedAt: string; // ISO; session limits are measured from here (reset on handback)
  lastCustomerMessageAt: string;
  failedVerifications: number;
  verifiedLoanIds: string[]; // set once verified; bound for the rest of the session
  verifiedBorrowerId: string | null;
  handoverReason: string | null;
  agentName: string | null;
}

export type MessageRole = "customer" | "bot" | "agent" | "system";

export interface ChatMessage {
  id: string; // sortable: ISO timestamp + random suffix
  role: MessageRole;
  type: "text" | "sources" | "account_card" | "verify_form" | "handover_notice" | "error" | "notice";
  text: string;
  data?: unknown; // structured payload, e.g. sources list or account card figures
  author?: string; // agent name for agent messages
  createdAt: string;
}

export interface HandoverEntry {
  conversationId: string;
  reason: string;
  createdAt: string;
  status: "waiting" | "with_agent" | "returned";
  agentName: string | null;
  claimedAt: string | null;
  returnedAt: string | null;
  customerName: string | null;
  loanIds: string[];
}

export interface AuditRecord {
  conversationId: string;
  at: string;
  actor: MessageRole;
  event: string; // e.g. "turn", "verify_failed", "handover", "agent_reply", "agent_return"
  details: Record<string, unknown>;
}

export interface ConversationStore {
  getMeta(id: string): Promise<ConversationMeta | null>;
  saveMeta(meta: ConversationMeta): Promise<void>;
  appendMessage(conversationId: string, message: ChatMessage): Promise<void>;
  listMessages(conversationId: string, afterId?: string): Promise<ChatMessage[]>;
  saveHandover(entry: HandoverEntry): Promise<void>;
  getHandover(conversationId: string): Promise<HandoverEntry | null>;
  listHandovers(): Promise<HandoverEntry[]>;
  appendAudit(record: AuditRecord): Promise<void>;
  listAudit(conversationId: string): Promise<AuditRecord[]>;
}

/** Sortable unique id: the timestamp orders messages; the suffix avoids collisions. */
export function newId(at: Date = new Date()): string {
  return `${at.toISOString()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Production implementation on Netlify Blobs, store names prefixed by deploy context. */
export function blobsConversationStore(deployContext: string | undefined): ConversationStore {
  const conversations = getStore({ name: storeName("conversations", deployContext), consistency: "strong" });
  const handovers = getStore({ name: storeName("handovers", deployContext), consistency: "strong" });
  const audit = getStore({ name: storeName("audit", deployContext), consistency: "strong" });

  async function listJson<T>(store: typeof conversations, prefix: string): Promise<T[]> {
    const { blobs } = await store.list({ prefix });
    const keys = blobs.map((b) => b.key).sort();
    const items: (T | null)[] = await Promise.all(keys.map((key) => store.get(key, { type: "json" })));
    return items.filter((item): item is T => item !== null);
  }

  return {
    getMeta: async (id) => (await conversations.get(`${id}/meta`, { type: "json" })) as ConversationMeta | null,
    saveMeta: async (meta) => void (await conversations.setJSON(`${meta.id}/meta`, meta)),
    appendMessage: async (id, message) => void (await conversations.setJSON(`${id}/messages/${message.id}`, message)),
    listMessages: async (id, afterId) => {
      const messages = await listJson<ChatMessage>(conversations, `${id}/messages/`);
      return afterId ? messages.filter((m) => m.id > afterId) : messages;
    },
    saveHandover: async (entry) => void (await handovers.setJSON(entry.conversationId, entry)),
    getHandover: async (id) => (await handovers.get(id, { type: "json" })) as HandoverEntry | null,
    listHandovers: async () => listJson<HandoverEntry>(handovers, ""),
    appendAudit: async (record) => void (await audit.setJSON(`${record.conversationId}/${newId()}`, record)),
    listAudit: async (id) => listJson<AuditRecord>(audit, `${id}/`),
  };
}

/** In-memory implementation with the same behaviour, for tests. */
export function memoryConversationStore(): ConversationStore {
  const metas = new Map<string, ConversationMeta>();
  const messages = new Map<string, ChatMessage[]>();
  const handovers = new Map<string, HandoverEntry>();
  const audits = new Map<string, AuditRecord[]>();

  return {
    getMeta: async (id) => structuredClone(metas.get(id) ?? null),
    saveMeta: async (meta) => void metas.set(meta.id, structuredClone(meta)),
    appendMessage: async (id, message) => void messages.set(id, [...(messages.get(id) ?? []), message]),
    listMessages: async (id, afterId) =>
      [...(messages.get(id) ?? [])].sort((a, b) => a.id.localeCompare(b.id)).filter((m) => !afterId || m.id > afterId),
    saveHandover: async (entry) => void handovers.set(entry.conversationId, structuredClone(entry)),
    getHandover: async (id) => structuredClone(handovers.get(id) ?? null),
    listHandovers: async () => [...handovers.values()],
    appendAudit: async (record) => void audits.set(record.conversationId, [...(audits.get(record.conversationId) ?? []), record]),
    listAudit: async (id) => audits.get(id) ?? [],
  };
}
