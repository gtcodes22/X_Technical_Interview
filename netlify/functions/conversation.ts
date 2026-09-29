// GET /api/conversation/:id?after=<messageId> — reload a chat after refresh, and poll for
// agent messages during a handover. Customer-side: only needs the (unguessable) conversation id.
//
// Privacy: a closed or expired session returns NO messages. On a shared phone, the next person
// who opens the page must not see the previous customer's transcript or account figures.

import type { Config, Context } from "@netlify/functions";
import { now as clockNow } from "../../src/core/config";
import { sessionExpired } from "../../src/core/orchestrator";
import { runtimeFor } from "../../src/core/runtime";

const HUMAN_IN_CONTROL = new Set(["HANDED_OVER", "WITH_AGENT"]);

export default async (req: Request, context: Context): Promise<Response> => {
  const id = context.params.id ?? "";
  const after = new URL(req.url).searchParams.get("after") ?? undefined;
  const { store, config } = runtimeFor(context.deploy?.context);
  const noStore = { headers: { "cache-control": "no-store" } };

  const meta = await store.getMeta(id);
  if (!meta) return Response.json({ error: "Conversation not found" }, { status: 404 });

  // Session limits only apply while the bot is in control (timers pause during handover).
  if (meta.state !== "CLOSED" && !HUMAN_IN_CONTROL.has(meta.state) && sessionExpired(meta, clockNow(config))) {
    meta.state = "CLOSED";
    await store.saveMeta(meta);
  }
  if (meta.state === "CLOSED") {
    return Response.json({ conversationId: id, state: "CLOSED", agentName: null, messages: [] }, noStore);
  }

  const messages = await store.listMessages(id, after);
  return Response.json({ conversationId: id, state: meta.state, agentName: meta.agentName, messages }, noStore);
};

export const config: Config = { path: "/api/conversation/:id" };
