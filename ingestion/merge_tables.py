#!/usr/bin/env python3
"""Merge per-lesson markdown tables into a single scrollable table.

Reads the source markdown files directly and outputs:
  public/data/a1/nouns/all.md
  public/data/a1/verbs/all.md
"""

import re
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
DATA_DIR = REPO_ROOT / "data" / "a1"
OUT_DIR = REPO_ROOT / "public" / "data" / "a1"

LESSON_HEADING = re.compile(r'^## Lesson (\d+)', re.MULTILINE)
TABLE_ROW = re.compile(r'^\|(.+)\|$')
SEPARATOR_ROW = re.compile(r'^\|[\s\-|:]+\|$')


def extract_rows(content: str) -> list[list[str]]:
    """Return list of [cell, ...] for every data row in the file."""
    rows: list[list[str]] = []
    sections = LESSON_HEADING.split(content)
    # sections: [preamble, lesson_num, body, lesson_num, body, ...]
    # After split on a capturing group the list alternates: text, capture, text, ...
    i = 1
    while i < len(sections) - 1:
        body = sections[i + 1]
        for line in body.splitlines():
            line = line.strip()
            if not TABLE_ROW.match(line):
                continue
            if SEPARATOR_ROW.match(line):
                continue
            cells = [c.strip() for c in line.strip('|').split('|')]
            # Skip header rows (cells contain the column names)
            if cells[0].lower() in ('german', 'infinitive', 'noun'):
                continue
            rows.append(cells)
        i += 2
    return rows


def build_table(header: list[str], rows: list[list[str]]) -> str:
    """Render a markdown table."""
    col_count = len(header)

    # Compute column widths
    widths = [len(h) for h in header]
    for cells in rows:
        for j, cell in enumerate(cells[:col_count]):
            widths[j] = max(widths[j], len(cell))

    def fmt_row(values: list[str]) -> str:
        padded = [v.ljust(widths[i]) for i, v in enumerate(values)]
        return '| ' + ' | '.join(padded) + ' |'

    lines = [
        fmt_row(header),
        '| ' + ' | '.join('-' * w for w in widths) + ' |',
    ]
    for cells in rows:
        data = list(cells[:col_count])
        while len(data) < col_count:
            data.append('')
        lines.append(fmt_row(data))

    return '\n'.join(lines) + '\n'


def deduplicate(rows: list[list[str]]) -> tuple[list[list[str]], list[str]]:
    """Return (unique_rows, list_of_removed_keys), keyed on the first cell (case-insensitive)."""
    seen: dict[str, int] = {}  # key → row index of first occurrence
    unique: list[list[str]] = []
    removed: list[str] = []
    for cells in rows:
        key = cells[0].lower()
        if key in seen:
            removed.append(cells[0])
        else:
            seen[key] = len(unique)
            unique.append(cells)
    return unique, removed


def merge(source_path: Path, header: list[str], out_path: Path, title: str) -> None:
    content = source_path.read_text(encoding='utf-8')
    rows = extract_rows(content)
    unique_rows, removed = deduplicate(rows)
    if removed:
        print(f'  Removed {len(removed)} duplicate(s): {", ".join(removed)}')
    table = build_table(header, unique_rows)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(f'# {title}\n\n{table}', encoding='utf-8')
    print(f'Wrote {len(unique_rows)} rows ({len(rows) - len(unique_rows)} duplicates removed) → {out_path.relative_to(REPO_ROOT)}')


def main() -> None:
    merge(
        source_path=DATA_DIR / 'German_Nouns.md',
        header=['German', 'Article', 'Plural', 'English'],
        out_path=OUT_DIR / 'nouns' / 'all.md',
        title='German A1 — All Nouns',
    )
    merge(
        source_path=DATA_DIR / 'German_Verbs.md',
        header=['Infinitive', 'Present Perfect', 'Case', 'English'],
        out_path=OUT_DIR / 'verbs' / 'all.md',
        title='German A1 — All Verbs',
    )


if __name__ == '__main__':
    main()
