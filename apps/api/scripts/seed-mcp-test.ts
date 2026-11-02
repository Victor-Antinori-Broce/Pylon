// @ts-nocheck
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SEED SCRIPT: MCP Test - "Paso 0: Validación del Titanio"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Propósito: Crear identidad "DevBot" con token MCP válido para pruebas
 * de conexión con Claude Desktop.
 *
 * Uso: bun run apps/api/scripts/seed-mcp-test.ts
 */

import { createHash, randomBytes } from "crypto";

// Colores para consola
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
};

function log(message: string, color: keyof typeof colors = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Generador de API key compatible con id-generator.ts
function generateAgentApiKey(options: { type: string; randomLength?: number }): {
  plainKey: string;
  keyHash: string;
  keyPrefix: string;
} {
  const { type, randomLength = 32 } = options;
  const AGENT_ID_PREFIX = "kitsuden_agent";

  // Normalizar tipo
  const normalizedType = type
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  // Generar parte aleatoria
  const randomPart = randomBytes(randomLength).toString("base64url");

  // Construir key
  const plainKey = `${AGENT_ID_PREFIX}_${normalizedType}_${randomPart}`;
  const keyHash = createHash("sha256").update(plainKey).digest("hex");
  const keyPrefix = `${AGENT_ID_PREFIX}_${normalizedType}_****${randomPart.slice(-8)}`;

  return { plainKey, keyHash, keyPrefix };
}

async function seedMcpTest() {
  log("\n╔═══════════════════════════════════════════════════════════════╗", "cyan");
  log("║   🔐 PASO 0: VALIDACIÓN DEL TITANIO (Zero-Trust MCP)         ║", "cyan");
  log("╚═══════════════════════════════════════════════════════════════╝\n", "cyan");

  let dbConnected = false;
  let agentId = `agent_${randomBytes(8).toString("hex")}`;

  try {
    // Intentar importar y conectar a la base de datos
    log("📡 Paso 1: Verificando conexión a PostgreSQL...", "yellow");

    const { db } = await import("../src/db");

    try {
      const result = await db.execute<{ now: string }>("SELECT NOW() as now");
      if (result.rows && result.rows.length > 0) {
        log(`   ✅ Conexión exitosa - ${result.rows[0].now}\n`, "green");
        dbConnected = true;
      }
    } catch (connError: any) {
      log(
        `   ⚠️  No se pudo conectar a PostgreSQL: ${connError.message || "ECONNREFUSED"}`,
        "yellow"
      );
      log(`   💡 Asegúrate de que la base de datos esté corriendo:`, "yellow");
      log(`      docker compose up -d db\n`, "cyan");
    }

    // ───────────────────────────────────────────────────────────────────────
    // GENERAR TOKEN CON FORMATO kitsuden_agent_...
    // ───────────────────────────────────────────────────────────────────────
    log("🔑 Paso 2: Generando token MCP seguro...", "yellow");

    const apiKeyResult = generateAgentApiKey({
      type: "claude-desktop",
      randomLength: 32,
    });

    const plainToken = apiKeyResult.plainKey;
    const keyHash = apiKeyResult.keyHash;
    const keyPrefix = apiKeyResult.keyPrefix;

    log(`   ✅ Token generado: ${keyPrefix}...`, "green");
    log(`   🔒 Hash SHA-256: ${keyHash.substring(0, 16)}...\n`, "green");

    // ───────────────────────────────────────────────────────────────────────
    // SI HAY CONEXIÓN, INSERTAR EN BASE DE DATOS
    // ───────────────────────────────────────────────────────────────────────
    if (dbConnected) {
      const { db } = await import("../src/db");
      const { agentIdentities, agentApiKeys } = await import("../src/db/schema");
      const { eq } = await import("drizzle-orm");

      log("👤 Paso 3: Creando identidad 'DevBot' en base de datos...", "yellow");

      // Verificar si ya existe
      const existingAgent = await db.query.agentIdentities.findFirst({
        where: (table, { eq }) => eq(table.name, "DevBot"),
      });

      if (existingAgent) {
        log("   ⚠️  DevBot ya existe. Actualizando...", "yellow");
        agentId = existingAgent.id;

        await db
          .update(agentIdentities)
          .set({
            scopes: ["read:issues", "write:intake"],
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(agentIdentities.id, agentId));
      } else {
        // Crear nuevo agente
        const [newAgent] = await db
          .insert(agentIdentities)
          .values({
            name: "DevBot",
            description: "Agente de desarrollo para pruebas MCP con Claude Desktop",
            type: "claude-desktop",
            capabilities: ["mcp-connect", "tool-execution", "context-management"],
            systemPrompt:
              "Eres DevBot, un agente de desarrollo conectado a Kitsuden CMS. Tienes acceso a herramientas MCP para interactuar con el sistema.",
            allowedTools: ["read_dataset", "write_intake", "search_memories"],
            scopes: ["read:issues", "write:intake"],
            rateLimit: 120,
            isActive: true,
          })
          .returning();

        agentId = newAgent.id;
        log(`   ✅ DevBot creado con ID: ${agentId}`, "green");
      }

      log(`   📋 Scopes asignados: ["read:issues", "write:intake"]\n`, "green");

      // Insertar API Key
      log("🔐 Paso 4: Registrando API Key en base de datos...", "yellow");

      const existingKey = await db.query.agentApiKeys.findFirst({
        where: (table, { eq }) => eq(table.agentId, agentId),
      });

      if (existingKey) {
        log("   ⚠️  Ya existe una API key. Revocando y creando nueva...", "yellow");
        await db.delete(agentApiKeys).where(eq(agentApiKeys.id, existingKey.id));
      }

      const [newKey] = await db
        .insert(agentApiKeys)
        .values({
          agentId,
          keyHash,
          keyPrefix,
          expiresAt: null,
        })
        .returning();

      log(`   ✅ API Key registrada: ${newKey.id}`, "green");
      log(`   📅 Expira: Nunca (para pruebas de desarrollo)\n`, "green");

      // Verificación final
      log("✅ Paso 5: Verificando integridad de datos...", "yellow");

      const verification = await db.execute<{
        agent_count: number;
        key_count: number;
      }>(`
        SELECT 
          (SELECT COUNT(*) FROM agent_identities WHERE id = '${agentId}') as agent_count,
          (SELECT COUNT(*) FROM agent_api_keys WHERE agent_id = '${agentId}') as key_count
      `);

      const v = verification.rows?.[0];
      if (v && v.agent_count > 0 && v.key_count > 0) {
        log("   ✅ Datos verificados en PostgreSQL\n", "green");
      }

      await db.$client.end?.();
    } else {
      // Modo sin conexión - mostrar SQL para ejecutar manualmente
      log("👤 Paso 3 (MODO OFFLINE): Preparando SQL para ejecución manual...", "yellow");
      log(`   ⚠️  No se pudo conectar a la base de datos\n`, "yellow");

      log("════════════════════════════════════════════════════════════════", "bold");
      log("SCRIPT SQL PARA EJECUTAR MANUALMENTE:", "bold");
      log("════════════════════════════════════════════════════════════════\n", "bold");

      const sqlScript = `
-- Insertar DevBot en agent_identities
INSERT INTO agent_identities (
  id, name, description, type, capabilities, system_prompt, 
  allowed_tools, scopes, rate_limit, is_active, created_at, updated_at
) VALUES (
  '${agentId}',
  'DevBot',
  'Agente de desarrollo para pruebas MCP con Claude Desktop',
  'claude-desktop',
  '["mcp-connect", "tool-execution", "context-management"]',
  'Eres DevBot, un agente de desarrollo conectado a Kitsuden CMS.',
  '["read_dataset", "write_intake", "search_memories"]',
  '["read:issues", "write:intake"]',
  120,
  true,
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET 
  scopes = '["read:issues", "write:intake"]',
  is_active = true,
  updated_at = NOW();

-- Insertar API Key en agent_api_keys
INSERT INTO agent_api_keys (
  id, agent_id, key_hash, key_prefix, created_at, expires_at
) VALUES (
  gen_random_uuid(),
  '${agentId}',
  '${keyHash}',
  '${keyPrefix}',
  NOW(),
  NULL
);
`;
      log(sqlScript, "cyan");

      log("════════════════════════════════════════════════════════════════\n", "bold");
    }

    // ───────────────────────────────────────────────────────────────────────
    // MOSTRAR RESULTADO FINAL
    // ───────────────────────────────────────────────────────────────────────
    log("╔═══════════════════════════════════════════════════════════════╗", "cyan");
    log("║   🎉 PASO 0 COMPLETADO - TOKEN MCP GENERADO                  ║", "cyan");
    log("╚═══════════════════════════════════════════════════════════════╝\n", "cyan");

    log("════════════════════════════════════════════════════════════════", "bold");
    log("TOKEN MCP (GUARDAR EN LUGAR SEGURO):", "bold");
    log("════════════════════════════════════════════════════════════════", "bold");
    log(`\n${plainToken}\n`, "cyan");

    log("════════════════════════════════════════════════════════════════", "bold");
    log("CONFIGURACIÓN PARA CLAUDE DESKTOP:", "bold");
    log("════════════════════════════════════════════════════════════════\n", "bold");

    const claudeConfig = {
      mcpServers: {
        kitsuden: {
          command: "bun",
          args: ["run", "/path/to/kitsuden/apps/api/src/mcp-server.ts"],
          env: {
            KITSUDEN_API_TOKEN: plainToken,
            KITSUDEN_API_URL: "http://localhost:3001",
            NODE_ENV: "development",
          },
        },
      },
    };

    log("Copia este bloque en tu archivo claude_desktop_config.json:\n", "yellow");
    log(JSON.stringify(claudeConfig, null, 2), "cyan");

    log("\n════════════════════════════════════════════════════════════════", "bold");
    log("UBICACIÓN DEL ARCHIVO DE CONFIGURACIÓN:", "bold");
    log("════════════════════════════════════════════════════════════════\n", "bold");
    log("Windows: %APPDATA%\\Claude\\claude_desktop_config.json", "cyan");
    log("macOS: ~/Library/Application Support/Claude/claude_desktop_config.json", "cyan");
    log("Linux: ~/.config/Claude/claude_desktop_config.json\n", "cyan");

    log("════════════════════════════════════════════════════════════════", "bold");
    log("PRUEBA DE CONEXIÓN:", "bold");
    log("════════════════════════════════════════════════════════════════\n", "bold");

    log("1. Asegúrate de que el servidor Kitsuden esté corriendo:", "reset");
    log("   cd apps/api && bun run dev\n", "cyan");

    log("2. Abre Claude Desktop", "reset");
    log("3. Ve a Config > Developer > Edit Config", "reset");
    log("4. Pega la configuración JSON anterior", "reset");
    log("5. Reinicia Claude Desktop", "reset");
    log("6. Escribe: 'Lista las herramientas que tienes disponibles'\n", "reset");

    log("════════════════════════════════════════════════════════════════", "bold");
    log("VALIDACIÓN ZERO-TRUST:", "bold");
    log("════════════════════════════════════════════════════════════════\n", "bold");

    log("✅ El middleware validará:", "green");
    log("   • Formato del token: kitsuden_agent_claude-desktop_...", "reset");
    log("   • Hash SHA-256 en base de datos", "reset");
    log("   • Scopes del agente: [read:issues, write:intake]", "reset");
    log("   • Rate limiting por agente", "reset");
    log("   • Registro en agent_audit_logs\n", "reset");

    if (!dbConnected) {
      log("⚠️  ADVERTENCIA: Sin conexión a base de datos", "yellow");
      log("   El token se ha generado pero NO está registrado en la BD.", "yellow");
      log("   Ejecuta el script SQL mostrado arriba antes de usar el token.\n", "yellow");
    }

    log("════════════════════════════════════════════════════════════════\n", "bold");

    // Guardar en archivo de token
    const tokenInfo = `
═══════════════════════════════════════════════════════════════════
MCP TOKEN GENERADO - Paso 0: Validación del Titanio
Fecha: ${new Date().toISOString()}
Estado: ${dbConnected ? "Registrado en BD" : "PENDIENTE - Ejecutar SQL"}
═══════════════════════════════════════════════════════════════════

AGENTE:
  Name: DevBot
  ID: ${agentId}
  Type: claude-desktop
  Scopes: ["read:issues", "write:intake"]

TOKEN:
  ${plainToken}

CONFIGURACIÓN CLAUDE DESKTOP:
  Windows: %APPDATA%\\Claude\\claude_desktop_config.json
  macOS: ~/Library/Application Support/Claude/claude_desktop_config.json

PRUEBA:
  1. Iniciar servidor: cd apps/api && bun run dev
  2. Configurar Claude Desktop con el JSON proporcionado
  3. En Claude: "Lista las herramientas disponibles"

VALIDACIÓN:
  • Middleware Zero-Trust activo
  • Scopes validados en cada petición
  • Auditoría en agent_audit_logs
  • Rate limiting: 120 req/min

═══════════════════════════════════════════════════════════════════
`;

    // Escribir a progress.txt
    try {
      const fs = await import("fs");
      const path = await import("path");
      const progressPath = path.join(process.cwd(), "progress.txt");

      fs.writeFileSync(progressPath, tokenInfo);
      log(`📝 Token guardado en: ${progressPath}`, "green");
    } catch (fsError) {
      log(`⚠️  No se pudo guardar en progress.txt`, "yellow");
    }

    return {
      success: true,
      dbConnected,
      agentId,
      token: plainToken,
      scopes: ["read:issues", "write:intake"],
    };
  } catch (error: any) {
    log(`\n❌ ERROR: ${error.message}\n`, "red");
    console.error(error);
    process.exit(1);
  }
}

// Ejecutar
seedMcpTest()
  .then((result) => {
    if (result.dbConnected) {
      log("✨ Script completado - Token registrado en base de datos", "green");
    } else {
      log("✨ Script completado - EJECUTAR SQL MANUALMENTE", "yellow");
    }
    process.exit(0);
  })
  .catch((error) => {
    log(`✨ Error fatal: ${error.message}`, "red");
    process.exit(1);
  });
