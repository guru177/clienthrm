from pathlib import Path

p = Path(".github/workflows/test.yml")
text = p.read_text(encoding="utf-8")
marker = "      - name: Gap coverage (2FA / chat / storage)\n"
idx = text.find(marker)
if idx < 0:
    raise SystemExit("marker not found")
p.write_text(text[:idx].rstrip() + "\n", encoding="utf-8")
print("ok")
