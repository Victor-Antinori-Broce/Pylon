<!--
  Modal Component
  Ventana modal con backdrop y animaciones
-->
<script lang="ts">
  import { X } from 'lucide-svelte';
  import { cn } from '$lib/utils';
  import { fade, scale } from 'svelte/transition';
  
  interface Props {
    open?: boolean;
    title?: string;
    description?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    showClose?: boolean;
    onClose?: () => void;
    onOpenChange?: (v: boolean) => void;
    children?: import('svelte').Snippet;
    footer?: import('svelte').Snippet;
  }
  
  let {
    open = $bindable(false),
    title = '',
    description,
    size = 'md',
    showClose = true,
    onClose,
    onOpenChange,
    children,
    footer
  }: Props = $props();
  
  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl'
  };
  
  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      open = false;
      onOpenChange?.(false);
      onClose?.();
    }
  }
  
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      open = false;
      onOpenChange?.(false);
      onClose?.();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    onclick={handleBackdropClick}
    transition:fade={{ duration: 150 }}
  >
    <!-- Modal -->
    <div
      class={cn(
        'w-full bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl',
        sizeClasses[size]
      )}
      transition:scale={{ duration: 150, start: 0.95 }}
    >
      <!-- Header -->
      {#if title}
        <div class="flex items-start justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <h3 class="text-lg font-semibold text-zinc-100">{title}</h3>
            {#if description}
              <p class="text-sm text-zinc-500 mt-1">{description}</p>
            {/if}
          </div>
          {#if showClose}
            <button
              class="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
              onclick={() => { open = false; onOpenChange?.(false); onClose?.(); }}
            >
              <X size={20} />
            </button>
          {/if}
        </div>
      {/if}
      
      <!-- Body -->
      <div class="px-6 py-4">
        {@render children?.()}
      </div>
      
      <!-- Footer -->
      {#if footer}
        <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}
