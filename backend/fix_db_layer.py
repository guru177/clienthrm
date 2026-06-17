#!/usr/bin/env python3
"""Bulk mechanical fixes for DB abstraction migration."""
import re
from pathlib import Path

SRC = Path(__file__).parent / "src"
SKIP = {"db/migrations.rs"}


def fix_query_map_chains(text: str) -> str:
    patterns = [
        (r"\.query_map_result\((.+?)\)\s*\.unwrap\(\)\s*\.filter_map\(\|r\| r\.ok\(\)\)\s*\.collect\(\)", r".query_map_result(\1).unwrap_or_default()"),
        (r"\.query_map\((.+?)\)\s*\.unwrap\(\)\s*\.filter_map\(\|r\| r\.ok\(\)\)\s*\.collect\(\)", r".query_map(\1)"),
        (r"\.query_map\((.+?)\)\s*\.unwrap\(\)\s*\.filter_map\(\|r\| r\.ok\(\)\)", r".query_map(\1)"),
        (r"\.query_map\((.+?)\)\s*\.unwrap\(\)\s*\.collect\(\)", r".query_map(\1)"),
        (r"\.query_map\((.+?)\)\s*\.unwrap\(\)", r".query_map(\1)"),
        (r"\.query_map\((.+?)\)\s*\.ok\(\)", r".query_map(\1)"),
        (r"\.query_map\((.+?)\)\s*\.collect\(\)", r".query_map(\1)"),
    ]
    for _ in range(30):
        old = text
        for pat, repl in patterns:
            text = re.sub(pat, repl, text, flags=re.DOTALL)
        if text == old:
            break
    return text


def fix_content(text: str, rel: str) -> str:
    if any(rel.endswith(s) for s in SKIP):
        return text

    text = fix_query_map_chains(text)

    text = text.replace("Result<(), rusqlite::Error>", "crate::db::Result<()>")
    text = text.replace("-> rusqlite::Result<", "-> crate::db::Result<")

    # Only in non-db/error.rs files replace rusqlite::Error return types in fn signatures
    if not rel.endswith("db/error.rs"):
        text = re.sub(
            r"->\s*rusqlite::Error\b",
            "-> crate::db::DbError",
            text,
        )

    text = text.replace(
        "Vec<Box<dyn rusqlite::types::ToSql>>",
        "Vec<crate::db::ParamValue>",
    )
    text = text.replace(
        "Vec<Box<dyn rusqlite::ToSql>>",
        "Vec<crate::db::ParamValue>",
    )
    text = text.replace(
        "vec![Box::new(",
        "vec![crate::db::into_param_value(",
    )
    text = re.sub(
        r"params\.push\(Box::new\(([^)]+)\)\)",
        r"params.push(crate::db::into_param_value(\1))",
        text,
    )
    text = re.sub(
        r"list_params\.push\(Box::new\(([^)]+)\)\)",
        r"list_params.push(crate::db::into_param_value(\1))",
        text,
    )
    text = re.sub(
        r"sql_params\.push\(Box::new\(([^)]+)\)\)",
        r"sql_params.push(crate::db::into_param_value(\1))",
        text,
    )
    text = re.sub(
        r"rusqlite::params_from_iter\(params\.iter\(\)\.map\(\|p\| p\.as_ref\(\)\)\)",
        "&params",
        text,
    )
    text = re.sub(
        r"rusqlite::params_from_iter\(list_params\.iter\(\)\.map\(\|p\| p\.as_ref\(\)\)\)",
        "&list_params",
        text,
    )
    text = re.sub(
        r"rusqlite::params_from_iter\(sql_params\.iter\(\)\.map\(\|p\| p\.as_ref\(\)\)\)",
        "&sql_params",
        text,
    )

    text = re.sub(r"\b(row|r)\.get\((\d+)\)", r"\1.get_idx::<i64>(\2)", text)

    # get_idx with turbofish _ is invalid
    text = text.replace("get_idx::<_>", "get_idx")

    return text


def main():
    changed = []
    for path in sorted(SRC.rglob("*.rs")):
        rel = str(path.relative_to(SRC)).replace("\\", "/")
        original = path.read_text(encoding="utf-8")
        updated = fix_content(original, rel)
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            changed.append(rel)
    print(f"Updated {len(changed)} files")
    for f in changed:
        print(f"  {f}")


if __name__ == "__main__":
    main()
