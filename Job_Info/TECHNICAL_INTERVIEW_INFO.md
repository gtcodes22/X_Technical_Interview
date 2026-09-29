# Technical Interview Info

Context for the **Xavier Africa technical assessment** (Junior Developer — Operations) that produced the Kopano Customer Assistant: the brief, requirements, timeline, inputs and the client Q&A. The product itself is described in the [project README](../README.md).

---

## 1. The client and the problem

Kopano Microfinance is a licensed micro lender (regulated by NBFIRA) with four branches in Botswana: Gaborone Main Mall, Mogoditshane, Tlokweng and Francistown. It lends to salaried workers, small business owners and families.

**The problem:**
- A customer service team of **four agents is overwhelmed**, mostly by repetitive questions: *what's my balance, when is my next payment and how much, how do I pay, what happens if I pay late.*
- **Customers who have already paid are still being chased**, because payments take days to be allocated to loans.
- **Complaints are rising.**

**The client contact** is Gaone Tsheko, Head of Customer Operations. She answers what she is asked, and nothing more.

**Assessment "today":** treat the current date as **Tuesday 6 October 2026** for all date logic.

## 2. What we must deliver (core requirements)

| # | Requirement | Acceptance summary |
|---|---|---|
| 1 | Chat interface | A web page a customer could use |
| 2 | Policy answers | Retrieval over the knowledge base. **Every answer shows its source document** |
| 3 | Identity verification | Registered mobile number **and** last 4 digits of Omang/passport must both match before any account information is shared |
| 4 | Account answers | For a verified customer: next payment date and amount, and outstanding balance. **Figures come from the data, never from the model** |
| 5 | Human handover | Follow Kopano's transfer rules. Handed-over conversations appear in a staff-visible queue with the transcript and customer details. **After handover the assistant stops replying.** (Client addition: the agent replies in the same chat, then hands back to the bot.) |
| 6 | Deployed | Reachable during the walkthrough. If deployment fails, demo locally and explain why |
| 7 | README | How to run it, how to deploy it, design decisions, known limitations, next steps |

### Extensions (choose at Checkpoint 1; "choosing well matters more than choosing many")

| Extension | What it means | Notes |
|---|---|---|
| Agent view | A human agent can read and reply in a handed-over conversation | Natural follow-on to the handover queue |
| Payment allocation | Account answers reflect payments received but not yet in the loan book | Directly addresses the "already paid but still chased" problem. The data is messy, so matching is non-trivial |
| Combined answers | Answers needing both customer data and policy (for example late penalties, early settlement amount) | Arithmetic must be done in code, not by the LLM |
| Staff mode | Managers ask plain-English questions about the loan book | Text-to-SQL risk. Must be read-only |
| Tests | Automated checks that the assistant behaves correctly | Cheap and high-value for verification and handover rules |
| Audit log | What was said, to whom, and on what basis | Fits a regulated lender and an Operations role |

**Chosen extensions:** **Tests**, **Audit log**, **Payment allocation** (conservative version) and **Agent view** (simplest form).

- **Payment allocation** is the only extension that tackles the client's headline complaint: customers who have paid are still being chased.
- **Tests** protect verification, handover and figure logic, including during live changes in the walkthrough.
- **Audit log** records what the assistant told each customer and why, which a regulated lender needs.
- **Agent view** was added after Gaone asked for agents to reply in the same chat and then hand back to the bot (client answer to question 9). It's kept to claim, reply and return.

**Not chosen:**
- **Staff mode:** letting the model write SQL is a risk to figure accuracy and data safety, and it isn't one of the client's stated problems.
- **Combined answers:** penalty edge cases and conflicts with stale data. It's a stretch goal if time allows, starting with the settlement quote.

See [ARCHITECTURE.md § Open decisions](../docs/ARCHITECTURE.md#11-open-decisions), D5.

## 3. Timeline

| Time | Stage | Output |
|---|---|---|
| 0:00 – 0:10 | Briefing | — |
| 0:10 – 0:35 | Discovery and planning | Questions for the client, plan |
| 0:35 – 0:45 | **Checkpoint 1** | Problem understanding, scope, extensions, risks, client Q&A |
| 0:45 – 1:05 | Design | Architecture |
| 1:05 – 1:15 | **Checkpoint 2** | Architecture, data loading, retrieval, verification and handover, deployment, definition of done |
| 1:15 – 3:15 | Build and deploy | Working, deployed assistant |
| 3:15 – 3:25 | Break | — |
| 3:25 – 3:55 | **Walkthrough** | Live demo. Interviewers chat as customers and may change something live |

## 4. Goals

1. **Correct over clever.** No invented amounts, dates or policy. When unsure, hand over.
2. **Safe by default.** Nothing personal is shared before verification. The assistant never promises outcomes that need approval (waivers, payment holidays, restructuring).
3. **Traceable.** Every policy answer names its source document. Every account figure traces to a data row.
4. **Operable.** It is deployed, it survives LLM/API failures gracefully, and it is documented well enough for someone else to run and take over.
5. **Honest scope.** Be clear about what works, what doesn't, and why.

## 5. Inputs

| Input | Location | Notes |
|---|---|---|
| Assessment brief | `Assessment Brief.pdf` | Source of truth for requirements |
| Job ad | `Job_Info/` (this folder) | Operations role, TypeScript primary; values monitoring, SQL, HTTP, third-party API failure handling, docs |
| Data extract | `kopano_data.xlsx` | Sheets: Read Me, Loans, Payments, Contact History |
| Knowledge base | `Knowledge_Base/` | 11 policy documents (PDF, DOCX, TXT) |
| LLM API key | Supplied on the day | Has a spending limit. **Never commit it** |

### Knowledge base documents

| Document | Covers |
|---|---|
| `about-kopano.txt` | Branches, opening hours, agent hours (Mon–Fri 08:00–17:00, Sat 08:30–13:00), contact details, languages |
| `faqs.txt` | Loan ID format, payment delays, overpaying, statements, changing phone number, multiple loans, self-employed |
| `how-to-pay.txt` | Orange Money, MyZaka, Smega, bank transfer (EFT); reflection times; on-time is judged by date **received** |
| `loan-products.docx` | Salary Advance (due 25th), Small Business (due 10th), School Fees (due 15th); flat interest; weekend/holiday rule; top-ups |
| `late-payment-policy.pdf` | **v3.0, effective 1 Mar 2025, supersedes earlier versions.** 5-day grace period, one-off 5% penalty capped at P250 per instalment, collections contact rules, credit bureau after 60 days |
| `penalties.docx` | **v2.1, effective 1 Jan 2023. Superseded for late payments.** Also contains the P75 returned-payment fee |
| `early-settlement.docx` | Settlement = outstanding balance less 5%; quote valid same day only; `SETTLE-` reference |
| `payment-holidays-and-restructuring.pdf` | Eligibility rules, P150 fee. **Chat assistant cannot approve** |
| `privacy-and-verification.pdf` | Mobile number + last 4 of ID; 3 failed attempts → agent; never discuss with third parties |
| `customer-service-standards.docx` | **The handover rules**, and how to answer customers |
| `complaints.pdf` | Complaints procedure; collections paused on disputed amounts |

## 6. Questions for the client

Record the answers here as they are given.

| # | Question | Answer |
|---|---|---|
| 1 | Is `late-payment-policy.pdf` v3.0 the only current late-payment policy? Does the P75 returned-payment fee still apply? | _pending_ |
| 2 | When the loan book and recent payments disagree, what should the assistant tell the customer? | _pending_ |
| 3 | Should the assistant allocate unmatched or ambiguous payments, or only show confidently matched ones? | _pending_ |
| 4 | For a borrower with several loans, answer for all of them or ask which one? | _pending_ |
| 5 | Which languages must the assistant support? (Agents support English and Setswana.) | _pending_ |
| 6 | Who works the handover queue, and how quickly do they respond inside and outside hours? | _pending_ |
| 7 | Is there a preferred hosting platform or any data-residency constraint? | _pending_ |
| 8 | What counts as success for Kopano after launch (fewer calls, fewer complaints, fewer wrong chases)? | _pending_ |
| 9 | After a chat is handed over, how does the agent get back to the customer: call, SMS, or reply in the chat? What should happen for customers who haven't verified yet? | **Answered 2026-09-29.**<br>• **Approach:** up to us.<br>• **Preferred:** the agent replies **in the same chat** and, when done, **hands back to the bot**, which continues. The bot is paused while the agent is in control.<br>• **Sessions:** 60 minutes maximum, or close after 5 minutes idle.<br>• **Unverified customers:** hand over straight away; collecting details is optional.<br>• **Our interpretation, confirmed:** timers pause during handover, verification lasts the whole session, and out-of-hours handovers stay queued. See ARCHITECTURE D10 and D11 |
