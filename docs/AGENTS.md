# AGENTS.md

Guidance for anyone working on this project, human or AI coding assistant. Read the [project README](../README.md) and [the assessment info](../Job_Info/TECHNICAL_INTERVIEW_INFO.md) for the task and [ARCHITECTURE.md](ARCHITECTURE.md) for the design before changing code.

## Non-negotiable rules

These come from the assessment brief and Kopano's own policies. Breaking one is a bug, even if a demo looks fine.

1. **The LLM never produces account figures.** Balances, instalments, dates, arrears, penalties and settlement amounts come from the database and are computed or formatted in code.
2. **Nothing personal before verification.** The registered mobile number and the last 4 digits of the ID must both match the same record. Enforce this in the data-access layer, not in a prompt.
3. **Scope data access to the verified borrower.** Never let the model, or user input, choose which `loan_id` or `borrower_id` is read.
4. **Three failed verification attempts means handover.** Count attempts server-side.
5. **During handover the assistant stays silent.** In `HANDED_OVER` and `WITH_AGENT` there are no bot replies and no LLM calls. **Only an agent's "Return to assistant" resumes the bot.** Session timers pause during handover.
   - **Messages are stored one key per message.** Never read-modify-write a whole conversation, because Blobs is last-write-wins.
6. **Handover triggers follow `Knowledge_Base/customer-service-standards.docx`.** If in doubt, hand over.
7. **Never promise outcomes that need approval:** penalty waivers, payment holidays, restructuring, top-ups.
8. **Every policy answer cites its source document.** If nothing relevant is retrieved, say so. Don't guess.
9. **Never quote superseded policy.** `late-payment-policy.pdf` (v3.0) replaces the late-payment sections of `penalties.docx` (v2.1).
10. **Never commit secrets.** The LLM API key lives in environment variables only.
11. **Respect the language boundary.**
    - Python lives only in `scripts/` and never runs on Netlify.
    - TypeScript is everything deployed.
    - The two sides communicate **only** through the JSON contract in `data/generated/` (ARCHITECTURE §4.1).
12. **Change the contract deliberately.**
    - Any change to a field in `data/generated/` must update the Python writer, `src/core/contract.ts`, ARCHITECTURE §4.1 and the CHANGELOG, all in the same change.
    - Breaking changes bump the major `schema_version`.
13. **Never expose `loans.json` to the browser.** It contains phone numbers and ID digits.
14. **Matching logic lives in `scripts/sql/*.sql`, not in SQL strings inside Python.** `90_checks.sql` must pass (return zero rows) before generated files are committed.
15. **Verification inputs never reach the LLM** and are stored masked in transcripts and the audit log.
16. **Render model text as plain text** (`textContent`). Figures and citations come from structured server data, never from the model's prose.

## Project facts to keep in mind

- "Today" for all date logic is **Tuesday 6 October 2026**. Put it in one config value, never scatter it through the code.
- Loan data is as at **30 September 2026**. Payments from 1–5 Oct 2026 are **not** in the loan book.
- For loans in arrears, `next_due_date` is the **oldest unpaid** instalment date.
- Phone numbers appear in many formats. Always use the shared normalisation function.
- One borrower (KB-10078) has two loans on the same phone.
- Money is handled as integer thebe or fixed decimals, not floats.
- Agent hours: Mon–Fri 08:00–17:00, Sat 08:30–13:00. Closed Sundays and public holidays.

## Working conventions

- **Record every meaningful change in [CHANGELOG.md](CHANGELOG.md)** under `[Unreleased]`: what changed and why. This project is meant to be taken over by someone else, so the changelog is the audit trail of reasoning.
- **Record design decisions in [ARCHITECTURE.md](ARCHITECTURE.md)**, and move items from *Open* to *Decided* with a one-line reason.
- **Record ideas you won't do now in [IDEAS.md](IDEAS.md)** instead of expanding scope.
- **Record client answers in [TECHNICAL_INTERVIEW_INFO.md § Questions for the client](../Job_Info/TECHNICAL_INTERVIEW_INFO.md#6-questions-for-the-client).**
- Keep changes small and commit often (the brief asks for regular saves).
- Add or update tests with any change to verification, handover or figure logic.
- **Write for the next reader, not just yourself.** Code and comments must be clear to a fellow junior developer and to a senior engineer reviewing it:
  - Use descriptive names.
  - Keep functions small.
  - Every file starts with a one- or two-line comment saying what it's for.
  - Comments explain *why* (the business rule or policy it enforces, with the doc reference), not *what* the code already says.
  - Avoid clever one-liners where a plain loop reads better.
- Match the existing code style. Prefer clear code over clever code, because every line must be explainable in the walkthrough.
- If a requirement is ambiguous, write the question in the README instead of guessing silently.

## Where things live

| Path | Contents |
|---|---|
| `Assessment Brief.pdf` | Requirements (source of truth) |
| `kopano_data.xlsx` | Loans, Payments, Contact History |
| `Knowledge_Base/` | 11 policy documents |
| `docs/` | Project documentation |
| `scripts/` | _Planned._ Python offline scripts (ingest, allocation, smoke test) |
| `data/generated/` | _Planned._ JSON contract produced by Python, read by TypeScript. **Regenerate; don't hand-edit** |
| `src/`, `netlify/functions/` | _Planned._ TypeScript runtime |

After changing anything in `scripts/` or the source data, run the ingest script and commit the regenerated `data/generated/` files in the same commit.
