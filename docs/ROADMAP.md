# Roadmap

The build is split into milestones. **Each milestone ends with at least one commit** (message prefix `feat(mN):`) and something working. Status is updated here as each one lands; details of what changed are in [CHANGELOG.md](CHANGELOG.md).

| # | Milestone | Delivers | Status |
|---|---|---|---|
| M0 | Scaffold and first deploy | Vite (chat + staff pages), TypeScript, Vitest, `netlify.toml` (publishes `dist/` only, tests gate the build), `/api/health` with a Blobs check, context-prefixed store names, `.env` handling | ✅ Done |
| M1 | Data pipeline (Python + SQL) | `scripts/ingest.py`: cleaning (phones, references, amounts, dates), DuckDB SQL (duplicates, reference match with name check, phone fallback, allocations, summary, data-quality checks), KB chunking with superseded tags, `data/generated/` contract + manifest, pytest | ✅ Done |
| M2 | Runtime foundations (TypeScript) | Contract types + loader + validation test, `phone.ts` on the shared fixtures, conversation store (one key per message + `meta`), agent hours in Botswana time, audit writer | ⏳ Next |
| M3 | Chat end to end (no LLM) | `/api/chat` state machine, `/api/conversation/:id`, chat page rendering all message types, audit per turn | ☐ |
| M4 | Policy answers | LLM adapter (timeout, retry, fallback, mock), MiniSearch retrieval excluding superseded policy, answers with source chips | ☐ |
| M5 | Verification + account answers | Verify form (never sent to the LLM), masking, 3-strike handover, account card with matched payments, multi-loan borrowers | ☐ |
| M6 | Handover + sessions | Rule + LLM handover triggers, queue entry, agent-hours notice, bot silence, 60 min / 5 min idle sessions paused during handover, payment candidates on "I already paid" | ☐ |
| M7 | Staff page + Agent view | Token gate, queue, detail view, claim / reply / return, polling, audit tab | ☐ |
| M8 | Hardening + handoff | Health complete, structured logs, smoke test, final README (run, deploy, limitations, next steps), lock auto-publishing | ☐ |

**Stretch, in priority order:** degraded-mode kill switch · per-IP verification rate limit · GitHub Actions CI · settlement quote (Combined answers) · Docker ingest image.

## Running what exists so far

```bash
# TypeScript side
npm install
npm run typecheck && npm test && npm run build
netlify dev                     # local site on http://localhost:8888, /api/health

# Python side (offline ingest)
python -m venv .venv
.venv/Scripts/python -m pip install -r scripts/requirements.txt   # Windows path; use .venv/bin on Linux/macOS
.venv/Scripts/python scripts/ingest.py                            # regenerates data/generated/
.venv/Scripts/python -m pytest -q scripts/tests
```
