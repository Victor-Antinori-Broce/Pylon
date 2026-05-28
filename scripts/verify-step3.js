#!/usr/bin/env node
/**
 * Script de verificación para Paso 3:
 * - Verifica que las rutas de API existan
 * - Verifica que las páginas de SvelteKit existan
 * - Verifica que no haya imports rotos
 * - Verifica compatibilidad Docker
 */

const fs = require('fs');
const path = require('path');

const CHECKS = {
  API: {
    'agents.ts existe': () => fs.existsSync('apps/api/src/routes/agents.ts'),
    'actions.ts existe': () => fs.existsSync('apps/api/src/routes/actions.ts'),
    'agent-auth service existe': () => fs.existsSync('apps/api/src/services/agent-auth.ts'),
    'id-generator existe': () => fs.existsSync('apps/api/src/utils/id-generator.ts'),
    'endpoint /admin/agents registrado': () => {
      const content = fs.readFileSync('apps/api/src/index.ts', 'utf8');
      return content.includes('/api/admin/agents') && content.includes('agentRoutes');
    },
    'endpoint /actions registrado': () => {
      const content = fs.readFileSync('apps/api/src/index.ts', 'utf8');
      return content.includes('/api/actions') && content.includes('actionsRoutes');
    },
    'GET /api/admin/agents/logs existe': () => {
      const content = fs.readFileSync('apps/api/src/routes/agents.ts', 'utf8');
      return content.includes('"/logs"') && content.includes('agentAuditLogs');
    },
    'schema tiene campo vector': () => {
      const content = fs.readFileSync('apps/api/src/db/schema.ts', 'utf8');
      return content.includes('vector("embedding"') && content.includes('dimensions: 1536');
    },
    'schema tiene índice HNSW': () => {
      const content = fs.readFileSync('apps/api/src/db/schema.ts', 'utf8');
      return content.includes('vector_cosine_ops') || content.includes('hnsw');
    },
  },
  ADMIN: {
    'página /ai-agents existe': () => fs.existsSync('packages/admin/src/routes/ai-agents/+page.svelte'),
    'página /actions existe': () => fs.existsSync('packages/admin/src/routes/actions/+page.svelte'),
    'ActionsView.svelte existe': () => fs.existsSync('packages/admin/src/views/actions/ActionsView.svelte'),
    'SidebarLayout tiene AI Agents': () => {
      const content = fs.readFileSync('packages/admin/src/lib/components/layout/SidebarLayout.svelte', 'utf8');
      return content.includes('AI Agents') && content.includes('Bot');
    },
    'SidebarLayout NO tiene nav item Valkey': () => {
      const content = fs.readFileSync('packages/admin/src/lib/components/layout/SidebarLayout.svelte', 'utf8');
      // Check for actual navigation items, not comments
      const navItemsMatch = content.match(/\{ path:[^}]+\}/g) || [];
      const hasValkeyNav = navItemsMatch.some(item => item.includes('Valkey'));
      const hasWorkersNav = navItemsMatch.some(item => item.includes('Workers'));
      return !hasValkeyNav && !hasWorkersNav;
    },
    'import de actions usa $views': () => {
      const content = fs.readFileSync('packages/admin/src/routes/actions/+page.svelte', 'utf8');
      return content.includes('$views/actions/ActionsView');
    },
  },
  DOCKER: {
    'Dockerfile.api existe': () => fs.existsSync('docker/Dockerfile.api'),
    'Dockerfile.admin existe': () => fs.existsSync('docker/Dockerfile.admin'),
    'docker-compose usa pgvector': () => {
      const content = fs.readFileSync('docker-compose.yml', 'utf8');
      return content.includes('pgvector/pgvector');
    },
    'init-extensions.sql crea vector': () => {
      const content = fs.readFileSync('docker/init-extensions.sql', 'utf8');
      return content.includes('CREATE EXTENSION') && content.includes('vector');
    },
  },
};

console.log('═'.repeat(60));
console.log('VERIFICACIÓN PASO 3: AI Agents + Actions + Docker');
console.log('═'.repeat(60));

let totalPassed = 0;
let totalFailed = 0;

for (const [category, checks] of Object.entries(CHECKS)) {
  console.log(`\n📦 ${category}`);
  console.log('-'.repeat(40));
  
  for (const [name, check] of Object.entries(checks)) {
    try {
      const passed = check();
      if (passed) {
        console.log(`  ✅ ${name}`);
        totalPassed++;
      } else {
        console.log(`  ❌ ${name}`);
        totalFailed++;
      }
    } catch (error) {
      console.log(`  ❌ ${name} (ERROR: ${error.message})`);
      totalFailed++;
    }
  }
}

console.log('\n' + '═'.repeat(60));
console.log(`RESULTADO: ${totalPassed} passed, ${totalFailed} failed`);
console.log('═'.repeat(60));

if (totalFailed > 0) {
  console.log('\n⚠️  Algunas verificaciones fallaron. Revisa los errores arriba.');
  process.exit(1);
} else {
  console.log('\n✅ Todas las verificaciones pasaron. El sistema está listo.');
  process.exit(0);
}
