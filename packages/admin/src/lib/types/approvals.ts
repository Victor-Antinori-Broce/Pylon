/**
 * Aprobación humana (fase F): lo que devuelve `/api/approvals` y
 * `/api/proposals` (apps/api/src/routes/aprobaciones.ts).
 */

export type ProposalStatus = "pending" | "executing" | "executed" | "failed" | "rejected" | "expired";
export type ApprovalMode = "inherit" | "propose" | "direct";
/** Qué retiene `propose`: todo menos los POST de solo lectura, o todo. */
export type ProposeRetention = "selective" | "strict";

export interface ProposalResult {
  status: number | null;
  contentType: string | null;
  body: unknown;
  error: string | null;
}

export interface Proposal {
  id: string;
  status: ProposalStatus;
  reason: "sensitive" | "propose_only";
  channel: "rest" | "mcp";
  method: string;
  path: string;
  tool: string | null;
  operation: string | null;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  comment: string | null;
  executedAt: string | null;
  statusUrl: string;
  agentId: string;
  agentName: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  /** Fase F: el firmante humano del agente (al proponer y, ejecutada, el usado). */
  sponsorUserId?: string | null;
  sponsorName?: string | null;
  result?: ProposalResult | null;
}

export interface DiffChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface ProposalDiff {
  kind: "create" | "update" | "replace" | "delete" | "tool" | "promotion";
  changes?: DiffChange[];
  current?: unknown;
  proposed?: unknown;
  arguments?: unknown;
  currentUnavailable?: number | string;
  /** Fase I (`kind: "promotion"`): la versión de código y el resumen de su camino. */
  versionId?: string;
  versionNumber?: number;
  target?: { slug: string; name: string; actionId: string | null };
  decision?: { ruta: string; motivos: string[] } | null;
  tests?: { total: number; passed: number; failed: number; errored: number } | null;
  scan?: { passed: boolean } | null;
}

/** Una imagen retenida de una subida (los bytes, por `proposalFileUrl`). */
export interface ProposalFile {
  id: string;
  field: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface ProposalDetail extends Proposal {
  /** Las imágenes de una subida retenida; vacío si no es una o si ya se borraron. */
  files?: ProposalFile[];
  keyId: string | null;
  body: unknown;
  contentType: string | null;
  idempotencyKey: string | null;
  scopes: string[];
  diff: ProposalDiff | null;
  /** Second opinion of an injection classifier (never decides). */
  injectionCheck?: { label: string; score: number; checkedAt: string } | null;
  konId: string | null;
  operationId: string | null;
  canDecide?: boolean;
  cannotDecideReason?: string | null;
}

export interface LegacyRule {
  method: string;
  path: string;
}

export interface ApprovalConfig {
  /** El interruptor MAESTRO: apagado, nadie pide aprobación. */
  enabled: boolean;
  proposeRetention: ProposeRetention;
  ttlHours: number;
  operations: Record<string, boolean>;
  legacyRules: LegacyRule[];
}

export interface ApprovalOperation {
  key: string;
  konId: string;
  kon: string;
  id: string;
  method: string;
  path: string;
  summary: string;
  default: boolean;
  override: boolean | null;
  sensitive: boolean;
  /** Un POST que el kon declara de solo lectura (la retención selectiva no lo retiene). */
  readOnly?: boolean;
}

export interface ApprovalTool {
  key: string;
  name: string;
  write: boolean;
  default: boolean;
  override: boolean | null;
  sensitive: boolean;
}

export interface ApprovalSettings {
  config: ApprovalConfig;
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAt: string | null;
  modes: ApprovalMode[];
  retentions?: ProposeRetention[];
  operations: ApprovalOperation[];
  mcpTools: ApprovalTool[];
  agents: { id: string; name: string; mode: ApprovalMode; isActive: boolean }[];
}

export interface ApprovalAuditEvent {
  id: string;
  at: string;
  action: string;
  agentId: string | null;
  agentName: string | null;
  proposalId: string | null;
  resource: string | null;
  by: string | null;
  byName: string | null;
  success: boolean;
  details: Record<string, unknown>;
}
