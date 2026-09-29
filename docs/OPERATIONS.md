# Operations: deployment, CI/CD, monitoring and runbooks

> **Status: PROPOSED.** Nothing here is set up yet. Items are tagged by when they're realistic:
> - **[Day]**: during the 2-hour build
> - **[Stretch]**: if time allows
> - **[Next]**: production follow-up, listed in the README's "what we would do next"

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the system itself works.

---

## 1. Deployment

### 1.1 Pipeline overview

```text
 laptop                         GitHub                        Netlify
 ──────                         ──────                        ───────
 python scripts/ingest.py  ─┐
   (DuckDB checks must pass)│
 git commit (code + data/   │
   generated/*.json)        └─▶ push branch ──▶ PR ──────────▶ Deploy Preview   deploy-preview-N--site.netlify.app
                                   │  GitHub Actions CI                  │  (own env vars, own Blobs namespace)
                                   │  (Python + TS checks)               │
                                   ▼                                     │
                                merge to main ──────────────────────▶ Production build
                                                                       npm ci → typecheck → test → vite build
                                                                       → bundle functions + data/generated
                                                                       → atomic publish
                                                                               │
                                                                 post-deploy smoke test (scripts/smoke_test.py)
```

**Principles:**
- **Netlify never runs Python.** The ingest runs locally, and its output (`data/generated/`) is committed. The Netlify build is TypeScript only.
- **The Netlify build command runs the tests.** `npm ci && npm run typecheck && npm test && npm run build`. A failing test fails the build, so a broken version is never published, even if GitHub Actions is skipped.
- **Deploys are atomic.** Each deploy is an immutable snapshot. Rolling back means re-publishing an earlier deploy from the Netlify dashboard (Deploys → pick a deploy → Publish). It takes seconds and needs no rebuild.

### 1.2 Environments

| Context | Trigger | URL | Purpose |
|---|---|---|---|
| Local | `netlify dev` | `localhost:8888` | Development. Emulates functions and a sandboxed Blobs store |
| Deploy Preview | Pull request | `deploy-preview-N--<site>.netlify.app` | Review a change on real infrastructure before merging |
| Production | Merge to `main` | `<site>.netlify.app` | What customers and interviewers use |

**Environment variables (set per context in Netlify):**

| Variable | Production | Deploy Preview | Local (`.env`) |
|---|---|---|---|
| `LLM_API_KEY` | Real key | Real key, with a lower `LLM_DAILY_TOKEN_BUDGET` | Real key, or unset to use the mock |
| `LLM_DAILY_TOKEN_BUDGET` | e.g. 500k | e.g. 50k | — |
| `STAFF_TOKEN` | Strong random value | A different value | `dev` |
| `APP_TODAY` | `2026-10-06` | `2026-10-06` | `2026-10-06` |
| `APP_NOW` | unset | unset | optional, e.g. `2026-10-06T19:30+02:00` to demo out-of-hours |

**Trap 1: Blobs stores are shared across deploy contexts.** A site-wide Blobs store is visible to production and to deploy previews alike. Without care, a preview would write test conversations into the production handover queue.

**Fix:** `src/core/store.ts` prefixes every store name with the deploy context, e.g. `production-conversations` vs `deploy-preview-conversations`. [Day]

### 1.3 On the day

1. **[Day] Build minute 0–15:**
   - Deploy a skeleton: the chat page, `/api/health`, and one Blobs write.
   - This proves the Netlify setup, environment variables and Blobs before any features exist.
2. **[Day] Deploy after each milestone:** retrieval working, then verification, then handover, then allocation. Always keep a working production URL.
3. **[Day] Before the walkthrough:**
   - Run the smoke test against production.
   - **Lock auto-publishing** (Netlify: Deploys → Lock to stop auto publishing), so a stray push can't change the demo mid-walkthrough.
   - For a live change during the walkthrough, unlock, push, verify, then re-lock.
4. **Fallback:** if Netlify fails, run `netlify dev` locally, as the brief allows, and explain what went wrong.
5. **Fallback 2:** if the GitHub → Netlify integration misbehaves, deploy directly from the laptop with `netlify deploy --build --prod`.

---

## 2. CI/CD

### 2.1 Checks

| Check | Where | Catches | When |
|---|---|---|---|
| TypeScript typecheck (`tsc --noEmit`) | Netlify build + GitHub Actions | Type errors, including contract type mismatches | [Day] |
| Vitest: unit tests | Netlify build + GitHub Actions | Phone normalisation, verification, handover rules, agent hours (UTC vs Botswana), figure formatting | [Day] |
| Vitest: scripted conversations (LLM mocked) | Netlify build + GitHub Actions | End-to-end flows: verify → balance, 3 failures → handover, silence after handover, no figures before verification | [Day] |
| Vitest: contract validation | Netlify build + GitHub Actions | `data/generated/*.json` matches `src/core/contract.ts` and the schema version | [Day] |
| pytest | GitHub Actions | Cleaning rules, each `.sql` file against fixtures (O SEBEGO, duplicates, multi-loan phone) | [Day] (local), [Stretch] (CI) |
| `90_checks.sql` | During ingest | Bad data never reaches the contract | [Day] |
| **Contract drift check** | GitHub Actions | Re-runs the ingest in CI and diffs against the committed `data/generated/`. Fails if someone changed the scripts or source data without regenerating | [Stretch] |
| Shared phone fixtures | pytest + Vitest | The Python and TypeScript phone normalisers drifting apart | [Day] |
| Secret scan (gitleaks) | GitHub Actions | A committed API key | [Stretch] |
| Dependency audit (`npm audit`, `pip-audit`) | GitHub Actions | Known vulnerable packages | [Next] |
| Post-deploy smoke test | GitHub Actions, triggered by a successful Netlify deploy, or run by hand | The deployed site actually works: health, a policy answer with a citation, a failed verification, handover followed by silence | [Day] (manual), [Stretch] (automatic) |

The LLM is **mocked in all automated tests**, so they're deterministic and cost nothing against the spending limit. Only the smoke test makes a handful of real LLM calls.

### 2.2 GitHub Actions workflow (proposed shape)

```text
.github/workflows/ci.yml   on: pull_request, push to main
  job python   (ubuntu, Python 3.13): pip install -r scripts/requirements.txt → pytest → ingest --check (drift)
  job node     (ubuntu, Node 24):     npm ci → typecheck → lint → vitest → vite build
.github/workflows/smoke.yml  on: deployment_status (success) or manual dispatch
  job smoke: python scripts/smoke_test.py --url $DEPLOY_URL
```

**Prerequisite:** the project must be a git repository pushed to GitHub and linked to the Netlify site. **It isn't a git repository yet.**

---

## 3. Monitoring

### 3.1 What we watch

| Signal | Why it matters | Source | When |
|---|---|---|---|
| **Health**: `/api/health` returns the commit SHA, `schema_version`, `as_at`, data counts, and a Blobs read/write check | Confirms the right version and data are live | Health function | [Day] |
| **Turn latency** (p50/p95) and **LLM latency** | Customers abandon slow chats. The function limit is 60 s | Structured logs | [Day] (logged), [Stretch] (dashboard) |
| **LLM errors, timeouts and fallback replies** | Provider problems show up here first | Structured logs | [Day] |
| **LLM token spend vs budget** | The key has a hard spending limit. Running out means the assistant stops working | Token usage from the provider's responses, summed daily in Blobs | [Stretch] |
| **Handover rate by reason** | This is the business signal: a spike in "dispute" or "already paid" matters to Gaone | Audit log | [Stretch] |
| **Oldest open handover age** (during agent hours) | Customers are waiting for a human | Handover queue | [Stretch] |
| **Verification failure rate, per client IP** | The last 4 digits have only 10,000 combinations. Many new conversations from one IP means brute force | Audit log + logs | [Stretch] |
| **Function error rate and invocations** | Platform-level health | Netlify Observability (credit-based plans) and function logs | [Day] (dashboard exists) |
| **Uptime** | Is the site reachable at all? | External monitor (e.g. UptimeRobot or Better Stack free tier) on `/api/health` | [Stretch] |

### 3.2 How

- **Structured logs [Day].**
  - Each turn writes one JSON log line: `requestId`, `conversationId`, `state`, `intent`, `handoverReason`, `llmLatencyMs`, `tokens`, `outcome`, `error`.
  - **No personal information in logs:** no phone numbers, ID digits or figures. The audit log in Blobs holds the details, masked.
  - Logs are readable in the Netlify dashboard's function logs, which keep up to 7 days depending on plan.
  - [Next] Log drains to Datadog, Axiom and similar are an Enterprise-plan feature.
- **Staff dashboard tab [Stretch].**
  - Shows today's turns, handover rate by reason, verification failures, LLM p95 and errors, spend against budget, oldest open handover, and the allocation counts from `manifest.json`.
  - These are the "service-level dashboards" the job ad describes.
- **Scheduled checker [Stretch].**
  - A Netlify scheduled function runs every 15 min.
  - It checks the thresholds below and posts to a Slack or email webhook.
  - Scheduled functions run on UTC cron schedules, have a 30 s limit, and only run on the published production deploy.
  - Because it runs inside Netlify it can't detect Netlify itself being down. That's what the external uptime monitor is for.
- **Error tracking [Next]:** Sentry (free tier) for browser and function exceptions.

### 3.3 Proposed SLOs and alerts

| SLO / alert | Target / threshold |
|---|---|
| Turn latency | 95% of turns answered in under 8 s |
| LLM errors | Alert if more than 5% of turns in 15 min fall back |
| Spend | Alert at 70% of the daily budget. Degrade automatically at 90% (see §4) |
| Handover backlog | Alert if an open handover is older than 30 min during agent hours |
| Verification abuse | Alert if one IP has more than 10 failed verifications in an hour |
| Uptime | Alert if `/api/health` fails 2 checks in a row |
| **Correctness (by design, not monitored)** | 0 figures produced by the LLM. Enforced by structured messages and covered by tests |

### 3.4 Graceful degradation (kill switch)

**Assistant modes:**
- `normal`: everything works as designed.
- `degraded`: no generation by the LLM. Policy answers show the retrieved policy section verbatim, with its citation. Account answers still work, because they never needed the LLM.
- `handover_only`: every conversation goes straight to the queue with a polite message.

**How the mode is set:**
- **Manually:** the mode is stored in Blobs and switched from the staff page, so it takes effect immediately with no redeploy.
- **Automatically:** at 90% of the token budget, or during a sustained LLM outage.

---

## 4. Security operations

- **[Day]** Secrets live only in Netlify environment variables and in a local `.env`, which is git-ignored.
- **[Stretch]** Rate-limit verification per client IP, not only per conversation. Without it, someone can open a new conversation to reset the 3-attempt limit.
- **[Next]** Rotate `STAFF_TOKEN` and `LLM_API_KEY`: update the Netlify variable, redeploy, verify with the smoke test.
- **[Next]** Replace the shared staff token with proper staff login.

## 5. Backup and restore

The data that matters here is the audit log, the handover queue and the conversations.

- **[Next]** A nightly scheduled function writes a dated snapshot of these Blobs stores to a `backups-YYYY-MM-DD` store.
- **[Next]** A restore script, **tested** by restoring a snapshot into a deploy-preview namespace and comparing record counts. A backup that has never been restored doesn't count.
- The reference data (`data/generated/`) is already backed up by git.

---

## 6. Tooling: Docker and the job ad's stack

### 6.1 Docker

**Production doesn't use Docker.** Netlify runs static files and serverless functions, and there is no container to ship. Forcing Docker into the Netlify path would add risk for no gain.

Docker is useful **around** the deployment:

| Use | What | Value | When |
|---|---|---|---|
| **Reproducible ingest** | `scripts/Dockerfile`: `python:3.13-slim` + pinned `requirements.txt` + the DuckDB CLI. Run with `docker run --rm -v "$PWD":/work kopano-ingest` | The ingest runs identically on any laptop and in CI, and avoids slow or broken local `pip` installs. CI's Python job can use the same image | [Stretch] |
| **Local observability stack** | `ops/docker-compose.observability.yml`: Prometheus scraping the deployed `/api/metrics`, Grafana with a provisioned SLO dashboard, and an OpenTelemetry Collector with Jaeger receiving traces from `netlify dev` | A real Grafana/Prometheus/OTel demo without paying for hosted tools | [Stretch] / [Next] |
| **Portability / plan B hosting** | `Dockerfile` for the runtime: a small Node HTTP adapter serving the same handlers. They already use the standard `Request`/`Response` API, so the adapter is short | Can run on Fly.io, Render or a VM if Netlify isn't an option. This is also where long-running workers (e.g. BullMQ) would live | [Next] |
| **Local Postgres** | `postgres` container for developing a Supabase or Netlify Database migration | Test migrations locally before touching hosted data | [Next] |

### 6.2 Tools from the job ad

| Job ad tool | Where it fits in this project | When |
|---|---|---|
| **TypeScript** | All runtime code: functions, pages, core logic | [Day] |
| **Python** | Offline ingest, KB chunking, smoke test | [Day] |
| **SQL** (joins, filters, aggregates) | DuckDB allocation, summaries and data-quality checks (ARCHITECTURE §4.2) | [Day] |
| **HTTP** | The `/api/*` design, status codes, timeouts, and the staff token header | [Day] |
| **Git** (branches, PRs, conflicts) | A feature branch and PR per milestone, even working solo. PRs trigger deploy previews | [Day] (needs `git init` first) |
| **Third-party API failure modes** | The LLM wrapper: timeouts, one retry with backoff, 429 and 5xx handling, fallback replies, degraded mode (§3.4) | [Day] |
| **CI/CD** | GitHub Actions + Netlify build gate + smoke test (§2) | [Day] / [Stretch] |
| **Technical documentation / runbooks** | `docs/`, including the runbooks in §7 | [Day] |
| **Monitoring, alerting, SLO dashboards** | §3 | [Day] / [Stretch] |
| **Backup and restore testing** | §5 | [Next] |
| **OpenTelemetry** | Add traces by hand: one span per turn, with child spans for retrieval, the LLM call and Blobs writes. Export via OTLP/HTTP to Grafana Cloud's free tier, or to the local collector. **Flush spans before the function returns**, or they are lost when the function instance is frozen | [Stretch] |
| **Prometheus** | Serverless functions have no long-lived process to scrape. Instead, `/api/metrics` (token-protected) serves Prometheus-format counters calculated from the daily aggregates in Blobs, and a Prometheus instance (in Docker, or Grafana Cloud) scrapes that | [Stretch] |
| **Grafana** | Dashboard for the SLOs in §3.3 (latency, LLM errors, spend, handover backlog, verification failures) | [Stretch] |
| **Redis** | **Upstash Redis** (HTTP-based, works from serverless functions) for per-IP verification rate limits and spend counters. Its atomic `INCR` fixes a real gap: Blobs is last-write-wins, so simultaneous turns can lose counts | [Next] |
| **BullMQ** | Needs a long-running worker and a TCP connection to Redis, so it **doesn't fit Netlify**. With the Docker plan B host, it would handle handover notification jobs (SMS or email to agents, with retries) | [Next] |
| **Supabase** | Postgres for the audit log and handovers, with **migrations**. **Supabase Auth** for proper staff login, replacing `STAFF_TOKEN`. Row Level Security so staff only see their branch. An alternative to Netlify Database | [Next] |
| **Docker** | §6.1 | [Stretch] / [Next] |

**Local tooling found on 2026-09-29:** Docker 29.7, Git 2.54, Node 24.12, npm 11.6, Python 3.13. **Not installed:** the Netlify CLI (`npm i -g netlify-cli`) and the GitHub CLI (`gh`).

## 7. Runbooks

### R1: The assistant is replying "Sorry, I'm having trouble" (LLM failing)
1. Check `/api/health` and the function logs for `error` values. Is it a timeout, a 401 (bad key), a 429 (rate limit) or a 5xx (provider down)?
2. **401:** check `LLM_API_KEY` in Netlify for the correct context, then redeploy.
3. **429 or spend limit reached:** switch to `degraded` mode from the staff page and tell the team.
4. **Provider down:** switch to `degraded` mode. Account answers keep working.
5. Once fixed, switch back to `normal` and run the smoke test.

### R2: A bad deploy is live
1. Netlify → Deploys → select the last known-good deploy → **Publish deploy**.
2. Lock auto-publishing until the fix is merged.
3. Run the smoke test against production.
4. Record the incident in the CHANGELOG.

### R3: The data needs refreshing (new loan book or payments extract)
1. Replace `kopano_data.xlsx`.
2. Run `python scripts/ingest.py`. If `90_checks.sql` fails, **stop**: read the failing rows and fix the cleaning rules or query the data owner.
3. Review the git diff of `data/generated/` and the allocation summary.
4. Commit, open a PR, check the deploy preview, then merge.

### R4: A customer says the assistant gave them a wrong figure
1. Find the conversation in the staff page's audit tab.
2. The audit record shows which data rows and `allocations.json` entries the figure came from.
3. If the data is wrong, go to R3. If the rendering is wrong, write a failing test, fix it and deploy.
4. Log the outcome for the customer service team.

### R5: A spike in failed verifications
1. Check the audit log and logs by client IP.
2. If one source is responsible, block it (a Netlify firewall rule, if the plan allows it, or an application-level blocklist in Blobs).
3. Tell Kopano: a possible attempt to take over customers' accounts.
