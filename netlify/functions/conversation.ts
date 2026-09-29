// GET /api/conversation/:id?after=<messageId> — reload a chat after refresh, and poll for
// agent messages during a handover. Customer-side: only needs the (unguessable) conversation id.

import type { Config, Context } from "@netlify/functions";
import { runtimeFor } from "../../src/core/runtime";

export default async (req: Request, context: Context): Promise<Response> => {
  const id = context.params.id ?? "";
  const after = new URL(req.url).searchParams.get("after") ?? undefined;
  const { store } = runtimeFor(context.deploy?.context);

  const meta = await store.getMeta(id);
  if (!meta) return Response.json({ error: "Conversation not found" }, { status: 404 });

  const messages = await store.listMessages(id, after);
  return Response.json({ conversationId: id, state: meta.state, agentName: meta.agentName, messages }, { headers: { "cache-control": "no-store" } });
};

export const config: Config = { path: "/api/conversation/:id" };
