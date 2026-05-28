// @ts-nocheck
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BENCHMARK FASE 2 - Performance QueryTranslator vs Consultas Separadas
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Compara el tiempo de respuesta de:
 * 1. Query con 3 niveles de expand (Auto-Join)
 * 2. 3 consultas separadas (simulando N+1)
 *
 * Ejecutar: npx tsx scripts/benchmark-fase2.ts
 */
import { db } from "../apps/api/src/db";
import { queryTranslator } from "../packages/engine/src/query";
import { agentIdentities } from "../apps/api/src/db/schema";
async function benchmark() {
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("BENCHMARK FASE 2: Auto-Join vs Consultas Separadas");
    console.log("═══════════════════════════════════════════════════════════════════\n");
    const results = [];
    // ═══════════════════════════════════════════════════════════════════════════════
    // TEST 1: Query con Expand (Anti N+1)
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log("Test 1: Query con Expand (Auto-Join)");
    console.log("--------------------------------------");
    const start1 = performance.now();
    let queryCount1 = 0;
    // Mock del contador de queries
    const originalQuery = db.query;
    // @ts-ignore
    db.query = new Proxy(originalQuery, {
        get(target, prop) {
            queryCount1++;
            return target[prop];
        },
    });
    try {
        const result = await queryTranslator(agentIdentities, {
            where: { isActive: true },
            expand: ["traces", "apiKeys", "memories"],
            limit: 10,
        });
        const duration1 = performance.now() - start1;
        results.push({
            name: "Query con Expand (Auto-Join)",
            durationMs: Math.round(duration1 * 100) / 100,
            queryCount: queryCount1 + 1, // +1 por la query principal
            rowsReturned: result.data.length,
        });
        console.log(`  Duración: ${duration1.toFixed(2)}ms`);
        console.log(`  Queries ejecutadas: ${queryCount1 + 1}`);
        console.log(`  Filas retornadas: ${result.data.length}`);
        console.log(`  Relaciones expandidas: ${result.meta.expandedRelations.join(", ")}\n`);
    }
    catch (error) {
        console.log(`  Error: ${error.message}\n`);
    }
    // ═══════════════════════════════════════════════════════════════════════════════
    // TEST 2: Consultas Separadas (N+1)
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log("Test 2: Consultas Separadas (N+1)");
    console.log("-----------------------------------");
    const start2 = performance.now();
    let queryCount2 = 0;
    try {
        // Query 1: Agentes
        const agents = await db.select().from(agentIdentities).where(eq(agentIdentities.isActive, true)).limit(10);
        queryCount2++;
        // Query 2: Traces para cada agente (N queries)
        for (const agent of agents) {
            await db.select().from(agentTraces).where(eq(agentTraces.agentId, agent.id));
            queryCount2++;
        }
        // Query 3: ApiKeys para cada agente (N queries)
        for (const agent of agents) {
            await db.select().from(agentApiKeys).where(eq(agentApiKeys.agentId, agent.id));
            queryCount2++;
        }
        // Query 4: Memories para cada agente (N queries)
        for (const agent of agents) {
            await db.select().from(agentMemory).where(eq(agentMemory.agentId, agent.id));
            queryCount2++;
        }
        const duration2 = performance.now() - start2;
        results.push({
            name: "Consultas Separadas (N+1)",
            durationMs: Math.round(duration2 * 100) / 100,
            queryCount: queryCount2,
            rowsReturned: agents.length,
        });
        console.log(`  Duración: ${duration2.toFixed(2)}ms`);
        console.log(`  Queries ejecutadas: ${queryCount2}`);
        console.log(`  Filas retornadas: ${agents.length}\n`);
    }
    catch (error) {
        console.log(`  Error: ${error.message}\n`);
    }
    // ═══════════════════════════════════════════════════════════════════════════════
    // RESULTADOS
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("RESULTADOS");
    console.log("═══════════════════════════════════════════════════════════════════\n");
    if (results.length === 2) {
        const autoJoin = results[0];
        const nPlusOne = results[1];
        console.log(`Auto-Join (Expand):    ${autoJoin.durationMs.toFixed(2)}ms (${autoJoin.queryCount} queries)`);
        console.log(`Consultas Separadas:   ${nPlusOne.durationMs.toFixed(2)}ms (${nPlusOne.queryCount} queries)`);
        console.log();
        const improvement = ((nPlusOne.durationMs - autoJoin.durationMs) / nPlusOne.durationMs * 100).toFixed(1);
        const queryReduction = ((nPlusOne.queryCount - autoJoin.queryCount) / nPlusOne.queryCount * 100).toFixed(1);
        console.log(`Mejora de performance: ${improvement}%`);
        console.log(`Reducción de queries:  ${queryReduction}%`);
        console.log();
        if (autoJoin.durationMs < nPlusOne.durationMs) {
            console.log("✅ Auto-Join es más rápido");
        }
        else {
            console.log("⚠️  En este caso particular N+1 fue más rápido (posible caché)");
        }
        console.log(`\n📊 Ratio N+1 vs Auto-Join: ${(nPlusOne.queryCount / autoJoin.queryCount).toFixed(1)}x más queries`);
    }
    else {
        console.log("No se pudieron completar todos los tests.");
    }
    console.log("\n═══════════════════════════════════════════════════════════════════");
    process.exit(0);
}
// Importaciones necesarias para el test N+1
import { agentTraces, agentApiKeys, agentMemory } from "../apps/api/src/db/schema";
import { eq } from "drizzle-orm";
benchmark().catch(console.error);
//# sourceMappingURL=benchmark-fase2.js.map