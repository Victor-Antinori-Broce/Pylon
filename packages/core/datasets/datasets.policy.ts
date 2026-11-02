/**
 * DataSets — Authorization Policy
 * ============================================================================
 *
 * Deny-by-default. Importar este módulo registra las policies "dataset" y
 * "dataset-entry".
 *
 * ── POR QUÉ ────────────────────────────────────────────────────────────────
 *
 * Las rutas del kon solo pedían SESIÓN (`requireAuth`), y el alta de cuentas
 * es pública. Con una cuenta recién creada se podía: reescribir o borrar
 * cualquier entrada de cualquier dataset (los datos de juego de las tres
 * webs), crear datasets, cambiar la `policyJson` de uno ajeno (asignación
 * masiva en `PATCH`), exportarlo todo saltándose la política de lectura y
 * guardar campos calculados — que se ejecutaban con `new Function`.
 *
 * El modelo ahora:
 *   · Definición del dataset (crear, editar, campos calculados, snapshots,
 *     exportar): el EQUIPO (`admin`/`editor`). La política (`policyJson`) solo
 *     la cambia `admin`, porque decide quién ve qué.
 *   · Borrar un dataset, importar y tocar índices: solo `admin`.
 *   · Leer: el equipo siempre; los demás según `policyJson.readAccess`.
 *   · Entradas: el equipo en cualquier dataset; los demás SOLO donde
 *     `policyJson.writeAccess` lo permite, y para editar o borrar, solo las
 *     suyas (`owner_id`).
 *
 * Un agente (`role: "agent"`) pasa con el scope `dataset:<acción>` o
 * `dataset-entry:<acción>` (ver `can` en el engine).
 *
 * Fase E — scopes POR DATASET (`datasets:<slug>:read|write|delete`, con
 * comodines `datasets:*:read`): abren ESE dataset para el agente aunque su
 * `policyJson` no lo haga, y una denegación (`!datasets:<slug>:*`) lo cierra
 * aunque la política lo abriera. Lo que se ve DENTRO lo siguen filtrando las
 * `rlsRules` de la política y la RLS de Postgres. Ver docs/agents/permissions.md.
 */
import { can, definePolicy, type AuthzUser } from "@kitsuden/engine";
import {
  accesoADataset,
  agenteEscribePorPolitica,
  checkReadAccess,
  checkWriteAccess,
  scopeDeDataset,
  type AccionDeDataset,
  type PolicyJson,
  type RLSUser,
} from "@kitsuden/shared";

export interface DatasetResource {
  id?: string;
  policyJson?: unknown;
}

export interface EntryResource {
  dataset: DatasetResource;
  entry?: { ownerId?: string | null } | null;
}

export const esStaff = (user: AuthzUser | null | undefined): boolean =>
  user?.role === "admin" || user?.role === "editor";

const esAdmin = (user: AuthzUser | null | undefined): boolean => user?.role === "admin";

const comoRls = (user: AuthzUser | null): RLSUser =>
  user?.id ? { id: String(user.id), role: user.role } : null;

const politica = (ds: DatasetResource | undefined): PolicyJson | null =>
  (ds?.policyJson ?? null) as PolicyJson | null;

/** ¿Puede este usuario (no del equipo) escribir entradas según la política? */
const escribePorPolitica = (user: AuthzUser | null, ds: DatasetResource | undefined): boolean => {
  if (!user?.id) return false;
  // An agent key is not a session: `writeAccess: "authenticated"` alone does not
  // let a read-only key write (the grants by scope are decided after this rule).
  if (user.role === "agent") return agenteEscribePorPolitica(user.scopes, politica(ds));
  return checkWriteAccess(politica(ds), comoRls(user));
};

export function registerDatasetsPolicy(): void {
  definePolicy<DatasetResource>("dataset", {
    view: (user, ds) => esStaff(user) || checkReadAccess(politica(ds), comoRls(user)),
    create: (user) => esStaff(user),
    update: (user) => esStaff(user),
    /** Cambiar `policyJson`: quién lee y quién escribe. */
    "change-policy": (user) => esAdmin(user),
    delete: (user) => esAdmin(user),
    export: (user) => esStaff(user),
    import: (user) => esAdmin(user),
    "manage-indexes": (user) => esAdmin(user),
  });

  definePolicy<EntryResource>("dataset-entry", {
    create: (user, r) => esStaff(user) || escribePorPolitica(user, r?.dataset),
    update: (user, r) =>
      esStaff(user) ||
      (escribePorPolitica(user, r?.dataset) &&
        !!r?.entry?.ownerId &&
        r.entry.ownerId === String(user?.id)),
    delete: (user, r) =>
      esStaff(user) ||
      (escribePorPolitica(user, r?.dataset) &&
        !!r?.entry?.ownerId &&
        r.entry.ownerId === String(user?.id)),
  });
}

registerDatasetsPolicy();

/** `datasets:<slug>:<acción>` del recurso que pasa un handler a `autorizar()`. */
export function scopeDeDatasetDe(
  recurso: unknown,
  accion: AccionDeDataset
): string | null {
  const r = recurso as { slug?: unknown; dataset?: { slug?: unknown } } | null | undefined;
  const slug = typeof r?.dataset?.slug === "string" ? r.dataset.slug : typeof r?.slug === "string" ? r.slug : null;
  return slug ? scopeDeDataset(slug, accion) : null;
}

/**
 * ¿Puede este usuario LEER el dataset (o, con `paraAccion`, llegar a él para
 * escribir)? Primero los scopes por dataset del agente (denegar gana; conceder
 * abre), y si no dicen nada, la política.
 */
export async function puedeVerDataset(
  user: AuthzUser | null,
  ds: DatasetResource & { slug?: string | null },
  /** Para escribir: `datasets:<slug>:write` (o `delete`) también deja LLEGAR al dataset. */
  paraAccion?: AccionDeDataset
): Promise<boolean> {
  const acceso = accesoADataset(user?.scopes, ds.slug ?? null, "read");
  if (acceso === "denegado") return false;
  if (acceso === "concedido") return true;
  if (paraAccion && accesoADataset(user?.scopes, ds.slug ?? null, paraAccion) === "concedido") return true;
  return can(user, "view", ds, "dataset");
}
