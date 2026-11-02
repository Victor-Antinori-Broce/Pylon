<!--
  Auditoría de la aprobación humana (fase F): quién encendió o apagó cada
  interruptor y cuándo, quién propuso, quién aprobó o rechazó, y el resultado.
-->
<script lang="ts">
  import { t, localeFormato } from "$lib/i18n";
  import { RefreshCw } from "lucide-svelte";
  import { onMount } from "svelte";

  import Button from "$lib/components/ui/Button.svelte";
  import { listApprovalAudit } from "$lib/services/approvals";
  import type { ApprovalAuditEvent } from "$lib/types/approvals";

  let eventos = $state<ApprovalAuditEvent[]>([]);
  let cargando = $state(true);
  let error = $state<string | null>(null);

  onMount(cargar);

  async function cargar() {
    try {
      cargando = true;
      error = null;
      eventos = (await listApprovalAudit({ limit: 200 })).events;
    } catch (e) {
      error = e instanceof Error ? e.message : t("approvals.errorLoading");
    } finally {
      cargando = false;
    }
  }

  const fecha = (v: string) => new Date(v).toLocaleString(localeFormato());

  /** Una línea legible de los detalles de cada acción. */
  function resumen(e: ApprovalAuditEvent): string {
    const d = e.details ?? {};
    switch (e.action) {
      case "approval_settings_changed": {
        const antes = (d.before ?? {}) as Record<string, unknown>;
        const despues = (d.after ?? {}) as Record<string, unknown>;
        const cambios = Object.keys(despues).filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(despues[k]));
        return cambios
          .map((k) =>
            k === "enabled"
              ? t("approvals.auditGlobal", { state: despues.enabled ? t("approvals.globalOn") : t("approvals.globalOff") })
              : t("approvals.auditChanged", { field: k })
          )
          .join(" · ");
      }
      case "approval_mode_changed":
        return t("approvals.auditMode", {
          before: t(`approvals.mode_${String(d.before)}`),
          after: t(`approvals.mode_${String(d.after)}`),
        });
      case "proposal_executed":
      case "proposal_failed":
        return [d.status != null ? t("approvals.auditStatus", { status: String(d.status) }) : "", d.error ? String(d.error) : ""]
          .filter(Boolean)
          .join(" · ");
      case "proposal_approved":
      case "proposal_rejected":
        return d.comment ? t("approvals.commentShown", { comment: String(d.comment) }) : "";
      default:
        return "";
    }
  }

  const CLASE: Record<string, string> = {
    approval_settings_changed: "text-indigo-300",
    approval_mode_changed: "text-indigo-300",
    proposal_created: "text-amber-300",
    proposal_approved: "text-emerald-300",
    proposal_executed: "text-emerald-300",
    proposal_rejected: "text-zinc-300",
    proposal_failed: "text-red-300",
    proposal_expired: "text-zinc-500",
    promotion_submitted: "text-amber-300",
    promotion_activated: "text-emerald-300",
    promotion_watch_passed: "text-emerald-300",
    promotion_rejected: "text-zinc-300",
    promotion_rolled_back: "text-red-300",
    promotion_manual_edit: "text-indigo-300",
    promotion_activation_failed: "text-red-300",
    promotion_activation_blocked: "text-amber-300",
    promotion_settings_changed: "text-indigo-300",
    promotion_mode_changed: "text-indigo-300",
  };
</script>

<div class="space-y-3" data-testid="approvals-audit">
  <div class="flex items-center gap-3">
    <p class="text-xs text-zinc-500 flex-1">{t("approvals.auditHelp")}</p>
    <Button variant="ghost" size="sm" onclick={cargar}>
      <RefreshCw size={14} class="mr-1" />{t("approvals.refresh")}
    </Button>
  </div>
  {#if cargando}
    <div class="flex items-center justify-center h-24">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
    </div>
  {:else if error}
    <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>
  {:else if eventos.length === 0}
    <p class="text-sm text-zinc-500">{t("approvals.noEvents")}</p>
  {:else}
    <div class="overflow-x-auto border border-zinc-800 rounded-lg">
      <table class="w-full text-xs">
        <thead class="text-zinc-500">
          <tr>
            <th class="text-left px-3 py-2">{t("approvals.colWhen")}</th>
            <th class="text-left px-3 py-2">{t("approvals.colAction")}</th>
            <th class="text-left px-3 py-2">{t("approvals.colWho")}</th>
            <th class="text-left px-3 py-2">{t("approvals.colAgent")}</th>
            <th class="text-left px-3 py-2">{t("approvals.colDetails")}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-800/70">
          {#each eventos as e (e.id)}
            <tr data-testid="audit-row" data-action={e.action}>
              <td class="px-3 py-1.5 whitespace-nowrap text-zinc-400">{fecha(e.at)}</td>
              <td class="px-3 py-1.5 whitespace-nowrap {CLASE[e.action] ?? 'text-zinc-300'}">{t(`approvals.action_${e.action}`)}</td>
              <td class="px-3 py-1.5 text-zinc-300">
                {e.byName ?? (e.action === "proposal_created" || e.action === "promotion_submitted" ? (e.agentName ?? "—") : t("approvals.system"))}
              </td>
              <td class="px-3 py-1.5 text-zinc-400">{e.agentName ?? "—"}</td>
              <td class="px-3 py-1.5 text-zinc-400 min-w-0">
                {#if e.resource && e.action.startsWith("proposal_")}
                  <code class="text-zinc-300 break-all">{e.resource}</code>
                {/if}
                <span class="ml-1">{resumen(e)}</span>
                {#if e.proposalId && e.action.startsWith("proposal_")}
                  <a href="/approvals?id={e.proposalId}" class="ml-1 text-indigo-300 hover:underline">{t("approvals.open")}</a>
                {:else if e.proposalId && e.action.startsWith("promotion_") && e.resource?.startsWith("action:")}
                  <code class="text-zinc-300 break-all">{e.resource}</code>
                  <a href="/approvals?tab=promotion&version={e.proposalId}" class="ml-1 text-indigo-300 hover:underline">{t("approvals.open")}</a>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
