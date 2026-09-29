# Ideas

A backlog of ideas worth exploring. An idea here is **not** a commitment. Adding an idea costs nothing. Promoting one into scope is a decision that goes in [ARCHITECTURE.md](ARCHITECTURE.md) and [CHANGELOG.md](CHANGELOG.md).

**How to add one:** append a row with the next ID, today's date, a one-line summary, and why it matters. Put detail in the Notes section below if needed.

**Status values:** `new` · `considering` · `planned` · `done` · `rejected` (give a reason)

| ID | Date | Idea | Why it matters | Status |
|---|---|---|---|---|
| I-001 | 2026-09-29 | Tag each KB chunk with version, effective date and `superseded`, and filter superseded chunks out of retrieval | Stops the assistant quoting the old 10% penalty policy | new |
| I-002 | 2026-09-29 | Show "received but not yet allocated" payments alongside the loan-book balance | Addresses the client's main complaint: customers chased after paying | new |
| I-003 | 2026-09-29 | When a customer says "I already paid", look up recent payments by phone or reference before handing over, and attach the candidates to the handover | Agent sees the evidence instantly; customer doesn't repeat themselves | new |
| I-004 | 2026-09-29 | Collections-conduct report from Contact History (Sunday contact, more than one contact a day, contact after "already paid" or during a dispute) | Shows the policy breaches driving complaints; strong staff-mode demo | new |
| I-005 | 2026-09-29 | Flag suspected duplicate payments (same `txn_ref` within minutes) for refund review | Customers may be out of pocket (e.g. two payments of P6,393.75 for KM-L-0094) | new |
| I-006 | 2026-09-29 | Setswana support, or at least detecting Setswana and offering an agent | Agents already serve customers in English and Setswana | new |
| I-007 | 2026-09-29 | Health endpoint, basic metrics (latency, LLM errors, handover rate) and an LLM spend counter | Operations role: the service should be observable and stay within the key's spending limit | new |
| I-008 | 2026-09-29 | Scripted conversation test suite that also runs as a pre-demo smoke test against the deployed URL | Catches regressions right before the walkthrough | new |
| I-009 | 2026-09-29 | Public-holiday calendar for Botswana used in agent-hours and due-date logic | The late-payment and due-date rules depend on public holidays | new |

## Notes

_Longer write-ups for individual ideas go here, headed by their ID._
