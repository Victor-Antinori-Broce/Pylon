import re
from pathlib import Path
import html

root = Path("src")
files = list(root.rglob("*.svelte"))
modified = 0


def slugify(text: str) -> str:
    text = re.sub(r"\{[^}]+\}", "", text)
    text = html.unescape(text)
    text = re.sub(r"[^a-zA-Z0-9\s]+", " ", text)
    text = text.strip().lower()
    words = text.split()
    return "-".join(words[:4]) or "field"


label_re = re.compile(r'<label\b([^>]*)>(.*?)</label>', re.DOTALL | re.IGNORECASE)
control_re = re.compile(
    r'<(input|select|textarea)\b([^>]*?)(/?)>',
    re.DOTALL | re.IGNORECASE,
)

for f in files:
    original = f.read_text(encoding="utf-8")
    text = original
    seen_ids: set[str] = set()
    replacements: list[tuple[int, int, str, int, int, str]] = []

    for label_match in label_re.finditer(text):
        label_attrs = label_match.group(1)
        label_content = label_match.group(2)
        label_start = label_match.start()
        label_end = label_match.end()

        if re.search(r'\bfor\s*=', label_attrs):
            continue
        if re.search(r'<(?:input|select|textarea)\b', label_content, re.IGNORECASE):
            continue

        window_start = label_end
        window = text[window_start:window_start + 1500]
        stripped = window.lstrip()
        offset = len(window) - len(stripped)

        div_open = re.match(r'<div(?:\s[^>]*)?>', stripped, re.IGNORECASE)
        if div_open:
            stripped = stripped[div_open.end():].lstrip()
            offset += div_open.end() + (len(window) - len(stripped) - offset - div_open.end())

        control_match = control_re.search(stripped)
        if not control_match:
            continue

        control_pos = window_start + offset + control_match.start()
        tag = control_match.group(1).lower()
        control_attrs = control_match.group(2)
        self_closing = control_match.group(3) == "/"

        if re.search(r'\bid\s*=', control_attrs):
            continue

        base = slugify(label_content)
        cid = base
        counter = 1
        while cid in seen_ids:
            cid = f"{base}-{counter}"
            counter += 1
        seen_ids.add(cid)

        attrs_stripped = label_attrs.rstrip()
        new_label_attrs = f'{attrs_stripped} for="{cid}"' if attrs_stripped.strip() else f' for="{cid}"'
        new_label = f'<label{new_label_attrs}>{label_content}</label>'

        ctrl_attrs_stripped = control_attrs.rstrip()
        new_control_attrs = f'{ctrl_attrs_stripped} id="{cid}"' if ctrl_attrs_stripped.strip() else f' id="{cid}"'
        if self_closing:
            new_control = f'<{tag}{new_control_attrs} />'
        else:
            new_control = f'<{tag}{new_control_attrs}>'

        replacements.append((
            label_start, label_end, new_label,
            control_pos, control_pos + len(control_match.group(0)), new_control,
        ))

    if not replacements:
        continue

    new_text = text
    for label_start, label_end, new_label, ctrl_start, ctrl_end, new_control in reversed(replacements):
        new_text = new_text[:ctrl_start] + new_control + new_text[ctrl_end:]
        new_text = new_text[:label_start] + new_label + new_text[label_end:]

    if new_text != original:
        f.write_text(new_text, encoding="utf-8")
        modified += 1
        print(f"Modified: {f}")

print(f"Total modified: {modified}")
