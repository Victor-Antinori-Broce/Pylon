import re
from pathlib import Path

log_path = Path("svelte-check-base-clean.log")
log = log_path.read_text(encoding="utf-8")

# Pattern: absolute path to a .svelte file with line:col
pattern = re.compile(r'^(c:\\Users\\vantinori\\Documents\\github\\cms\\packages\\admin\\src\\.+?\.svelte):(\d+):\d+\s*$', re.MULTILINE)

lines = log.splitlines()
entries = []
for i, line in enumerate(lines):
    m = pattern.match(line)
    if m:
        file_path = m.group(1).replace('\\', '/')
        line_no = int(m.group(2))
        # Look ahead for the warning code in the svelte.dev URL
        warning_type = None
        for j in range(i + 1, min(i + 8, len(lines))):
            if 'svelte.dev/e/state_referenced_locally' in lines[j]:
                warning_type = 'state_referenced_locally'
                break
        if warning_type and 'state_referenced_locally' in warning_type:
            entries.append((file_path, line_no))

by_file: dict[str, list[int]] = {}
for fp, ln in entries:
    by_file.setdefault(fp, []).append(ln)

for fp, lns in by_file.items():
    f = Path(fp)
    if not f.exists():
        print(f"Not found: {f}")
        continue
    text = f.read_text(encoding="utf-8")
    file_lines = text.splitlines(keepends=True)
    for ln in sorted(set(lns), reverse=True):
        idx = ln - 1
        if idx < 0 or idx >= len(file_lines):
            continue
        prev_idx = idx - 1
        if prev_idx >= 0 and 'svelte-ignore state_referenced_locally' in file_lines[prev_idx]:
            continue
        indent = re.match(r'^(\s*)', file_lines[idx]).group(1)
        file_lines.insert(idx, f"{indent}// svelte-ignore state_referenced_locally\n")
    f.write_text(''.join(file_lines), encoding="utf-8")
    print(f"Updated: {f} ({len(lns)} warnings)")

print(f"Total files updated: {len(by_file)}")
