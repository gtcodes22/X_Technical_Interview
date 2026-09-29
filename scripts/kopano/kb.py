"""Knowledge base -> section-sized chunks with document metadata (version, superseded)."""

from __future__ import annotations

import re
from pathlib import Path

import docx
import pdfplumber

# Human-readable titles for source chips in the chat.
TITLES = {
    "about-kopano.txt": "About Kopano",
    "complaints.pdf": "Complaints Procedure",
    "customer-service-standards.docx": "Customer Service Standards",
    "early-settlement.docx": "Early Settlement",
    "faqs.txt": "Frequently Asked Questions",
    "how-to-pay.txt": "How to Pay Your Loan",
    "late-payment-policy.pdf": "Late Payment Policy",
    "loan-products.docx": "Loan Products",
    "payment-holidays-and-restructuring.pdf": "Payment Holidays and Restructuring",
    "penalties.docx": "Penalties and Charges",
    "privacy-and-verification.pdf": "Privacy and Account Verification",
}

# late-payment-policy.pdf v3.0 "supersedes all previous versions of the late payment and penalty policy".
# The returned-payment fee in penalties.docx is not about late payment; its status is an open client question.
SUPERSEDED_SECTIONS = {("penalties.docx", "Late payment"), ("penalties.docx", "Credit bureau reporting")}

_PDF_NOISE = re.compile(r"KOPANO\. MICROFINANCE|Kopano Microfinance\s+\d+/\d+|Licensed by NBFIRA")
_VERSION = re.compile(r"Version\s+([\d.]+)")
_EFFECTIVE = re.compile(r"Effective\s+(\d{1,2}\s+\w+\s+\d{4})")


def _looks_like_heading(line: str) -> bool:
    return (
        0 < len(line) <= 50
        and not line.endswith((".", ",", ":", ";"))
        and line[0].isupper()
        and not re.match(r"^[\d•�\-–]", line)
        and "@" not in line
        and not re.search(r"\d{2}:\d{2}", line)
    )


def _txt_sections(path: Path) -> list[tuple[str, list[str]]]:
    lines = path.read_text(encoding="utf-8").splitlines()
    sections: list[tuple[str, list[str]]] = [("Overview", [])]
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        underline = lines[i + 1].strip() if i + 1 < len(lines) else ""
        if line and re.fullmatch(r"[=\-]{3,}", underline):
            if underline.startswith("-"):
                sections.append((line, []))
            i += 2
            continue
        if path.name == "faqs.txt" and line.endswith("?"):
            sections.append((line, []))
        elif line:
            sections[-1][1].append(line)
        i += 1
    return sections


def _docx_sections(path: Path) -> list[tuple[str, list[str]]]:
    paras = [p for p in docx.Document(str(path)).paragraphs if p.text.strip()]
    sections: list[tuple[str, list[str]]] = [("Overview", [])]
    for idx, p in enumerate(paras):
        text = p.text.strip()
        style = (p.style.name if p.style is not None else "").lower()
        if idx == 0:
            continue  # document title
        if style.startswith("heading") or (style == "normal" and _looks_like_heading(text) and len(text.split()) <= 6):
            sections.append((text, []))
        else:
            sections[-1][1].append(("• " if "list" in style else "") + text)
    return sections


def _pdf_sections(path: Path) -> list[tuple[str, list[str]]]:
    with pdfplumber.open(str(path)) as pdf:
        text = "\n".join(page.extract_text() or "" for page in pdf.pages)
    lines = [l.strip() for l in text.splitlines() if l.strip() and not _PDF_NOISE.search(l)]
    sections: list[tuple[str, list[str]]] = [("Overview", [])]
    for idx, line in enumerate(lines):
        if idx == 0:
            continue  # document title
        # A wrapped line (previous line didn't end a sentence) is never a heading.
        prev_ended = idx == 1 or lines[idx - 1].endswith((".", ":", ")")) or not sections[-1][1]
        if prev_ended and _looks_like_heading(line) and len(line.split()) <= 6:
            sections.append((line, []))
        else:
            sections[-1][1].append(line)
    return sections


def build_chunks(kb_dir: Path) -> list[dict]:
    chunks: list[dict] = []
    for path in sorted(kb_dir.iterdir()):
        reader = {".txt": _txt_sections, ".docx": _docx_sections, ".pdf": _pdf_sections}.get(path.suffix)
        if reader is None:
            continue
        sections = reader(path)
        full = "\n".join(line for _, body in sections for line in body)
        version = (m.group(1) if (m := _VERSION.search(full)) else None)
        effective = (m.group(1) if (m := _EFFECTIVE.search(full)) else None)
        n = 0
        for section, body in sections:
            if not body:
                continue
            n += 1
            superseded = (path.name, section) in SUPERSEDED_SECTIONS
            chunks.append(
                {
                    "chunk_id": f"{path.stem}#{n}",
                    "document": path.name,
                    "title": TITLES.get(path.name, path.stem),
                    "section": section,
                    "text": "\n".join(body),
                    "version": version,
                    "effective_date": effective,
                    "superseded": superseded,
                    "superseded_by": "late-payment-policy.pdf" if superseded else None,
                }
            )
    return chunks
