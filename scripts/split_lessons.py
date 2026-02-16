#!/usr/bin/env python3
"""Split monolithic German lesson markdown files into per-lesson files."""

import json
import re
from pathlib import Path

# Paths
REPO_ROOT = Path(__file__).parent.parent
DATA_DIR = REPO_ROOT / "data" / "a1"
OUT_DIR = REPO_ROOT / "public" / "data" / "a1"

# All 14 lesson titles (from German_Lesson_Summary.md)
LESSON_TITLES = {
    1: "Hallo! Ich bin Nicole...",
    2: "Ich bin Journalistin.",
    3: "Das ist meine Mutter.",
    4: "Der Tisch ist schön!",
    5: "Was ist das? – Das ist ein F.",
    6: "Ich brauche kein Büro.",
    7: "Du kannst wirklich toll...!",
    8: "Kein Problem. Ich habe Zeit!",
    9: "Ich möchte was essen, Onkel Harry.",
    10: "Ich steige jetzt in die U-Bahn ein.",
    11: "Was hast du heute gemacht?",
    12: "Was ist denn hier passiert?",
    13: "Wir suchen das Hotel Maritim.",
    14: "Wo findest du Ottos Haus?",
}


def split_by_lesson(content: str) -> dict[int, str]:
    """Split markdown content by '## Lesson N' headings.

    Returns dict mapping lesson number to markdown content for that lesson.
    """
    # Split on ## Lesson N headings
    pattern = re.compile(r'^(## Lesson (\d+).*?)$', re.MULTILINE)

    sections: dict[int, str] = {}
    matches = list(pattern.finditer(content))

    for i, match in enumerate(matches):
        lesson_num = int(match.group(2))
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        sections[lesson_num] = content[start:end].rstrip()

    return sections


def write_lesson_files(sections: dict[int, str], out_subdir: Path, total_lessons: int = 14) -> set[int]:
    """Write per-lesson markdown files. Returns set of lesson numbers that have content."""
    out_subdir.mkdir(parents=True, exist_ok=True)
    lessons_with_content = set(sections.keys())

    for lesson_num in range(1, total_lessons + 1):
        filename = out_subdir / f"lesson_{lesson_num:02d}.md"
        if lesson_num in sections:
            filename.write_text(sections[lesson_num], encoding="utf-8")
        else:
            # Write empty placeholder
            filename.write_text("", encoding="utf-8")

    return lessons_with_content


def main():
    # Read and split lesson summaries only
    lessons_md = (DATA_DIR / "German_Lesson_Summary.md").read_text(encoding="utf-8")
    lesson_sections = split_by_lesson(lessons_md)
    write_lesson_files(lesson_sections, OUT_DIR / "lessons")

    # Generate index.json
    index = {
        "lessons": [
            {
                "id": lesson_num,
                "title": LESSON_TITLES[lesson_num],
            }
            for lesson_num in range(1, 15)
        ]
    }

    index_path = OUT_DIR / "index.json"
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Generated index.json with {len(index['lessons'])} lessons")
    print(f"Output directory: {OUT_DIR}")


if __name__ == "__main__":
    main()
