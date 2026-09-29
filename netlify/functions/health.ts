import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import buildInfo from "../../src/core/build-info.json";
import { loadConfig } from "../../src/core/config";
import { storeName } from "../../src/core/store";

// GET /api/health: which version and data are live, and whether storage works.
// Used by the smoke test and the uptime monitor (OPERATIONS.md §3).
export default async (_req: Request, context: Context): Promise<Response> => {
  const deployContext = context.deploy?.context ?? "dev";
  const blobs = await checkBlobs(deployContext);

  let today: string | null = null;
  let configError: string | null = null;
  try {
    today = loadConfig().today;
  } catch (err) {
    configError = String(err);
  }

  const healthy = blobs === "ok" && configError === null;
  const body = {
    status: healthy ? "ok" : "degraded",
    commit: buildInfo.commit,
    builtAt: buildInfo.builtAt,
    deployContext,
    today,
    checks: { blobs, config: configError ?? "ok" },
  };

  return Response.json(body, {
    status: healthy ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
};

async function checkBlobs(deployContext: string): Promise<"ok" | "error"> {
  try {
    const store = getStore({ name: storeName("health", deployContext), consistency: "strong" });
    const stamp = new Date().toISOString();
    await store.set("last-check", stamp);
    const readBack = await store.get("last-check", { type: "text" });
    return readBack === stamp ? "ok" : "error";
  } catch (err) {
    console.error(JSON.stringify({ event: "health.blobs_error", error: String(err) }));
    return "error";
  }
}

export const config: Config = { path: "/api/health" };
