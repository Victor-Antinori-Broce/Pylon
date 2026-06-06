<!--
  Token Display Component
  Muestra un token de agente de forma segura
  El token solo se muestra una vez (one-way)
-->
<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { cn } from '$lib/utils';
  import { Copy, Check, Eye, EyeOff, AlertTriangle } from 'lucide-svelte';
  
  interface Props {
    token?: string;
    tokenPrefix?: string;
    onCopy?: () => void;
  }
  
  const {
    token,
    tokenPrefix = 'grm_agent_',
    onCopy
  }: Props = $props();
  
  let showToken = $state(false);
  let copied = $state(false);
  let dismissed = $state(false);
  
  function copyToClipboard() {
    if (token) {
      navigator.clipboard.writeText(token);
      copied = true;
      onCopy?.();
      setTimeout(() => copied = false, 2000);
    }
  }
  
  function maskToken(t: string): string {
    if (t.length <= 12) return '•'.repeat(t.length);
    return t.slice(0, 8) + '•'.repeat(t.length - 12) + t.slice(-4);
  }
  
  const displayToken = $derived(token || `${tokenPrefix}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`);
  const isRevealed = $derived(showToken && !!token);
</script>

{#if token && !dismissed}
  <Modal
    open={true}
    title="🔐 Token de Agente Generado"
    description="Este token solo se mostrará una vez. Guárdalo en un lugar seguro."
    size="lg"
    onClose={() => dismissed = true}
  >
    <div class="space-y-4">
      <!-- Warning -->
      <div class="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
        <AlertTriangle class="text-amber-400 shrink-0 mt-0.5" size={18} />
        <div class="text-sm text-amber-200">
          <p class="font-medium">Importante</p>
          <p class="mt-1">El token se almacena como hash en la base de datos. No podrás verlo nuevamente después de cerrar esta ventana.</p>
        </div>
      </div>
      
      <!-- Token Display -->
      <div class="relative">
        <div class="flex items-center gap-2 p-4 bg-zinc-950 border border-zinc-800 rounded-lg font-mono text-sm">
          <button
            class="p-1 hover:bg-zinc-800 rounded transition-colors"
            onclick={() => showToken = !showToken}
          >
            {#if showToken}
              <EyeOff size={16} class="text-zinc-500" />
            {:else}
              <Eye size={16} class="text-zinc-500" />
            {/if}
          </button>
          
          <span class={cn('flex-1', !showToken && 'tracking-wider')}>
            {showToken ? displayToken : maskToken(displayToken)}
          </span>
          
          <Button
            variant="ghost"
            size="sm"
            onclick={copyToClipboard}
          >
            {#if copied}
              <Check size={16} class="text-emerald-400" />
            {:else}
              <Copy size={16} />
            {/if}
          </Button>
        </div>
      </div>
      
      <!-- Usage Example -->
      <div class="p-3 bg-zinc-950 rounded-lg">
        <span class="text-xs font-medium text-zinc-500 uppercase">Uso en API</span>
        <pre class="mt-2 text-xs text-zinc-400 overflow-x-auto">
Authorization: Bearer {showToken ? displayToken : maskToken(displayToken)}</pre>
      </div>
    </div>
    
    {#snippet footer()}
      <div class="flex justify-end gap-3">
        <Button
          variant="secondary"
          onclick={copyToClipboard}
        >
          {copied ? '¡Copiado!' : 'Copiar Token'}
        </Button>
        <Button
          variant="primary"
          onclick={() => dismissed = true}
        >
          Entendido, cerrar
        </Button>
      </div>
    {/snippet}
  </Modal>
{/if}

<!-- Compact display (when token is already saved) -->
{#if !token}
  <div class="flex items-center gap-2 text-sm text-zinc-500">
    <EyeOff size={14} />
    <span>Token oculto por seguridad</span>
  </div>
{/if}
