"""Cleaning rules for messy extract values. Mirrored in TypeScript where the runtime needs them
(phone: src/core/phone.ts), and tested against the shared data/contract/phone-cases.json."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

BW_OFFSET = "+02:00"  # Africa/Gaborone, no daylight saving


def normalise_phone(raw: object) -> str | None:
    """Return the 8-digit Botswana mobile number, or None if it can't be one."""
    digits = re.sub(r"\D", "", str(raw or ""))
    if digits.startswith("00267"):
        digits = digits[5:]
    elif digits.startswith("267") and len(digits) == 11:
        digits = digits[3:]
    elif digits.startswith("0") and len(digits) == 9:
        digits = digits[1:]
    return digits if len(digits) == 8 and digits[0] == "7" else None


_KML = re.compile(r"K\s*M\s*-?\s*L\s*-?\s*0*(\d{1,4})", re.IGNORECASE)
_LOAN = re.compile(r"\bLOAN\s*#?\s*0*(\d{1,4})\b", re.IGNORECASE)


def normalise_reference(raw: object) -> str | None:
    """'KML 0078 school fees' -> 'KM-L-0078', 'loan 144' -> 'KM-L-0144', '' -> None."""
    text = str(raw or "")
    match = _KML.search(text) or _LOAN.search(text)
    return f"KM-L-{int(match.group(1)):04d}" if match else None


def to_thebe(raw: object) -> int | None:
    """'P 1,980.00' -> 198000. Money is integer thebe everywhere in the contract."""
    if raw is None or (isinstance(raw, float) and raw != raw):  # None or NaN
        return None
    text = re.sub(r"[^\d.\-]", "", str(raw))
    try:
        return int((Decimal(text) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    except InvalidOperation:
        return None


def parse_received_at(raw: object) -> tuple[str | None, bool]:
    """Return (ISO timestamp in Botswana time, date_only). Handles '2026-10-01 16:18' and '02/10/2026'."""
    if isinstance(raw, datetime):
        return raw.strftime("%Y-%m-%dT%H:%M:%S") + BW_OFFSET, False
    text = str(raw or "").strip()
    for fmt, date_only in (("%Y-%m-%d %H:%M", False), ("%Y-%m-%d %H:%M:%S", False), ("%d/%m/%Y", True)):
        try:
            return datetime.strptime(text, fmt).strftime("%Y-%m-%dT%H:%M:%S") + BW_OFFSET, date_only
        except ValueError:
            continue
    return None, False


def to_iso_date(raw: object) -> str | None:
    """Excel serial (46213) or datetime -> 'YYYY-MM-DD'."""
    if isinstance(raw, (datetime, date)):
        return raw.strftime("%Y-%m-%d")
    try:
        serial = float(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return (date(1899, 12, 30) + timedelta(days=int(serial))).isoformat()
