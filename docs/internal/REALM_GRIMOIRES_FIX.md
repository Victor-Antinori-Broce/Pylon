# Fix: Activación de Grimoires Conectados a un Realm

## Problema

Cuando se activaba un realm (ej: `gremius-cms-realm`), los grimoires conectados a ese realm (ej: `grimoire-games`, `grimoire-esports`, `grimoire-streamers`) no se activaban correctamente.

## Causa Raíz

El problema estaba en `apps/api/src/lib/module-loader.ts`:

1. **Constante estática**: El `REALM_GRIMOIRE_KEYS` era un `Set` estático construido al inicio del archivo basándose únicamente en el registro hardcodeado (`GRIMOIRE_REGISTRY`).

2. **Desfase entre fuentes**: Los grimoires de realm se definen en dos lugares:
   - Hardcoded registry (`GRIMOIRE_REGISTRY` en `module-registry.ts`)
   - Archivo `realm.json` de cada realm (dinámico)

3. **Identificación incorrecta**: Cuando se cargaban grimoires dinámicamente desde `realm.json`, el código no los identificaba correctamente como grimoires de realm porque no estaban en el set estático.

### Código Problemático

```typescript
// Línea 117-121 - ANTES
const REALM_GRIMOIRE_KEYS = new Set(
  GRIMOIRE_REGISTRY
    .filter(g => g.category === "realm")
    .map(g => g.key)
);

// Línea 722 - ANTES
const isRealmGrimoire = REALM_GRIMOIRE_KEYS.has(grimoire.id) || REALM_GRIMOIRE_KEYS.has(cleanName);
```

## Solución

Se reemplazó la constante estática con una función asíncrona que:
1. Obtiene los grimoires del registro hardcodeado
2. Obtiene los grimoires del `realm.json` del realm activo
3. Combina ambos en un Set dinámico

### Cambios Realizados

**Archivo**: `apps/api/src/lib/module-loader.ts`

1. **Nueva función** (líneas 116-141):

```typescript
async function getRealmGrimoireKeys(activeRealm: string | null): Promise<Set<string>> {
  const keys = new Set<string>();
  
  // Add hardcoded registry realm grimoires
  for (const g of GRIMOIRE_REGISTRY.filter(g => g.category === "realm")) {
    keys.add(g.key);
    keys.add(g.key.replace(/^grimoire-/, ""));
  }
  
  // Add grimoires from active realm (from realm.json)
  if (activeRealm) {
    const realmGrimoires = await getRealmGrimoires(activeRealm);
    for (const grimoireId of realmGrimoires) {
      keys.add(grimoireId);
      keys.add(grimoireId.replace(/^grimoire-/, ""));
    }
  }
  
  return keys;
}
```

2. **Uso en loadGrimoires** (líneas 714-715):

```typescript
// Get dynamic realm grimoire keys for proper mounting
const realmGrimoireKeys = await getRealmGrimoireKeys(activeRealm);
```

3. **Verificación de isRealmGrimoire** (línea 725):

```typescript
const isRealmGrimoire = realmGrimoireKeys.has(grimoire.id) || realmGrimoireKeys.has(cleanName);
```

## Verificación

### Diagnóstico Previo

```bash
bun run scripts/diagnose-realm-grimoires.ts
```

Resultado: Los grimoires existen físicamente y están correctamente definidos en `realm.json`.

### Test de la Solución

```bash
bun run scripts/test-realm-grimoires-fix.ts
```

Resultado: 
- ✅ Los grimoires del realm se identifican correctamente
- ✅ Tanto el ID completo (`grimoire-games`) como el corto (`games`) funcionan
- ✅ Los grimoires que no son de realm se identifican correctamente como no-realm

## Impacto

Este fix asegura que:
1. Los grimoires definidos en `realm.json` se monten en la ruta correcta (`/api/{name}`)
2. Los grimoires del realm activo se carguen automáticamente cuando se activa el realm
3. La detección de grimoires de realm sea dinámica y no dependa solo del registro hardcodeado

## Notas Adicionales

- Los grimoires de realm se montan en `/api/{nombre}` (sin el prefijo `grimoire-`)
- Los grimoires normales se montan en `/api/custom/{nombre}`
- Esto permite URLs limpias como `/api/games` en lugar de `/api/custom/grimoire-games`
