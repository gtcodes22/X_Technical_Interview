# Kopano Customer Assistant

An AI chat assistant for **Kopano Microfinance** that answers borrowers' routine questions around the clock (policies, how to pay, balances, due dates) and hands the conversation to a human agent whenever Kopano's own rules say it should. Agents reply in the same chat and hand back to the assistant when done.

- **Live:** https://kopano-customer-assistant.netlify.app — customer chat
- **Staff page:** https://kopano-customer-assistant.netlify.app/staff.html — handover queue and Agent view (needs the staff token)
- **Built for:** Xavier Africa technical assessment, Junior Developer — Operations. Simulated "today": **Tuesday 6 October 2026**.

Deeper documentation lives in [`docs/`](docs/): [task and findings](docs/README.md) · [architecture](docs/ARCHITECTURE.md) · [roadmap](docs/ROADMAP.md) · [operations and runbooks](docs/OPERATIONS.md) · [changelog](docs/CHANGELOG.md) · [conventions](docs/AGENTS.md) · [ideas](docs/IDEAS.md).

## What it does

| Requirement | How |
|---|---|
| Chat interface | Mobile-first web page with structured messages: text, source chips, a verification form, an account card and a handover banner |
| Policy answers with sources | Keyword search (MiniSearch) over 43 knowledge-base sections. The LLM answers **only** from the retrieved extracts and names the document. The superseded 2023 penalty rules are never indexed |
| Identity verification | Registered mobile number + last 4 digits of ID, both on the **same** loan. Checked in code and **never sent to the LLM**; masked in every transcript and log. Three failures hand over to an agent |
| Account answers from data | Next payment date and amount, and outstanding balance, rendered by code from the loan book. Always shown "as at 30 Sep 2026" |
| Human handover | Kopano's transfer rules are applied as keyword rules before the LLM, plus LLM judgement. The chat goes to a staff queue with transcript, loan details and reason, and **the bot stays silent** while a human is responsible |
| **Extension: Payment allocation** | Payments received 1–5 Oct are matched to loans with SQL (DuckDB). Confidently matched payments show as "received, not yet reflected". Doubtful ones (e.g. an EFT from O SEBEGO referencing someone else's loan) go to staff as "possible payments" |
| **Extension: Agent view** | Agents claim a chat, reply in the same chat, and "Return to assistant". Added at the client's request |
| **Extension: Tests** | 35 Vitest tests (including scripted conversations with a mocked LLM) + 24 pytest tests. The Netlify build fails if any test fails |
| **Extension: Audit log** | Every turn records what was said, to whom, on what basis (sources, loan rows, handover rule), and every agent action. Viewable on the staff page |

## Run it locally

Prerequisites: Node 24+, Python 3.13 (only for re-running the data ingest), and the Netlify CLI (`npm i -g netlify-cli`).

```bash
npm install
cp .env.example .env          # fill in LLM_API_KEY; LLM_PROVIDER=openai, LLM_MODEL=gpt-4.1-mini
npm test                      # 35 tests, LLM mocked, no API calls
netlify dev                   # http://localhost:8888 (chat) and /staff.html (token: value of STAFF_TOKEN, default "dev")
```

Optional live check against the real LLM: `LIVE=1 npx vitest run tests/live.test.ts`.

### Regenerating the data (only if the spreadsheet or knowledge base changes)

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r scripts/requirements.txt   # .venv/bin/... on Linux/macOS
.venv/Scripts/python scripts/ingest.py      # stops if any SQL data-quality check fails
.venv/Scripts/python -m pytest -q scripts/tests
```

The output in `data/generated/` is committed. It is the **contract** between the Python pipeline and the TypeScript app.

## Deploy it

Netlify, connected to this GitHub repo. Every push to `main` builds and deploys. Pull requests get deploy previews.

1. Netlify → **Import a Git repository** → this repo, branch `main`. Build settings come from `netlify.toml`: `npm run ci:build` (typecheck → tests → build), publish `dist/` only.
2. **Environment variables:**
   - secret: `LLM_API_KEY`, `STAFF_TOKEN`
   - plain: `LLM_PROVIDER=openai`, `LLM_MODEL=gpt-4.1-mini`, `APP_TODAY=2026-10-06`
3. Trigger a deploy. Check `/api/health` shows `"status":"ok"`.
4. **Visitor access:** new Netlify projects may be protected by a login. Turn it off under *Project configuration → Access & security → Visitor access* before sharing the link.

Rollback: Netlify → Deploys → pick the last good deploy → **Publish deploy**. More in [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Design decisions

- **The LLM talks; code decides.** The model classifies intent and phrases policy answers. Verification, data access, every figure and handover rules are plain code with tests. The model never produces a number.
- **Rules before the model.** Obvious handover cases (asks for a person, dispute, "already paid", hardship, payment holiday, fraud) never depend on the LLM.
- **Offline Python + SQL, online TypeScript.** Messy data cleaning and payment matching run once in Python/DuckDB, where they can be inspected and tested. Their JSON output is committed and bundled. Netlify never runs Python.
- **Conservative payment allocation.** Only payments whose reference *and* payer name fit the loan are counted. Everything else goes to a human, because telling someone they've paid when they haven't is worse than saying nothing.
- **One storage key per message** in Netlify Blobs. It's last-write-wins, so the customer and the agent writing at once must not overwrite each other.
- **Store names prefixed by deploy context**, so preview deploys never touch production conversations.
- **Session rules (client decision):** 60 min maximum or 5 min idle while the bot is in control. Timers pause during handover. Verification lasts the whole session.
- **LLM failures fail safe.** 20 s timeout and one retry, then an apology plus the option of an agent. Account answers keep working because they don't need the LLM.

## Known limitations

- **Figures are as at 30 Sep 2026.** Only confidently matched later payments are reflected. Penalties that may have accrued since the export (e.g. loans that passed the grace period after 30 Sep) are not recalculated.
- **Staff access is one shared token.** The agent's name is self-declared. There is no per-agent login.
- **Two agents pressing Claim at the same instant** could both succeed, because Blobs has no compare-and-swap. This is unlikely with four agents.
- **Updates use polling** (3 s customer / 3–10 s staff), not push.
- **Handover keyword rules can over-trigger**, e.g. a customer mentioning "an agent" in passing. That is the safe direction. Classification is English only.
- **Redaction removes any 4-digit group** from text sent to the LLM (to catch ID digits), which can also remove years or amounts.
- **Agent hours ignore public holidays.**
- **Not built:** per-IP verification rate limiting (a new chat resets the 3-attempt count), `LLM_DAILY_TOKEN_BUDGET` enforcement, degraded-mode switch, early-settlement / penalty calculations (Combined answers), Setswana.
- **Unconfirmed policy detail:** whether the P75 returned-payment fee (2023 document) still applies. It is currently answerable.
- **Data location:** Netlify Functions and Blobs run in the US by default. That's acceptable for a demo, but not for real customer data without review.

## What I would do next

1. Per-IP rate limiting on verification, and enforcing the daily LLM token budget with an automatic degraded mode.
2. Proper staff login (e.g. Supabase Auth) and atomic claims (Postgres or Redis).
3. Combined answers: a settlement quote (balance × 0.95) and penalty explanations computed in code.
4. Recalculate arrears and penalties as of today from the policy rules, not only the export.
5. GitHub Actions CI (pytest, contract drift check, secret scan) and a post-deploy smoke test.
6. Monitoring: handover backlog and time-to-claim alerts, LLM error/latency dashboards (see OPERATIONS.md).
7. Botswana public holidays in agent hours and due-date logic. Setswana support.
