# Kopano Customer Assistant

**Live demo: https://kopano-customer-assistant.netlify.app/** · Staff page: [/staff.html](https://kopano-customer-assistant.netlify.app/staff.html)

An AI chat assistant for Kopano Microfinance, a micro lender in Botswana. It answers borrowers' routine questions around the clock (policies, how to pay, balances, due dates) and hands the chat to a human agent whenever Kopano's own rules say it should. The agent replies in the same chat, then hands back to the assistant.

> Built as a timed technical assessment for Xavier Africa (Junior Developer — Operations). Brief, timeline and client Q&A: [Job_Info/TECHNICAL_INTERVIEW_INFO.md](Job_Info/TECHNICAL_INTERVIEW_INFO.md).

## Features

- **Policy answers with sources.** The assistant answers only from Kopano's documents and shows which one. Superseded policy is never quoted.
- **Identity verification.** Mobile number + last 4 ID digits, checked in code, never sent to the LLM, masked in all logs. Three failures go to an agent.
- **Account answers from data only.** Next payment and balance come from the loan book. The model never produces a figure.
- **Human handover.** Kopano's transfer rules run before the LLM. The bot stays silent while an agent handles the chat.
- **Payment allocation.** Recent payments are matched to loans with SQL. Doubtful ones go to staff for review.
- **Agent view:** claim, reply and return to assistant. **Audit log:** what was said, to whom, on what basis. **Tests:** 35 Vitest + 24 pytest, and they gate every deploy.

## Stack

TypeScript (Vite, Netlify Functions, Netlify Blobs, MiniSearch, Vitest) · OpenAI `gpt-4.1-mini` · offline data pipeline in Python + DuckDB SQL.

## Run locally

```bash
npm install
cp .env.example .env     # set LLM_API_KEY; LLM_PROVIDER=openai; LLM_MODEL=gpt-4.1-mini
npm test
netlify dev              # http://localhost:8888  (staff token: "dev")
```

To regenerate data after changing the spreadsheet or knowledge base: `python scripts/ingest.py`. See [docs/ROADMAP.md](docs/ROADMAP.md#running-what-exists-so-far).

## Deploy

Every push to `main` deploys on Netlify. Build settings come from `netlify.toml`: the build runs the tests and publishes `dist/` only.
- **Environment variables:** `LLM_API_KEY`, `STAFF_TOKEN` (secret), `LLM_PROVIDER`, `LLM_MODEL`, `APP_TODAY=2026-10-06`.
- **Rollback and runbooks:** [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Design decisions

- **The LLM talks; code decides.** Verification, data access, figures and handover rules are plain, tested code.
- **Offline Python + SQL, online TypeScript.** Messy data is cleaned and matched once. The JSON output is the contract.
- **Conservative payment allocation.** A payment counts only when the reference and payer name both fit the loan.
- **One storage key per message.** The agent and the customer can't overwrite each other.
- **LLM failures fail safe.** Account answers don't depend on the LLM.

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Known limitations

- Figures are as at 30 Sep 2026. Penalties since then are not recalculated.
- Staff access uses one shared token, with self-declared agent names.
- Updates arrive by polling, not push.
- No per-IP limit on verification attempts, and no enforcement of the LLM token budget.
- Agent hours ignore public holidays. English only.
- Hosted in Netlify's default US region.

## Next steps

Rate limiting and a spend guard · proper staff login with atomic claims (Supabase or Postgres) · settlement and penalty calculations in code · CI with a post-deploy smoke test · monitoring alerts · Setswana.

More documentation: [docs/](docs/README.md).
