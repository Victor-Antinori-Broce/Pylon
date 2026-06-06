<script lang="ts">
  import { Monitor, Tablet, Smartphone } from "lucide-svelte";

  interface Props {
    title?: string;
    content?: string;
    excerpt?: string;
    featuredImageUrl?: string;
    slug?: string;
    authorName?: string;
    publishedAt?: string;
    status?: string;
  }

  const {
    title = "",
    content = "",
    excerpt = "",
    featuredImageUrl = "",
    slug = "",
    authorName = "",
    publishedAt = "",
    status = ""
  }: Props = $props();

  type Viewport = "desktop" | "tablet" | "mobile";
  let viewport = $state<Viewport>("desktop");

  const viewportWidths = {
    desktop: "100%",
    tablet: "768px",
    mobile: "375px"
  };

  const htmlContent = $derived.by(() => {
    const dateText = publishedAt
      ? new Date(publishedAt).toLocaleDateString()
      : "";
    const metaParts = [
      authorName ? `By ${authorName}` : "",
      dateText,
      status ? status.charAt(0).toUpperCase() + status.slice(1) : ""
    ].filter(Boolean);

    return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #1f2937;
    background: #ffffff;
    padding: 2rem 1rem;
  }
  .container { max-width: 720px; margin: 0 auto; }
  .featured-image {
    width: 100%;
    height: 300px;
    object-fit: cover;
    border-radius: 12px;
    margin-bottom: 1.5rem;
  }
  h1 {
    font-size: 2rem;
    font-weight: 800;
    line-height: 1.2;
    margin-bottom: 0.75rem;
    color: #111827;
  }
  .meta {
    font-size: 0.875rem;
    color: #6b7280;
    margin-bottom: 1.5rem;
  }
  .excerpt {
    font-size: 1.125rem;
    color: #4b5563;
    font-style: italic;
    margin-bottom: 1.5rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
  }
  .content {
    font-size: 1.125rem;
    color: #374151;
    white-space: pre-wrap;
  }
  .content p { margin-bottom: 1rem; }
</style>
</head>
<body>
  <div class="container">
    ${featuredImageUrl ? `<img src="${featuredImageUrl}" class="featured-image" alt="" />` : ""}
    <h1>${title || "Untitled Post"}</h1>
    ${metaParts.length ? `<div class="meta">${metaParts.join(" &bull; ")}</div>` : ""}
    ${excerpt ? `<div class="excerpt">${excerpt}</div>` : ""}
    <div class="content">${(content || "").replace(/\n/g, "<br/>")}</div>
  </div>
</body>
</html>
    `.trim();
  });
</script>

<div class="flex flex-col h-full bg-gremius-bg">
  <!-- Toolbar -->
  <div class="flex items-center justify-between px-4 py-2 border-b border-gremius-border bg-gremius-card/50 shrink-0">
    <span class="text-xs font-medium text-gremius-subtle uppercase tracking-wider">Live Preview</span>
    <div class="flex items-center gap-1">
      <button
        class="p-1.5 rounded-md transition-colors {viewport === 'desktop' ? 'bg-gremius-cyan/10 text-gremius-cyan' : 'text-gremius-subtle hover:text-gremius-text hover:bg-gremius-border/30'}"
        onclick={() => viewport = 'desktop'}
        aria-label="Desktop view"
      >
        <Monitor class="w-4 h-4" />
      </button>
      <button
        class="p-1.5 rounded-md transition-colors {viewport === 'tablet' ? 'bg-gremius-cyan/10 text-gremius-cyan' : 'text-gremius-subtle hover:text-gremius-text hover:bg-gremius-border/30'}"
        onclick={() => viewport = 'tablet'}
        aria-label="Tablet view"
      >
        <Tablet class="w-4 h-4" />
      </button>
      <button
        class="p-1.5 rounded-md transition-colors {viewport === 'mobile' ? 'bg-gremius-cyan/10 text-gremius-cyan' : 'text-gremius-subtle hover:text-gremius-text hover:bg-gremius-border/30'}"
        onclick={() => viewport = 'mobile'}
        aria-label="Mobile view"
      >
        <Smartphone class="w-4 h-4" />
      </button>
    </div>
  </div>

  <!-- Preview Canvas -->
  <div class="flex-1 overflow-auto p-4 flex justify-center bg-gremius-bg/50">
    <div
      class="h-full bg-white rounded-lg shadow-lg overflow-hidden transition-all duration-300 border border-gremius-border"
      style="width: {viewportWidths[viewport]};"
    >
      <iframe
        title="Post Preview"
        srcdoc={htmlContent}
        class="w-full h-full border-0"
        sandbox="allow-scripts"
      ></iframe>
    </div>
  </div>
</div>
