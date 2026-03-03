<script lang="ts">
  /**
   * RecentActivityWidget
   * 
   * Muestra actividad reciente del sistema.
   */
  import { Activity, FileText, User, Settings, ImageIcon } from "lucide-svelte";
  
  interface Props {
    limit?: number;
  }
  
  let { limit = 5 }: Props = $props();
  
  // Datos de ejemplo
  const activities = [
    { type: "post", action: "Published", item: "New Blog Post", user: "John Doe", time: "5 min ago", icon: FileText },
    { type: "user", action: "Created", item: "New User Account", user: "System", time: "15 min ago", icon: User },
    { type: "media", action: "Uploaded", item: "5 images", user: "Jane Smith", time: "1 hour ago", icon: ImageIcon },
    { type: "settings", action: "Updated", item: "Site Settings", user: "Admin", time: "2 hours ago", icon: Settings },
    { type: "post", action: "Drafted", item: "Product Update", user: "John Doe", time: "3 hours ago", icon: FileText },
  ];
  
  function getIconColor(type: string) {
    switch (type) {
      case "post": return "bg-gremius-cyan/10 text-gremius-cyan";
      case "user": return "bg-gremius-green/10 text-gremius-green";
      case "media": return "bg-gremius-purple/10 text-gremius-purple";
      case "settings": return "bg-gremius-amber/10 text-gremius-amber";
      default: return "bg-gremius-border text-gremius-subtle";
    }
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h3 class="font-semibold text-gremius-text flex items-center gap-2">
      <Activity class="w-4 h-4 text-gremius-cyan" />
      Recent Activity
    </h3>
  </div>
  
  <!-- Activity List -->
  <div class="space-y-3">
    {#each activities.slice(0, limit) as activity}
      {@const Icon = activity.icon}
      <div class="flex items-start gap-3">
        <div class="w-8 h-8 rounded-lg {getIconColor(activity.type)} flex items-center justify-center shrink-0">
          <Icon class="w-4 h-4" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm text-gremius-text">
            <span class="font-medium">{activity.action}</span>
            <span class="text-gremius-text-dim">{activity.item}</span>
          </p>
          <p class="text-xs text-gremius-subtle mt-0.5">
            by {activity.user} • {activity.time}
          </p>
        </div>
      </div>
    {/each}
  </div>
  
  <button class="w-full text-center text-xs text-gremius-cyan hover:underline">
    View All Activity
  </button>
</div>

<style>
  .text-gremius-cyan { color: var(--gremius-color-cyan); }
  .text-gremius-green { color: var(--gremius-color-green); }
  .text-gremius-purple { color: var(--gremius-color-purple); }
  .text-gremius-amber { color: var(--gremius-color-amber); }
  .text-gremius-text { color: var(--gremius-color-text); }
  .text-gremius-text-dim { color: var(--gremius-color-text-dim); }
  .text-gremius-subtle { color: var(--gremius-color-subtle); }
  
  .bg-gremius-cyan\/10 { background-color: rgba(0, 229, 255, 0.1); }
  .bg-gremius-green\/10 { background-color: rgba(0, 230, 118, 0.1); }
  .bg-gremius-purple\/10 { background-color: rgba(179, 136, 255, 0.1); }
  .bg-gremius-amber\/10 { background-color: rgba(255, 171, 0, 0.1); }
  .bg-gremius-border { background-color: var(--gremius-color-border); }
</style>
