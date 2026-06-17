#!/usr/bin/env python3
"""Bulk-fix common DB abstraction migration patterns."""
import re
from pathlib import Path

SRC = Path(__file__).parent / "src"

def fix_file(path: Path, content: str) -> str:
    original = content

    # rusqlite-style row.get::<_, T> -> row.get::<T>
    content = re.sub(r"\.get::<_,\s*", ".get::<", content)

    # Result.optional().flatten() -> optional().ok().flatten()
    content = re.sub(
        r"\.optional\(\)\s*\n\s*\.flatten\(\)",
        ".optional().ok().flatten()",
        content,
    )
    content = re.sub(
        r"\.optional\(\)\s*\n\s*\.flatten\(\);",
        ".optional().ok().flatten();",
        content,
    )

    # HashSet from permissions_from_modules
    content = re.sub(
        r"(permissions_from_modules\([^)]+\)\.into_iter\(\))(;)",
        r"\1.collect()\2",
        content,
    )

    # query_map Vec followed by ? — query_map returns Vec not Result
    content = re.sub(
        r"(\.query_map\([^)]*\)[^;]*\))\?;",
        r"\1;",
        content,
        flags=re.DOTALL,
    )

    # rows.flatten() when rows is already Vec from query_map
    content = re.sub(r"for row in rows\.flatten\(\)", "for row in rows", content)

    return content if content != original else original

def main():
    changed = []
    for path in SRC.rglob("*.rs"):
        text = path.read_text(encoding="utf-8")
        new = fix_file(path, text)
        if new != text:
            path.write_text(new, encoding="utf-8")
            changed.append(str(path.relative_to(SRC.parent)))
    print(f"Updated {len(changed)} files:")
    for f in sorted(changed):
        print(f"  {f}")

if __name__ == "__main__":
    main()
