// Customer chat page. Renders the server's structured messages; all text is inserted with
// textContent (never innerHTML). Polls for agent messages while the chat is handed over.
export {};

interface ChatMessage {
  id: string;
  role: "customer" | "bot" | "agent" | "system";
  type: "text" | "sources" | "account_card" | "verify_form" | "handover_notice" | "error" | "notice";
  text: string;
  data?: unknown;
  author?: string;
}
interface ChatResponse {
  conversationId: string;
  state: string;
  messages: ChatMessage[];
}

const STORAGE_KEY = "kopano-conversation-id";
const messagesEl = document.querySelector<HTMLElement>("#messages")!;
const form = document.querySelector<HTMLFormElement>("#composer")!;
const input = document.querySelector<HTMLInputElement>("#input")!;
const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;

let conversationId: string | null = readStoredId();
let lastMessageId: string | undefined;
let pollTimer: number | undefined;

function readStoredId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function storeId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* private mode: the chat still works, it just won't survive a refresh */
  }
}

function el(tag: string, className: string, text = ""): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function render(message: ChatMessage) {
  lastMessageId = message.id;
  if (message.type === "sources") {
    const chips = el("div", "sources");
    for (const source of (message.data as string[]) ?? []) chips.append(el("span", "chip", `📄 ${source}`));
    messagesEl.append(chips);
  } else if (message.type === "verify_form") {
    messagesEl.append(el("div", "bubble bot", message.text), verifyForm());
  } else if (message.type === "account_card") {
    const card = el("div", "card");
    for (const line of message.text.split("\n")) card.append(el("p", "", line));
    const asAt = (message.data as { asAt?: string })?.asAt ?? "";
    const received = (message.data as { loans?: { loanId: string; receivedNotReflectedThebe: number }[] })?.loans ?? [];
    for (const loan of received.filter((l) => l.receivedNotReflectedThebe > 0)) {
      card.append(el("p", "received", `✓ ${loan.loanId}: we've received P${(loan.receivedNotReflectedThebe / 100).toFixed(2)} since ${asAt} that isn't reflected yet.`));
    }
    card.append(el("p", "muted", `Figures as at ${asAt}. Payments made since then may not show yet.`));
    messagesEl.append(card);
  } else {
    const roleClass = message.type === "handover_notice" || message.type === "notice" ? "notice" : message.type === "error" ? "error" : message.role;
    const bubble = el("div", `bubble ${roleClass}`, message.text);
    if (message.role === "agent") bubble.prepend(el("strong", "author", `${message.author ?? "Agent"} (Kopano)`));
    messagesEl.append(bubble);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function verifyForm(): HTMLFormElement {
  const f = document.createElement("form");
  f.className = "verify";
  f.innerHTML = `
    <label>Mobile number <input name="phone" inputmode="tel" autocomplete="tel" required></label>
    <label>Last 4 digits of ID <input name="idLast4" inputmode="numeric" maxlength="4" type="password" required></label>
    <button type="submit">Verify</button>`;
  f.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(f);
    f.querySelector("button")!.disabled = true;
    await send({ action: "verify", phone: String(data.get("phone")), idLast4: String(data.get("idLast4")) }, "Verification details sent");
    f.remove();
  });
  return f;
}

async function send(payload: Record<string, string>, shownText: string) {
  messagesEl.append(el("div", "bubble customer", shownText));
  const button = form.querySelector("button")!;
  button.disabled = true;
  const typing = el("div", "bubble bot typing", "…");
  messagesEl.append(typing);
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, conversationId }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = (await response.json()) as ChatResponse;
    conversationId = result.conversationId;
    storeId(result.conversationId);
    typing.remove();
    result.messages.forEach(render);
    updateState(result.state);
  } catch {
    typing.remove();
    render({ id: lastMessageId ?? "", role: "bot", type: "error", text: "Sorry, something went wrong. Please try again, or ask to speak to an agent." });
  } finally {
    button.disabled = false;
    input.focus();
  }
}

function updateState(state: string) {
  const withHuman = state === "HANDED_OVER" || state === "WITH_AGENT";
  input.placeholder = withHuman ? "Message the agent…" : state === "CLOSED" ? "This chat has ended" : "Type your question…";
  statusEl.textContent = withHuman ? (state === "WITH_AGENT" ? "Chatting with a Kopano agent" : "Waiting for an agent") : "Kopano Assistant";
  if (state === "CLOSED") showNewChatButton();
  if (withHuman && pollTimer === undefined) pollTimer = window.setInterval(poll, 3000);
  if (!withHuman && pollTimer !== undefined) {
    window.clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

/** While handed over: fetch messages newer than the last one shown (agent replies, handback notice). */
async function poll() {
  if (!conversationId || document.hidden) return;
  const query = lastMessageId ? `?after=${encodeURIComponent(lastMessageId)}` : "";
  const response = await fetch(`/api/conversation/${conversationId}${query}`).catch(() => null);
  if (!response?.ok) return;
  const result = (await response.json()) as ChatResponse;
  result.messages.filter((m) => m.role !== "customer").forEach(render);
  updateState(result.state);
}

function showNewChatButton() {
  const button = el("button", "new-chat", "Start a new chat") as HTMLButtonElement;
  button.addEventListener("click", () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    location.reload();
  });
  messagesEl.append(button);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  void send({ message: text }, text);
});

async function restore() {
  if (!conversationId) {
    render({ id: "", role: "bot", type: "text", text: "Hi! I'm the Kopano Assistant. I can help with payments, balances, due dates and our policies." });
    return;
  }
  const response = await fetch(`/api/conversation/${conversationId}`).catch(() => null);
  if (!response?.ok) {
    conversationId = null;
    return restore();
  }
  const result = (await response.json()) as ChatResponse;
  result.messages.filter((m) => m.type !== "verify_form").forEach(render);
  updateState(result.state);
}

void restore();
