import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from kopano.cleaning import normalise_phone, normalise_reference, parse_received_at, to_thebe  # noqa: E402

PHONE_CASES = json.loads((ROOT / "data" / "contract" / "phone-cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", PHONE_CASES, ids=[c["raw"] or "<empty>" for c in PHONE_CASES])
def test_phone_matches_shared_contract_fixtures(case):
    assert normalise_phone(case["raw"]) == case["normalised"]


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("KM-L-0069", "KM-L-0069"),
        ("KML0141", "KM-L-0141"),
        ("KML 0078 school fees", "KM-L-0078"),
        ("km-l-0016", "KM-L-0016"),
        ("KM-L-82", "KM-L-0082"),
        ("loan 144", "KM-L-0144"),
        ("SETTLE-KM-L-0123", "KM-L-0123"),
        ("", None),
        (None, None),
    ],
)
def test_reference_normalisation(raw, expected):
    assert normalise_reference(raw) == expected


@pytest.mark.parametrize("raw, expected", [("P 1,980.00", 198000), ("2,090.00", 209000), ("7572.86", 757286), ("", None)])
def test_amounts_to_thebe(raw, expected):
    assert to_thebe(raw) == expected


def test_both_date_formats():
    assert parse_received_at("2026-10-01 16:18") == ("2026-10-01T16:18:00+02:00", False)
    assert parse_received_at("02/10/2026") == ("2026-10-02T00:00:00+02:00", True)
