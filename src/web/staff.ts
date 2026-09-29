// Staff page: handover queue + Agent view (claim, reply, return). Polls the queue every 10 s
// and the open conversation every 3 s. All server text is inserted with textContent.
export {};

interface Handover {
  conversationId: string;
  reason: string;
  createdAt: string;
  status: "waiting" | "with_agent" | "returned";
  agentName: string | null;
  customerName: string | null;
  loanIds: string[];
  paymentCandidates: string[];
}
interface Message { id: string; role: string; type: string; text: string; author?: string; createdAt: string }
interface Detail {
  handover: Handover;
  state: string;
  agentName: string | null;
  messages: Message[];
  loans: Record<string, unknown>[];
  audit: { at: string; actor: string; event: string; details: Record<string, unknown> }[];
}

const loginForm = document.querySelector<HTMLFormElement>("#login")!;
const app = document.querySelector<HTMLElement>("#app")!;
const queueEl = document.querySelector<HTMLUListElement>("#queue")!;
const detailEl = document.querySelector<HTMLElement>("#detail")!;
const whoEl = document.querySelector<HTMLParagraphElement>("#who")!;

let token = session("get", "staff-token");
let agentName = session("get", "agent-name");
let openId: string | null = null;

function session(op: "get" | "set", key: string, value = ""): string {
  try {
    if (op === "set") sessionStorage.setItem(key, value);
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return value;
  }
}

function el(tag: string, text = "", className = ""): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "x-staff-token": token, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  if (response.status === 401) signOut();
  if (!response.ok) throw new Error(json.error ?? `HTTP ${response.status}`);
  return json as T;
}

const minutesAgo = (iso: string) => `${Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))} min ago`;

async function loadQueue() {
  const { handovers } = await api<{ handovers: Handover[] }>("/api/handovers");
  queueEl.replaceChildren(
    ...handovers.map((h) => {
      const item = el("li", "", `queue-item ${h.status}${h.conversationId === openId ? " open" : ""}`);
      item.append(
        el("strong", h.customerName ?? "Unverified customer"),
        el("span", ` · ${h.status === "with_agent" ? `with ${h.agentName}` : h.status} · ${minutesAgo(h.createdAt)}`, "muted"),
        el("div", h.reason, "muted"),
      );
      item.addEventListener("click", () => openConversation(h.conversationId));
      return item;
    }),
  );
  if (handovers.length === 0) queueEl.replaceChildren(el("li", "No handovers yet.", "muted"));
}

async function openConversation(id: string) {
  openId = id;
  await renderDetail();
  void loadQueue();
}

async function renderDetail() {
  if (!openId) return;
  const d = await api<Detail>(`/api/handovers/${openId}`);
  const mine = d.state === "WITH_AGENT" && d.agentName === agentName;

  const transcript = el("div", "", "transcript");
  for (const m of d.messages) {
    const who = m.role === "agent" ? `${m.author} (agent)` : m.role;
    transcript.append(el("div", `${who}: ${m.text}`, `line ${m.role}`));
  }

  const info = el("div", "", "info");
  info.append(el("h3", `${d.handover.customerName ?? "Unverified customer"} — ${d.state}`), el("p", `Reason: ${d.handover.reason}`));
  for (const loan of d.loans) {
    info.append(el("p", `${loan.loan_id} · ${loan.product} · ${loan.status} · balance P${((loan.outstanding_balance_thebe as number) / 100).toFixed(2)} · arrears P${((loan.arrears_thebe as number) / 100).toFixed(2)} · phone ${loan.phone}`, "muted"));
  }
  if (d.handover.paymentCandidates.length) {
    info.append(el("h4", "Possible payments (need review)"));
    for (const c of d.handover.paymentCandidates) info.append(el("p", c, "muted"));
  }

  const actions = el("div", "", "actions");
  if (d.state === "HANDED_OVER" || (d.state === "WITH_AGENT" && !mine)) {
    const claimButton = el("button", d.state === "WITH_AGENT" ? `With ${d.agentName}` : "Claim") as HTMLButtonElement;
    claimButton.disabled = d.state === "WITH_AGENT";
    claimButton.addEventListener("click", () => act("claim", {}));
    actions.append(claimButton);
  }
  if (mine) {
    const replyForm = document.createElement("form");
    replyForm.className = "reply";
    const input = document.createElement("input");
    input.placeholder = "Reply to the customer…";
    input.required = true;
    replyForm.append(input, el("button", "Send"));
    replyForm.addEventListener("submit", (e) => {
      e.preventDefault();
      void act("reply", { text: input.value });
    });
    const returnButton = el("button", "Return to assistant", "secondary");
    returnButton.addEventListener("click", () => {
      const note = prompt("Internal note for the audit log (optional):") ?? "";
      void act("return", { note });
    });
    actions.append(replyForm, returnButton);
  }

  const audit = el("details", "", "audit");
  audit.append(el("summary", `Audit log (${d.audit.length})`));
  for (const a of d.audit) audit.append(el("pre", `${a.at} ${a.actor} ${a.event} ${JSON.stringify(a.details)}`));

  detailEl.replaceChildren(info, transcript, actions, audit);
  transcript.scrollTop = transcript.scrollHeight;
}

async function act(action: "claim" | "reply" | "return", body: Record<string, string>) {
  try {
    await api(`/api/handovers/${openId}/${action}`, { agentName, ...body });
  } catch (error) {
    alert(String(error));
  }
  await renderDetail();
  void loadQueue();
}

function signOut() {
  token = session("set", "staff-token", "");
  app.hidden = true;
  loginForm.hidden = false;
}

function start() {
  loginForm.hidden = true;
  app.hidden = false;
  whoEl.textContent = `Signed in as ${agentName}`;
  void loadQueue().catch((e) => alert(String(e)));
  setInterval(() => void loadQueue().catch(() => undefined), 10_000);
  setInterval(() => {
    // Don't re-render while the agent is typing a reply.
    if (openId && !(document.activeElement instanceof HTMLInputElement)) void renderDetail().catch(() => undefined);
  }, 3_000);
}

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = new FormData(loginForm);
  token = session("set", "staff-token", String(data.get("token")));
  agentName = session("set", "agent-name", String(data.get("agentName")).trim());
  start();
});

if (token && agentName) start();
