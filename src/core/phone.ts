// Phone normalisation for what the CUSTOMER types. Must behave exactly like
// scripts/kopano/cleaning.py normalise_phone — both are tested against data/contract/phone-cases.json.

/** Returns the 8-digit Botswana mobile number (e.g. "71084258"), or null if it can't be one. */
export function normalisePhone(raw: string | null | undefined): string | null {
  let digits = (raw ?? "").replace(/\D/g, "");

  if (digits.startsWith("00267")) {
    digits = digits.slice(5); // international format with 00 prefix
  } else if (digits.startsWith("267") && digits.length === 11) {
    digits = digits.slice(3); // international format without prefix
  } else if (digits.startsWith("0") && digits.length === 9) {
    digits = digits.slice(1); // local number with a leading 0
  }

  const isBotswanaMobile = digits.length === 8 && digits.startsWith("7");
  return isBotswanaMobile ? digits : null;
}
