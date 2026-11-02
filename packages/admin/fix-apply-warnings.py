import re
from pathlib import Path

root = Path("src")
files = list(root.rglob("*.svelte"))
modified = 0

for f in files:
    text = f.read_text(encoding="utf-8")
    if "@apply" not in text:
        continue
    # Add ignore comment before each <style> block that doesn't already have one.
    # The regex matches a <style> opening tag followed by content containing @apply,
    # but only if the immediate preceding line is NOT the ignore comment.
    new_text = re.sub(
        r'(?<!<!-- svelte-ignore css-unknown-at-rule -->\n)(<style[^>]*>\s*\n(?:[^<]|<(?!/style>))*?@apply)',
        r'<!-- svelte-ignore css-unknown-at-rule -->\n\1',
        text,
        flags=re.DOTALL,
    )
    if new_text != text:
        f.write_text(new_text, encoding="utf-8")
        modified += 1
        print(f"Modified: {f}")

print(f"Total modified: {modified}")
