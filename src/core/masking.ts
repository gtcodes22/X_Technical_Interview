// Masking for anything stored or logged. Verification details (phone, ID digits) must never
// appear in full in transcripts, the audit log, or text sent to the LLM (AGENTS.md rule 15).

/** "71084258" -> "71•••258" */
export function maskPhone(phone: string): string {
  return phone.length >= 6 ? `${phone.slice(0, 2)}•••${phone.slice(-3)}` : "•••";
}

/** "4821" -> "••21" */
export function maskIdLast4(digits: string): string {
  return `••${digits.slice(-2)}`;
}

// Phone-like runs of digits (7–13 digits with optional spaces, +, -) and standalone 4-digit groups.
const PHONE_PATTERN = /\+?\d[\d\s-]{6,14}\d/g;
const FOUR_DIGITS = /\b\d{4}\b/g;
// Words that mean a nearby 4-digit number is probably ID digits, not a merchant code or amount.
const ID_CONTEXT = /\b(id|omang|passport|last\s*(4|four)|digits)\b/i;

/**
 * Removes phone numbers from free text before it is stored or sent to the LLM. 4-digit groups are
 * removed only when they look like ID digits: the message mentions ID/Omang/passport, or it also
 * contains a phone number (someone typing their verification details). Merchant codes such as
 * 5521 and amounts such as 1500 are kept, so questions about them can still be answered.
 */
export function redactSensitive(text: string): string {
  const looksLikeCredentials = ID_CONTEXT.test(text) || new RegExp(PHONE_PATTERN.source).test(text);
  const withoutPhones = text.replace(PHONE_PATTERN, "[phone removed]");
  return looksLikeCredentials ? withoutPhones.replace(FOUR_DIGITS, "[digits removed]") : withoutPhones;
}
