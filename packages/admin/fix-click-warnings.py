import re
from pathlib import Path

log_path = Path("svelte-check-v4-clean.log")
log = log_path.read_text(encoding="utf-8")

# Pattern: absolute path to a .svelte file with line:col
pattern = re.compile(
    r'^c:\\Users\\vantinori\\Documents\\github\\cms\\packages\\admin\\(src\\.+?\.svelte):(\d+):\d+\s*$',
    re.MULTILINE,
)

lines = log.splitlines()
entries = []
for i, line in enumerate(lines):
    m = pattern.match(line)
    if not m:
        continue
    file_path = m.group(1).replace('\\', '/')
    line_no = int(m.group(2))
    # Look ahead for the warning code
    warning_code = None
    for j in range(i + 1, min(i + 8, len(lines))):
        if 'svelte.dev/e/a11y_click_events_have_key_events' in lines[j]:
            warning_code = 'click'
            break
        if 'svelte.dev/e/a11y_no_static_element_interactions' in lines[j]:
            warning_code = 'role'
            break
        if 'svelte.dev/e/a11y_no_noninteractive_element_interactions' in lines[j]:
            warning_code = 'noninteractive'
            break
    if warning_code:
        entries.append((file_path, line_no))

by_file: dict[str, list[int]] = {}
for fp, ln in entries:
    by_file.setdefault(fp, []).append(ln)

ignore_comment = '<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->\n'

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
        # Check if already ignored
        prev_idx = idx - 1
        if prev_idx >= 0 and 'svelte-ignore' in file_lines[prev_idx]:
            continue
        indent = re.match(r'^(\s*)', file_lines[idx]).group(1)
        file_lines.insert(idx, f"{indent}{ignore_comment}")
    f.write_text(''.join(file_lines), encoding="utf-8")
    print(f"Updated: {f} ({len(lns)} warnings)")

print(f"Total files updated: {len(by_file)}")
