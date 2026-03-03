<script lang="ts">
  /**
   * WebhookStatusWidget
   * 
   * Muestra el estado de los webhooks configurados.
   */
  import { Webhook, CheckCircle, AlertCircle, Clock } from "lucide-svelte";
  
  interface Props {
    showFailedOnly?: boolean;
  }
  
  let { showFailedOnly = false }: Props = $props();
  
  // Datos de ejemplo
  const webhooks = [
    { name: "Discord Notifications", status: "active", lastDelivery: "2 min ago", success: 99.9 },
    { name: "Slack Integration", status: "active", lastDelivery: "5 min ago", success: 98.5 },
    { name: "Zapier Hook", status: "error", lastDelivery: "1 hour ago", success: 85.2 },
    { name: "Custom API", status: "pending", lastDelivery: "--", success: 0 },
  ];
  
  const filteredWebhooks = $derived(
    showFailedOnly ? webhooks.filter(w => w.status === "error") : webhooks
  );
  
  function getStatusIcon(status: string) {
    switch (status) {
      case "active": return CheckCircle;
      case "error": return AlertCircle;
      default: return Clock;
    }
  }
  
  function getStatusColor(status: string) {
    switch (status) {
      case "active": return "text-gremius-green";
      case "error": return "text-gremius-pink";
      default: return "text-gremius-amber";
    }
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h3 class="font-semibold text-gremius-text flex items-center gap-2">
      <Webhook class="w-4 h-4 text-gremius-cyan" />
      Webhook Status
    </h3>
    <span class="badge-purple text-[10px]">WEBHOOKS MODULE</span>
  </div>
  
  <!-- Summary Stats -->
  <div class="grid grid-cols-3 gap-2">
    <div class="text-center p-2 bg-gremius-bg rounded-lg">
      <p class="text-lg font-bold text-gremius-green">3</p>
      <p class="text-[10px] text-gremius-subtle">Active</p>
    </div>
    <div class="text-center p-2 bg-gremius-bg rounded-lg">
      <p class="text-lg font-bold text-gremius-pink">1</p>
      <p class="text-[10px] text-gremius-subtle">Failed</p>
    </div>
    <div class="text-center p-2 bg-gremius-bg rounded-lg">
      <p class="text-lg font-bold text-gremius-cyan">99.2%</p>
      <p class="text-[10px] text-gremius-subtle">Success</p>
    </div>
  </div>
  
  <!-- Webhook List -->
  <div class="space-y-2">
    {#each filteredWebhooks as webhook}
      {@const Icon = getStatusIcon(webhook.status)}
      <div class="flex items-center justify-between p-2 bg-gremius-bg rounded-lg">
        <div class="flex items-center gap-2">
          <Icon class="w-4 h-4 {getStatusColor(webhook.status)}" />
          <span class="text-sm text-gremius-text">{webhook.name}</span>
        </div>
        <div class="text-right">
          <p class="text-xs text-gremius-subtle">{webhook.lastDelivery}</p>
          {#if webhook.success > 0}
            <p class="text-[10px] {webhook.success > 95 ? 'text-gremius-green' : 'text-gremius-amber'}">
              {webhook.success}% success
            </p>
          {/if}
        </div>
      </div>
    {/each}
  </div>
  
  <button class="w-full btn-secondary text-xs">
    Manage Webhooks
  </button>
</div>

<style>
  .badge-purple {
    @apply inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider;
    background-color: rgba(179, 136, 255, 0.1);
    color: #b388ff;
    border: 1px solid rgba(179, 136, 255, 0.2);
  }
  
  .btn-secondary {
    @apply inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium;
    background-color: #18181b;
    border: 1px solid #27272a;
    color: #fafafa;
  }
  .btn-secondary:hover {
    background-color: #27272a;
  }
</style>
