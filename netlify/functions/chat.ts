// POST /api/chat — one customer turn. Body: { conversationId?, message } or
// { conversationId, action: "verify", phone, idLast4 }. Returns the new messages.

import type { Config, Context } from "@netlify/functions";
import type { TurnInput } from "../../src/core/orchestrator";
import { runtimeFor } from "../../src/core/runtime";

export default async (req: Request, context: Context): Promise<Response> => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body: { conversationId?: string; message?: string; action?: string; phone?: string; idLast4?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let input: TurnInput;
  if (body.action === "verify") {
    input = { kind: "verify", phone: String(body.phone ?? ""), idLast4: String(body.idLast4 ?? "") };
  } else if (typeof body.message === "string" && body.message.trim() && body.message.length <= 1000) {
    input = { kind: "message", text: body.message.trim() };
  } else {
    return Response.json({ error: "message is required (max 1000 characters)" }, { status: 400 });
  }

  const started = Date.now();
  const { orchestrator } = runtimeFor(context.deploy?.context);
  const result = await orchestrator.handleTurn(body.conversationId ?? null, input);
  // Structured log line — no personal data (OPERATIONS.md §3.2).
  console.log(JSON.stringify({ event: "chat.turn", conversationId: result.conversationId, state: result.state, ms: Date.now() - started }));
  return Response.json(result, { headers: { "cache-control": "no-store" } });
};

export const config: Config = { path: "/api/chat" };
