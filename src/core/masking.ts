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

/** Removes phone numbers and 4-digit groups from free text before it is stored or sent to the LLM. */
export function redactSensitive(text: string): string {
  return text.replace(PHONE_PATTERN, "[phone removed]").replace(FOUR_DIGITS, "[digits removed]");
}
