// Rule-based handover triggers from customer-service-standards.docx ("Transfer to a customer
// service agent"). Rules run BEFORE the LLM so the obvious cases never depend on the model.
// The LLM can also request a handover; either one is enough (ARCHITECTURE.md §5, routing).
//
// Patterns match a REQUEST for a person ("speak to an agent"), not the bare word, so questions
// like "What are your agent hours?" are answered from policy instead of being handed over.

interface HandoverRule {
  reason: string;
  pattern: RegExp;
}

const PERSON = "(agent|human|person|manager|consultant|someone|somebody)";

const RULES: HandoverRule[] = [
  {
    reason: "Customer asked for a person",
    pattern: new RegExp(
      [
        `\\b(speak|talk|chat)\\s+(to|with)\\s+(a|an|the)?\\s*(real\\s+)?${PERSON}\\b`, // "speak to an agent"
        `\\b(i want|i need|get me|connect me (to|with))\\s+(a|an|the)?\\s*(real\\s+)?${PERSON}\\b`, // "I want a person"
        "\\b(real person|human agent|human being)\\b",
        "^\\s*(agent|human|person)( please)?[.!]?\\s*$", // just "agent" / "human please"
      ].join("|"),
      "i",
    ),
  },
  { reason: "Complaint or customer upset", pattern: /\b(complain|complaint|upset|angry|frustrat|ridiculous|terrible|useless|unacceptable)\w*/i },
  {
    reason: "Customer disputes a payment, balance, penalty or charge",
    pattern: /\b(dispute|wrong (balance|amount|charge|penalty)|incorrect|already paid|i paid|i have paid|overcharged|not fair)\b/i,
  },
  { reason: "Financial hardship", pattern: /\b(can'?t pay|cannot pay|unable to pay|lost my job|job loss|retrenched|hardship|sick|illness|funeral|passed away|struggling)\b/i },
  { reason: "Payment holiday, restructuring or top-up request", pattern: /\b(payment holiday|skip (a|my|this) (payment|instalment)|restructur\w*|top[- ]?up|extend my loan)\b/i },
  { reason: "Possible fraud", pattern: /\b(fraud|scam|stolen|someone (else )?(used|took)|not my loan|didn'?t take (this|a) loan|hacked)\b/i },
];

/** Returns the handover reason for the first matching rule, or null. */
export function matchHandoverRule(text: string): string | null {
  return RULES.find((rule) => rule.pattern.test(text))?.reason ?? null;
}
