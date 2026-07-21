#!/usr/bin/env python3
"""One-shot helper: align suite credentials to current local passwords."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPLACEMENTS = [
    ('"password": "password"', '"password": os.environ.get("HRM_PASSWORD", "Guru!1234")'),
    ("'password': 'password'", "'password': os.environ.get('HRM_PASSWORD', 'Guru!1234')"),
    (
        'PASSWORD = os.environ.get("HRM_PASSWORD", "password")',
        'PASSWORD = os.environ.get("HRM_PASSWORD", "Guru!1234")',
    ),
    (
        'os.environ.get("PLATFORM_ADMIN_PASSWORD", "retaildaddy@0123")',
        'os.environ.get("PLATFORM_ADMIN_PASSWORD", "LocalTest123!")',
    ),
]

for path in list(ROOT.glob("test-*.py")) + [
    ROOT / "local-smoke-test.py",
    ROOT / "module-create-test.py",
]:
    text = path.read_text(encoding="utf-8")
    orig = text
    for old, new in REPLACEMENTS:
        text = text.replace(old, new)
    if text != orig and "os.environ" in text and "import os" not in text:
        if "from __future__ import annotations" in text:
            text = text.replace(
                "from __future__ import annotations\n",
                "from __future__ import annotations\n\nimport os\n",
                1,
            )
        else:
            text = "import os\n" + text
    if text != orig:
        path.write_text(text, encoding="utf-8")
        print(f"updated {path.name}")
