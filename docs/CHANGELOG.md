# Changelog

All notable changes to this project are recorded here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Each entry should say **what** changed and **why**, so a reviewer can check the reasoning without asking. Use these headings as needed: `Added`, `Changed`, `Decided`, `Fixed`, `Removed`, `Security`.

Dates are real calendar dates. The assessment's simulated "today" (6 Oct 2026) is a separate, fixed value used only by the application.

## [Unreleased]

### M7 — Staff page + Agent view — 2026-09-29
- `src/core/agent.ts`: `claim` (refused with 409 if another agent holds the chat), `reply` (claiming agent only), `returnToAssistant` (state back to `VERIFIED`/`ANONYMOUS`, session timers restart, internal note to audit only).
- `netlify/functions/handovers.ts`: staff API behind `x-staff-token` — queue, detail (transcript, loans with masked phone and **no ID digits**, payment candidates, audit), claim/reply/return.
- `staff.html`/`staff.ts`: sign-in with token + agent name (sessionStorage), queue polled every 10 s (waiting first), detail polled every 3 s (paused while typing), audit log panel.
- Test: full round trip handover → claim → second agent refused → reply → return → bot answers again with verification kept (35 tests).

### M3–M6 — Chat, policy answers, verification, handover — 2026-09-29
- **M3** `orchestrator.ts` state machine, `/api/chat`, `/api/conversation/:id` (reload + polling), chat page (structured messages rendered with `textContent`, verify form, account card, source chips, handover banner, error + retry, new-chat on close), `runtime.ts` wiring.
- **M4** `llm.ts` (OpenAI via fetch, 20 s timeout, one retry, `LlmError` → safe fallback reply; keyword fallback for intent), `retrieval.ts` (MiniSearch, superseded chunks never indexed), answers only from retrieved extracts with `SOURCES:` → source chips; `NO_ANSWER` → handover.
- **M5** `account.ts`: verification requires phone + last 4 on the same loan; multi-loan borrowers see all loans; account card figures from `loans.json`, arrears shown as "overdue since", matched payments shown as "received, not yet reflected"; 3 failures → handover; verification inputs masked everywhere.
- **M6** `handover-rules.ts` (agent request, complaint/upset, dispute/"already paid", hardship, payment holiday/restructure/top-up, fraud) run before the LLM; handover entry with payment candidates for "already paid"; agent-hours-aware notice; bot silent in `HANDED_OVER`/`WITH_AGENT`; sessions close after 60 min / 5 min idle while the bot is in control.
- Tests: 34 passing (scripted conversations with mocked LLM). Live check with `gpt-4.1-mini` (`LIVE=1 npx vitest run tests/live.test.ts`): MyZaka steps cited from How to Pay; late payment answered from v3.0 only.
- **Note:** M3–M6 were built in one pass under time pressure and committed per milestone by file group; the individual intermediate commits are not each independently buildable — the M6 commit is.

### M2 — Runtime foundations — 2026-09-29
- `src/core/contract.ts`: types and loader for `data/generated/`, which refuses an unknown schema major version.
- `src/core/phone.ts`: tested against the same fixtures as the Python version.
- `src/core/conversation-store.ts`:
  - Blobs implementation with one key per message plus `meta`, handover and audit stores, and an in-memory twin for tests.
- `src/core/hours.ts`: agent hours in Botswana time, and "next available" (public holidays not yet modelled).
- `src/core/masking.ts`: masking of phones and ID digits, and redaction of free text before storage or the LLM.
- 26 Vitest tests.
- **LLM model chosen:** `gpt-4.1-mini` (OpenAI), for low latency and cost. Set as `LLM_MODEL`.
- AGENTS.md: added the "write for the next reader" readability convention.

### M1 — Data pipeline — 2026-09-29
- `scripts/ingest.py` + `scripts/kopano/` (cleaning, KB chunking) + `scripts/sql/01–05, 90`. Output: `data/generated/` (150 loans, 32 payments, 43 KB chunks, manifest). Pinned `scripts/requirements.txt`; pytest on the shared phone fixtures, references, amounts and dates (24 tests).
- **Allocation result:** 17 matched (P48,580.57), 7 needs review, 4 duplicates, 4 unmatched. O SEBEGO → KM-L-0078 is `needs_review`.
- **Changed:** the name check accepts the surname **or first name + surname initial**. **Why:** the first run flagged obvious owners like "KEITUMETSE M" (Keitumetse Modise) for review. O SEBEGO → Masego Phiri still fails, as intended.
- **Known limitation:** PDF heading detection is heuristic. Some PDF sections, e.g. late-payment "Credit bureau reporting", are merged into the previous chunk. The text is still retrievable, but the section label is less precise.

### M0 — Scaffold — 2026-09-29
- Vite pages, TypeScript 7, Vitest, `netlify.toml` (publishes `dist/` only; `ci:build` runs typecheck and tests before building), `/api/health`, context-prefixed Blobs store names, config (`APP_TODAY`, `APP_NOW`), `.gitignore`, `.gitattributes`, `.env.example`.
- **Why `dist/` only:** connecting the repo without it would have published `kopano_data.xlsx` (customer details) at a public URL.
- **Why build-info.json:** `COMMIT_REF` exists only at build time, not in functions at runtime, so the build writes it to a file.
- Added `docs/ROADMAP.md` (milestones M0–M8 with status).

### Decided — 2026-09-29 (client answer: handover round trip, sessions)
- **Client (Gaone), question 9:**
  - Agents reply **in the same chat** and **hand back to the bot** when done. The bot is paused meanwhile.
  - Sessions last 60 min maximum, or close after 5 min idle.
  - Unverified customers are handed over straight away, with no contact details needed.
- **Our interpretation, confirmed by the user:**
  - Session timers **pause** during `HANDED_OVER` and `WITH_AGENT`.
  - Verification lasts **the whole session**.
  - Outside hours, the handover stays queued, and the customer can return on the same device.
- **D5 revised: Agent view added (simplest form: claim, reply, return).** Payment allocation is kept. **Why:** the client asked for it, and it closes D10. It's kept minimal to protect the 2-hour budget.
- **D10 and D11 decided.** New states `WITH_AGENT` and `CLOSED`. Returning a chat resumes `VERIFIED` or `ANONYMOUS`.
  - **Why this meets the brief:** the bot is silent for the whole time a human is responsible, and only a human can hand it back.
- **Storage change:** one Blobs key per message, plus a separate `meta` key per conversation.
  - **Why:** Blobs is last-write-wins. With the customer and the agent writing at once, storing the conversation as one blob would lose messages.
  - The residual race when two agents claim at the same instant is documented.
- **New endpoints:** `POST /api/handovers/:id/claim`, `/reply`, `/return`, and polling via `GET /api/conversation/:id?after=`. The customer page polls every 3 s during handover.
- **Docs updated:**
  - ARCHITECTURE: §2, §3.1, §3.2, §5 (states and session rules), §5.1, §5.2, §7, §9, §11, §12.
  - README §2 and question 9.
  - AGENTS rule 5.
  - OPERATIONS: time to claim, stuck-with-agent alert, polling load.
  - Diagrams updated and re-rendered.
- **Replaced:** the earlier "15 min idle re-verification" rule, which the client's session rule supersedes.

### Added — 2026-09-29 (diagrams)
- `docs/diagrams/`: Mermaid sources plus rendered SVGs for three views:
  - **Full system** (`system`): offline pipeline, contract, CI, Netlify and external services.
  - **One chat turn** (`turn-sequence`): the verification path.
  - **Conversation states** (`conversation-states`).
- They replace the outdated ASCII diagram in ARCHITECTURE §2 (§2.1–2.3).
- **Why:** Checkpoint 2 asks for an architecture diagram. Mermaid sources are versioned, diffable and render on GitHub. The SVGs render anywhere.

### Added — 2026-09-29 (tooling)
- OPERATIONS §6, tooling:
  - **Docker is kept out of the Netlify production path.** Proposed uses: a reproducible Python ingest image, a local Prometheus/Grafana/OpenTelemetry stack, a portable runtime image as a plan B host, and local Postgres.
  - A map from every tool in the job ad to where it fits, tagged [Day], [Stretch] or [Next].
- **Notable reasoning:**
  - **Prometheus** can't scrape serverless functions, so the plan is a `/api/metrics` endpoint built from aggregates in Blobs.
  - **OpenTelemetry spans must be flushed** before a function returns.
  - **BullMQ** needs a long-running worker, so it's incompatible with Netlify.
  - **Redis (Upstash)** fixes lost counter updates in Blobs, which is last-write-wins.
  - **Supabase Auth** is the path to proper staff login.
- Recorded local tooling: Netlify CLI and `gh` are not installed.
- Runbooks renumbered from OPERATIONS §6 to §7.

### Added — 2026-09-29 (operations)
- New `docs/OPERATIONS.md`, with each item tagged [Day], [Stretch] or [Next]:
  - **Deployment:** GitHub → Netlify, deploy previews on PRs, atomic deploys with one-click rollback, and per-context environment variables.
  - **CI/CD:** typecheck, Vitest (unit, mocked conversations, contract validation), pytest, contract drift check, secret scan, post-deploy smoke test.
  - **Monitoring:** `/api/health`, structured logs without personal data, latency, LLM errors and spend, handover backlog, verification abuse, and an external uptime monitor. Proposed SLOs and alerts.
  - **Graceful degradation:** `normal` / `degraded` / `handover_only` modes, switchable from the staff page.
  - **Security operations**, backup and restore (with restore testing), and runbooks R1–R5.
- **Key decisions and why:**
  - **The Netlify build command runs typecheck and tests,** so a broken build can never publish even without GitHub Actions.
  - **Blobs store names are prefixed with the deploy context.** Site-wide stores are shared across contexts, so previews would otherwise pollute the production handover queue.
  - **Lock auto-publishing during the walkthrough,** so a stray push can't change the demo.
  - **Rate-limit verification per IP [Stretch].** The 3-attempt limit is per conversation and can be reset by starting a new chat.
- Added `/api/health` to ARCHITECTURE §3.1, and OPERATIONS.md to the README documentation map.

### Added — 2026-09-29 (chat interface design)
- ARCHITECTURE §5.1, customer chat page:
  - Vite with vanilla TypeScript, aiming for under 50 KB, mobile-first.
  - Layout mock-up and the six message types (`text`, `sources`, `account_card`, `verify_form`, `handover_notice`, `error`).
  - The API shape, how the conversation survives a refresh, the 30 s timeout and Retry, a 15-minute idle expiry on verification, behaviour after handover, and accessibility.
  - **Why structured messages:** figures and citations are rendered by code from server data, never from free-form model text.
- ARCHITECTURE §5.2, staff page:
  - Token-gated, read-only queue with 10 s polling.
  - A detail view that includes payment candidates, and an audit tab.
- Message routing: **verification details go through a dedicated form action and never reach the LLM.** If typed into the chat box, they are pattern-matched and removed. They are always stored masked.
- New open decision D10 and README question 9: how agents respond to handed-over customers without Agent view.

### Fixed — 2026-09-29
- ARCHITECTURE §5 routing and §8 still referred to runtime SQL and `_bwp` fields. They now say lookups over `loans.json` and `allocations.json`, with `_thebe` fields.
- ARCHITECTURE §4.2 (SQL stage) had been placed before §4.1 and is now after it.

### Decided — 2026-09-29 (SQL in the workflow)
- **DuckDB SQL inside the Python ingest (D9, decided).**
  - Cleaned loans and payments are loaded into an in-memory DuckDB database.
  - The SQL files in `scripts/sql/` then find duplicates (window function), match payments to loans (reference join with a surname check, then phone fallback for review only), summarise the results (aggregates), and run data-quality checks.
  - `90_checks.sql` fails the ingest if any check returns rows.
  - **Why:** payment allocation is a join-and-deduplicate problem, so SQL is the clearest and most reviewable tool. It also shows the SQL skills the job ad asks for, without adding deployment risk. The runtime stays JSON + Blobs.
- **Allocation statuses proposed:** `matched`, `needs_review`, `duplicate`, `unmatched`.
  - Only `matched` payments change what a customer sees.
  - The O SEBEGO → KM-L-0078 case becomes `needs_review` via the name check.
  - Proposed answer to D8; still to be confirmed with the client.
- Added ARCHITECTURE §4.2 (SQL stage, rules table, illustrative SQL, tests), the pipeline diagram in §4, `duckdb` and `scripts/sql/` in the §3.4 layout, a stack table row, and the updated Payment allocation design in §9.

### Decided — 2026-09-29 (language split)
- **Python for offline scripts, TypeScript for everything deployed (D1, decided).**
  - Python covers `scripts/`: ingest, KB chunking, payment allocation and a smoke test.
  - TypeScript covers the Netlify Functions, the web pages and the runtime tests.
  - **Why:** pandas handles the messy data best. Netlify Functions don't run Python. Keeping Python offline means no Python on Netlify.
- **The JSON files in `data/generated/` are the contract between the two languages** (ARCHITECTURE §4.1):
  - A schema version lives in `manifest.json`, and a major-version mismatch stops the runtime from starting.
  - Money is stored as integer thebe with a `_thebe` suffix, field names are snake_case, and dates are ISO format.
  - The TypeScript types for the contract live in `src/core/contract.ts` and are checked by Vitest.
  - Phone normalisation exists in both languages and is tested against a shared `data/contract/phone-cases.json`.
- Updated ARCHITECTURE §2 (diagram and account service no longer mention SQL), §3 (stack table), §3.4 (repository layout), §4 (data loading), and added §4.1 (contract, schema v1.0 proposed).
- Updated AGENTS.md with rules for the contract.

### Decided — 2026-09-29 (tech stack)
- **Hosting: Netlify (D4, decided).** Chosen for easy deployment.
- **Proposed stack:**
  - TypeScript throughout.
  - Vite multi-page frontend (chat page, staff page).
  - Netlify Functions for `/api/*`.
  - Bundled JSON for read-only data.
  - Netlify Blobs for conversations, the handover queue and the audit log.
  - BM25 retrieval (MiniSearch).
  - Vitest for tests.
  - See ARCHITECTURE §3.
  - **Why:** the fewest moving parts that still fit Netlify's serverless model. There's no filesystem to write to, so mutable state can't live in SQLite.
- **Data ingest moves to a local script** (`scripts/ingest.ts`) that writes committed JSON, including payment allocation results.
  - **Why:** messy parsing happens once and can be inspected, and the Netlify build stays trivial.
- **Netlify concerns recorded** (ARCHITECTURE §3.3):
  - UTC vs Botswana time for agent hours.
  - Simulated date set by env var.
  - LLM timeout within the 60 s function limit.
  - Cold starts.
  - Secrets.
  - US data region.
  - Staff token.
- ARCHITECTURE §3.2 compares Netlify Blobs with Netlify Database (managed Postgres, credit-based plans only).

### Decided — 2026-09-29
- **Extensions (D5): Tests, Audit log, Payment allocation (conservative version).**
  - **Why Payment allocation:** it is the only extension that addresses the client's headline complaint (customers chased after paying). The Payments sheet is clearly built to test it.
  - **Why Tests:** they protect verification and handover logic cheaply, especially when interviewers change something live.
  - **Why Audit log:** it's cheap, and a regulated lender needs a record of what was said and why.
  - **Staff mode dropped:** letting the model write SQL risks wrong figures and data exposure, and it isn't among the client's stated problems.
  - **Agent view dropped:** low value, and the core queue already shows the transcript.
  - **Combined answers:** stretch goal only.
  - Updated README §2 and ARCHITECTURE §11.

### Added — 2026-09-29
- `docs/` folder with `README.md`, `ARCHITECTURE.md`, `AGENTS.md`, `CHANGELOG.md` and `IDEAS.md`.
  - **Why:** so anyone in the organisation can understand the task, check the logic and take over the project.
- README: task overview, core requirements, extensions, timeline, goals, a summary of the inputs and knowledge base, handover triggers, and questions for the client.
- README §6, main concerns found during discovery:
  - Conflicting late-payment policies (v2.1 vs v3.0). The loan book's penalties match v3.0.
  - Loan book is stale (as at 30 Sep); 32 unallocated payments from 1–5 Oct.
  - Messy payment references, amounts, dates and phone formats; likely duplicate payments; a suspected mis-referenced EFT (O SEBEGO → `KML 0078`).
  - Verification edge cases: phone normalisation, and a borrower with two loans (KB-10078).
  - Spreadsheet quirks: SQL formulas in column V, a stray formula row, Excel date serials.
  - Collections conduct breaking policy in the contact history (Sunday contact, repeat same-day contact, chasing after "already paid" and during disputes).
- ARCHITECTURE: **proposed** design (components, data loading, conversation state machine, retrieval, handover, account answers, extension sketches, security), open decisions D1–D8, and the definition of done.
- AGENTS: non-negotiable rules and working conventions for people and AI tools working on the code.
- IDEAS: idea backlog, seeded with ideas from discovery.
