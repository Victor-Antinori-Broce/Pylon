/**
 * Lexical Rich Text → HTML Renderer
 *
 * Converts Payload's Lexical editor JSON output to HTML strings
 * using GremiusCMS design tokens.
 */

export function renderLexical(content: unknown): string {
  const root = (content as any)?.root;
  if (!root?.children) return "<p>No content available.</p>";
  return renderChildren(root.children);
}

function renderChildren(children: any[]): string {
  return children
    .map((child: any) => {
      if (child.type === "text") return renderTextNode(child);
      if (child.type === "linebreak") return "<br>";
      if (child.type === "link") {
        const url = child.fields?.url || "#";
        const inner = renderChildren(child.children || []);
        return `<a href="${url}" class="text-gremius-cyan underline hover:text-gremius-pink transition-colors">${inner}</a>`;
      }
      if (child.type === "paragraph")
        return `<p>${renderChildren(child.children || [])}</p>`;
      if (child.type === "heading") {
        const tag = child.tag || "h2";
        return `<${tag} class="font-display text-gremius-heading">${renderChildren(child.children || [])}</${tag}>`;
      }
      if (child.type === "list") {
        const tag = child.listType === "number" ? "ol" : "ul";
        return `<${tag}>${renderChildren(child.children || [])}</${tag}>`;
      }
      if (child.type === "listitem")
        return `<li>${renderChildren(child.children || [])}</li>`;
      if (child.type === "quote")
        return `<blockquote class="border-l-2 border-gremius-cyan pl-4 italic text-gremius-muted">${renderChildren(child.children || [])}</blockquote>`;

      if (child.children) return renderChildren(child.children);
      return "";
    })
    .join("");
}

function renderTextNode(node: any): string {
  let text: string = node.text || "";
  const fmt = node.format || 0;
  if (fmt & 1) text = `<strong>${text}</strong>`;
  if (fmt & 2) text = `<em>${text}</em>`;
  if (fmt & 8) text = `<u>${text}</u>`;
  if (fmt & 4) text = `<s>${text}</s>`;
  if (fmt & 16)
    text = `<code class="bg-gremius-surface px-1.5 py-0.5 rounded text-gremius-cyan font-mono text-sm">${text}</code>`;
  return text;
}
