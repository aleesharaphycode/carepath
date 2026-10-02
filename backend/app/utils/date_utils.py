"""
Centralized date normalization utility for CarePath clinical records.
Normalizes extracted clinical date strings across various medical and regional formats
into ISO 8601 (YYYY-MM-DD) for PostgreSQL DATE column compatibility.
"""
from datetime import datetime, date
import re
from typing import Optional, Any


def normalize_date(val: Any) -> Optional[str]:
    """
    Normalizes a date input to 'YYYY-MM-DD' format.

    Supported conversions:
      - 24/06/2023 -> 2023-06-24
      - 24-06-2023 -> 2023-06-24
      - 24.06.2023 -> 2023-06-24
      - 2023/06/24 -> 2023-06-24
      - 2023-06-24 -> 2023-06-24
      - Timestamps (e.g., '2023-06-24 08:49 PM', '24/06/2023 10:30', ISO timestamps)
      - Textual dates (e.g., '24 June 2023', 'June 24, 2023')

    Safely returns None for null, empty, or unparseable/invalid inputs.
    """
    if val is None:
        return None

    if isinstance(val, (datetime, date)):
        return val.strftime("%Y-%m-%d")

    if not isinstance(val, str):
        val = str(val)

    clean = val.strip()
    if not clean:
        return None

    if clean.lower() in ("none", "null", "n/a", "na", "unknown", "undefined", "nil", "-"):
        return None

    # 1. Exact ISO match YYYY-MM-DD
    if re.match(r"^\d{4}-\d{2}-\d{2}$", clean):
        try:
            datetime.strptime(clean, "%Y-%m-%d")
            return clean
        except ValueError:
            return None

    # 2. Strict standard formats matching full string
    formats = [
        "%Y/%m/%d",
        "%Y.%m.%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%d.%m.%Y",
        "%d %B %Y",
        "%d %b %Y",
        "%B %d, %Y",
        "%b %d, %Y",
        "%B %d %Y",
        "%b %d %Y",
        "%Y-%m-%d %I:%M %p",
        "%Y-%m-%d %H:%M:%S",
        "%d/%m/%Y %I:%M %p",
        "%d/%m/%Y %H:%M:%S",
        "%d-%m-%Y %I:%M %p",
        "%d-%m-%Y %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%SZ",
        "%m/%d/%Y",
        "%m-%d-%Y",
        "%d/%m/%y",
        "%d-%m-%y",
        "%d.%m.%y",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(clean, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue

    # 3. Regex match for ISO dates like "2023-06-24 08:49 PM" or ISO-8601 strings
    iso_match = re.search(r"\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b", clean)
    if iso_match:
        y, m, d = iso_match.group(1), iso_match.group(2), iso_match.group(3)
        try:
            return datetime(int(y), int(m), int(d)).strftime("%Y-%m-%d")
        except ValueError:
            pass

    # 4. Regex match for DD/MM/YYYY or DD-MM-YYYY within string
    dmy_match = re.search(r"\b(\d{1,2})[/\.-](\d{1,2})[/\.-](\d{4})\b", clean)
    if dmy_match:
        d, m, y = dmy_match.group(1), dmy_match.group(2), dmy_match.group(3)
        try:
            return datetime(int(y), int(m), int(d)).strftime("%Y-%m-%d")
        except ValueError:
            pass

    return None
