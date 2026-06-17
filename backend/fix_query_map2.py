#!/usr/bin/env python3
"""Remove obsolete query_map iterator patterns."""
import re
from pathlib import Path

SRC = Path(__file__).parent / "src"

def fix(text: str, rel: str) -> str:
    if rel.endswith("db/migrations.rs"):
        return text

    for _ in range(20):
        old = text
        text = re.sub(
            r"\.map\(\|rows\| rows\.filter_map\(\|r\| r\.ok\(\)\)\)",
            "",
            text,
        )
        text = re.sub(
            r"\.map\(\|i\| i\.filter_map\(\|r\| r\.ok\(\)\)\)",
            "",
            text,
        )
        text = re.sub(
            r"\.filter_map\(\|r\| r\.ok\(\)\)",
            "",
            text,
        )
        if text == old:
            break

    # stmt.query_map(...).map(|iter| -> stmt.query_map(...).into_iter().map(|iter|
    text = re.sub(
        r"(\.query_map\([^;]+?\))\s*\.map\(\|iter\|",
        r"\1.into_iter().map(|iter|",
        text,
        flags=re.DOTALL,
    )

    # prepare multiline without unwrap: conn.prepare(\n ... \n        );
    text = re.sub(
        r"(let mut \w+ = conn\.prepare\([^;]+\))\s*;",
        r"\1.unwrap();",
        text,
        flags=re.DOTALL,
    )
    # fix double unwrap
    text = text.replace(".unwrap().unwrap()", ".unwrap()")

    return text


def main():
    for p in sorted(SRC.rglob("*.rs")):
        rel = str(p.relative_to(SRC)).replace("\\", "/")
        orig = p.read_text(encoding="utf-8")
        upd = fix(orig, rel)
        if upd != orig:
            p.write_text(upd, encoding="utf-8")
            print(rel)


if __name__ == "__main__":
    main()
