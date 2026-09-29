// Staff API (needs the x-staff-token header):
//   GET  /api/handovers                  queue, oldest waiting first
//   GET  /api/handovers/:id              detail: transcript, loans, payment candidates, audit
//   POST /api/handovers/:id/claim        { agentName }
//   POST /api/handovers/:id/reply        { agentName, text }
//   POST /api/handovers/:id/return       { agentName, note? }

import type { Config, Context } from "@netlify/functions";
import { AgentActionError, claim, reply, returnToAssistant } from "../../src/core/agent";
import { now as clockNow } from "../../src/core/config";
import { maskPhone } from "../../src/core/masking";
import { isStaff, runtimeFor } from "../../src/core/runtime";

export default async (req: Request, context: Context): Promise<Response> => {
  if (!isStaff(req)) return Response.json({ error: "Staff token required" }, { status: 401 });

  const { store, contract, config } = runtimeFor(context.deploy?.context);
  const id = context.params.id;
  const action = context.params.action;
  const noStore = { headers: { "cache-control": "no-store" } };

  if (req.method === "GET" && !id) {
    const order = { waiting: 0, with_agent: 1, returned: 2 } as const;
    const queue = (await store.listHandovers()).sort((a, b) => order[a.status] - order[b.status] || a.createdAt.localeCompare(b.createdAt));
    return Response.json({ handovers: queue }, noStore);
  }

  if (req.method === "GET" && id) {
    const [handover, meta, messages, audit] = await Promise.all([
      store.getHandover(id), store.getMeta(id), store.listMessages(id), store.listAudit(id),
    ]);
    if (!handover || !meta) return Response.json({ error: "Not found" }, { status: 404 });
    const loans = contract.loans
      .filter((loan) => handover.loanIds.includes(loan.loan_id))
      .map(({ phone_normalised, id_last4: _hidden, ...loan }) => ({ ...loan, phone: maskPhone(phone_normalised) }));
    return Response.json({ handover, state: meta.state, agentName: meta.agentName, messages, loans, audit }, noStore);
  }

  if (req.method === "POST" && id && action) {
    const body = (await req.json().catch(() => ({}))) as { agentName?: string; text?: string; note?: string };
    const agentName = (body.agentName ?? "").trim().slice(0, 40);
    if (!agentName) return Response.json({ error: "agentName is required" }, { status: 400 });
    const now = clockNow(config);
    try {
      if (action === "claim") await claim(store, id, agentName, now);
      else if (action === "reply") {
        const text = (body.text ?? "").trim().slice(0, 2000);
        if (!text) return Response.json({ error: "text is required" }, { status: 400 });
        await reply(store, id, agentName, text, now);
      } else if (action === "return") await returnToAssistant(store, id, agentName, (body.note ?? "").slice(0, 500), now);
      else return Response.json({ error: "Unknown action" }, { status: 404 });
    } catch (error) {
      if (error instanceof AgentActionError) return Response.json({ error: error.message }, { status: error.status });
      throw error;
    }
    return Response.json({ ok: true }, noStore);
  }

  return Response.json({ error: "Not found" }, { status: 404 });
};

export const config: Config = { path: ["/api/handovers", "/api/handovers/:id", "/api/handovers/:id/:action"] };
