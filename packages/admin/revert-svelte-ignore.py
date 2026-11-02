from pathlib import Path

root = Path("src")
files = list(root.rglob("*.svelte"))
modified = 0

for f in files:
    text = f.read_text(encoding="utf-8")
    new_text = text.replace("<!-- svelte-ignore css-unknown-at-rule -->\n<style>", "<style>")
    new_text = new_text.replace("<!-- svelte-ignore css-unknown-at-rule -->\n<style ", "<style ")
    if new_text != text:
        f.write_text(new_text, encoding="utf-8")
        modified += 1
        print(f"Reverted: {f}")

print(f"Total reverted: {modified}")
