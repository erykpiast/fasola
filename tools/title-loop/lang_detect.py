"""Shared language detection for recipe input files."""

from pathlib import Path

POLISH_CHARS = set("ąęśćźżłóńĄĘŚĆŹŻŁÓŃ")

# Polish keywords commonly found in recipe OCR text
PL_KEYWORDS = {"SKŁADNIKI", "PRZYGOTOWANIE", "DLA", "OSÓB", "ŁYŻKI", "SZKLANKI", "PORCJE", "PIECZENIE", "GOTOWANIE"}


def detect_language(text: str) -> str:
    """Detect language from OCR text body. Returns 'pl' or 'en'."""
    pl_char_count = sum(1 for c in text if c in POLISH_CHARS)
    if pl_char_count >= 3:
        return "pl"
    # Check for Polish keywords even if diacritics were lost to OCR
    upper = text[:1000].upper()
    if any(kw in upper for kw in PL_KEYWORDS):
        return "pl"
    return "en"


def detect_file_language(filepath: Path) -> str:
    """Detect language of an input file."""
    text = filepath.read_text(encoding="utf-8")
    return detect_language(text)
