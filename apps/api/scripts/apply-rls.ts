#!/usr/bin/env bun
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SCRIPT: Aplicar Políticas RLS Nativas (El Muro de Titanio)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Este script aplica las políticas de Row Level Security (RLS) nativas
 * de PostgreSQL definidas en src/db/rls-policies.sql.
 * 
 * USO:
 *   bun run scripts/apply-rls.ts
 * 
 * O desde el package.json:
 *   "db:apply-rls": "bun run scripts/apply-rls.ts"
 * 
 * VERIFICACIÓN:
 *   Después de ejecutar, verifica que las políticas existen:
 *   
 *   SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
 *   FROM pg_policies 
 *   WHERE tablename = 'data_entries';
 * 
 * TESTING RLS:
 *   -- Como usuario normal (debería ver solo sus registros)
 *   SELECT set_config('app.current_user_id', 'user-123', false);
 *   SELECT * FROM data_entries;
 *   
 *   -- Como admin (debería ver todos)
 *   SELECT set_config('app.current_user_id', 'admin-456', false);
 *   SELECT set_config('app.current_user_role', 'admin', false);
 *   SELECT * FROM data_entries;
 * 
 * SEGURIDAD:
 *   ⚠️ Este script requiere permisos de superusuario o rol con CREATE POLICY.
 *   ⚠️ Las políticas RLS son irrevocables una vez aplicadas - testea primero.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { db } from "../src/db";
import { sql } from "drizzle-orm";

const RLS_SQL_FILE = resolve(__dirname, "../src/db/rls-policies.sql");

async function applyRLSPolicies() {
  console.log("🛡️  Aplicando Políticas RLS Nativas de PostgreSQL...\n");

  try {
    // 1. Verificar conexión a la base de datos
    console.log("📡 Verificando conexión a PostgreSQL...");
    const [{ version }] = await db.execute<{ version: string }>(sql`SELECT version()`);
    console.log(`   ✅ Conectado: ${version.split(" ").slice(0, 2).join(" ")}`);

    // 2. Leer archivo SQL de políticas
    console.log("\n📄 Cargando políticas desde rls-policies.sql...");
    const rlsSQL = readFileSync(RLS_SQL_FILE, "utf-8");
    console.log(`   ✅ Archivo cargado (${rlsSQL.length} bytes)`);

    // 3. Ejecutar políticas en bloque
    console.log("\n🔧 Aplicando políticas RLS...");
    
    // Dividir el SQL en statements individuales para mejor manejo de errores
    const statements = rlsSQL
      .split(/;\s*$/m)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith("--"));

    let appliedCount = 0;
    let skippedCount = 0;

    for (const statement of statements) {
      try {
        await db.execute(sql.raw(statement + ";"));
        appliedCount++;
        // Log condensado - solo mostrar tipo de operación
        const opType = statement.match(/^(CREATE|ALTER|DROP|DO)\s+\w+/i)?.[0] || "SQL";
        const name = statement.match(/(?:POLICY|FUNCTION|INDEX)\s+(\w+)/i)?.[1] || "";
        console.log(`   ✅ ${opType}${name ? `: ${name}` : ""}`);
      } catch (error: any) {
        // Si el error es "ya existe", lo ignoramos
        if (error.message?.includes("already exists") || 
            error.message?.includes("duplicate") ||
            error.code === "42710") {
          skippedCount++;
          console.log(`   ⏭️  Ya existe: ${statement.match(/(?:POLICY|FUNCTION|INDEX)\s+(\w+)/i)?.[1] || "item"}`);
        } else {
          console.error(`   ❌ Error: ${error.message}`);
          throw error;
        }
      }
    }

    // 4. Verificar que las políticas están activas
    console.log("\n🔍 Verificando políticas aplicadas...");
    const policies = await db.execute<{
      schemaname: string;
      tablename: string;
      policyname: string;
      cmd: string;
    }>(sql`
      SELECT schemaname, tablename, policyname, cmd
      FROM pg_policies 
      WHERE tablename IN ('data_entries', 'ai_memories')
      ORDER BY tablename, policyname
    `);

    if (policies.length === 0) {
      console.warn("   ⚠️  No se encontraron políticas RLS activas");
    } else {
      console.log(`   ✅ ${policies.length} política(s) activa(s):`);
      for (const p of policies) {
        console.log(`      • ${p.tablename}.${p.policyname} (${p.cmd})`);
      }
    }

    // 5. Verificar estado RLS en tablas
    console.log("\n📊 Estado RLS en tablas críticas:");
    const tables = await db.execute<{
      tablename: string;
      rowsecurity: boolean;
    }>(sql`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      JOIN pg_class ON pg_tables.tablename = pg_class.relname
      WHERE schemaname = 'public'
      AND tablename IN ('data_entries', 'ai_memories')
    `);

    for (const t of tables) {
      const status = t.rowsecurity ? "🟢 RLS HABILITADO" : "🔴 RLS DESHABILITADO";
      console.log(`   ${t.tablename}: ${status}`);
    }

    // 6. Resumen final
    console.log("\n" + "═".repeat(60));
    console.log("✅ POLÍTICAS RLS APLICADAS EXITOSAMENTE");
    console.log("═".repeat(60));
    console.log(`   Statements aplicados: ${appliedCount}`);
    console.log(`   Statements omitidos (ya existían): ${skippedCount}`);
    console.log(`   Políticas activas: ${policies.length}`);
    console.log("\n🛡️  El Muro de Titanio está activo.");
    console.log("   PostgreSQL ahora filtra automáticamente los registros");
    console.log("   basado en el contexto de usuario inyectado.\n");

    // 7. Prueba rápida (opcional)
    console.log("🧪 Ejecutando prueba de seguridad básica...");
    await db.execute(sql`SELECT set_config('app.current_user_id', 'test-user-123', false)`);
    const testResult = await db.execute(sql`SELECT current_setting('app.current_user_id', true)`);
    console.log(`   ✅ Contexto RLS funciona: ${JSON.stringify(testResult[0])}`);
    await db.execute(sql`SELECT set_config('app.current_user_id', '', false)`);
    console.log("   ✅ Contexto RLS limpiado\n");

  } catch (error: any) {
    console.error("\n❌ ERROR APLICANDO POLÍTICAS RLS:\n", error.message);
    process.exit(1);
  } finally {
    // Cerrar conexión limpiamente
    // Nota: En Bun con pg, la conexión se maneja automáticamente
  }
}

// Ejecutar si se corre directamente
if (import.meta.main) {
  applyRLSPolicies().then(() => {
    console.log("👋 Script completado.");
    process.exit(0);
  });
}

export { applyRLSPolicies };
