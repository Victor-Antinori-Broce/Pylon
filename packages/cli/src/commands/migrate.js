import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { sql } from 'drizzle-orm';
import { loadDatabase, closeDatabase } from '../utils/database.js';
import { findProjectRoot } from '../utils/project.js';
export async function migrateCommand(options) {
    try {
        const { db, client } = await loadDatabase();
        // Asegurar que tabla de migraciones existe
        await ensureMigrationsTable(db);
        if (options.status) {
            await showStatus(db);
            await closeDatabase(client);
            return;
        }
        if (options.rollback) {
            await rollbackLastMigration(db);
            await closeDatabase(client);
            return;
        }
        // Aplicar migraciones pendientes
        await applyMigrations(db, options.fake);
        await closeDatabase(client);
    }
    catch (error) {
        console.error(chalk.red('❌ Error:'), error);
        process.exit(1);
    }
}
async function ensureMigrationsTable(db) {
    await db.execute(sql `
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      grimoire TEXT NOT NULL,
      name TEXT NOT NULL,
      applied_at TIMESTAMP DEFAULT NOW(),
      checksum TEXT NOT NULL
    )
  `);
}
async function showStatus(db) {
    console.log(chalk.blue('📊 Migration Status\n'));
    const projectRoot = await findProjectRoot();
    const grimoiresPath = path.join(projectRoot, 'packages', 'grimoires');
    const grimoires = await fs.readdir(grimoiresPath);
    for (const grimoire of grimoires) {
        const migrationsDir = path.join(grimoiresPath, grimoire, 'migrations');
        try {
            await fs.access(migrationsDir);
        }
        catch {
            continue;
        }
        console.log(chalk.yellow(`${grimoire}:`));
        const applied = await db.execute(sql `
      SELECT name, applied_at FROM _migrations 
      WHERE grimoire = ${grimoire}
      ORDER BY applied_at
    `);
        const appliedNames = new Set(applied.map((m) => m.name));
        const files = await fs.readdir(migrationsDir);
        files.sort();
        for (const file of files) {
            if (!file.endsWith('.sql') && !file.endsWith('.ts'))
                continue;
            const name = file.replace(/\.(sql|ts)$/, '');
            const isApplied = appliedNames.has(name);
            const icon = isApplied ? chalk.green('✓') : chalk.gray('○');
            const status = isApplied ? chalk.green('[APPLIED]') : chalk.yellow('[PENDING]');
            console.log(`  ${icon} ${name} ${status}`);
        }
        console.log();
    }
}
async function applyMigrations(db, fake = false) {
    console.log(chalk.blue('🚀 Applying migrations...\n'));
    const projectRoot = await findProjectRoot();
    const grimoiresPath = path.join(projectRoot, 'packages', 'grimoires');
    const grimoires = await fs.readdir(grimoiresPath);
    let appliedCount = 0;
    for (const grimoire of grimoires) {
        const migrationsDir = path.join(grimoiresPath, grimoire, 'migrations');
        try {
            await fs.access(migrationsDir);
        }
        catch {
            continue;
        }
        const applied = await db.execute(sql `
      SELECT name FROM _migrations 
      WHERE grimoire = ${grimoire}
    `);
        const appliedNames = new Set(applied.map((m) => m.name));
        const files = await fs.readdir(migrationsDir);
        const pendingFiles = files
            .filter((f) => f.endsWith('.sql') || f.endsWith('.ts'))
            .filter((f) => !appliedNames.has(f.replace(/\.(sql|ts)$/, '')))
            .sort();
        for (const file of pendingFiles) {
            const filepath = path.join(migrationsDir, file);
            const name = file.replace(/\.(sql|ts)$/, '');
            console.log(chalk.gray(`  Applying ${grimoire}/${name}...`));
            if (!fake) {
                if (file.endsWith('.sql')) {
                    const content = await fs.readFile(filepath, 'utf-8');
                    await db.execute(sql.raw(content));
                }
                else {
                    const module = await import(filepath);
                    const migration = module.default;
                    await migration.up(db);
                }
                const checksum = await calculateChecksum(filepath);
                await db.execute(sql `
          INSERT INTO _migrations (grimoire, name, checksum)
          VALUES (${grimoire}, ${name}, ${checksum})
        `);
            }
            console.log(chalk.green(`  ✓ Applied`));
            appliedCount++;
        }
    }
    if (appliedCount === 0) {
        console.log(chalk.green('\n✅ No pending migrations.'));
    }
    else {
        console.log(chalk.green(`\n✅ Applied ${appliedCount} migration(s).`));
    }
}
async function rollbackLastMigration(db) {
    console.log(chalk.blue('⏪ Rolling back last migration...\n'));
    const lastMigration = await db.execute(sql `
    SELECT grimoire, name FROM _migrations
    ORDER BY applied_at DESC
    LIMIT 1
  `);
    if (lastMigration.length === 0) {
        console.log(chalk.yellow('No migrations to rollback.'));
        return;
    }
    const { grimoire, name } = lastMigration[0];
    // Intentar .ts primero, luego .sql (los .sql no tienen rollback automático)
    const projectRoot = await findProjectRoot();
    let filepath = path.join(projectRoot, 'packages', 'grimoires', grimoire, 'migrations', `${name}.ts`);
    try {
        await fs.access(filepath);
    }
    catch {
        filepath = path.join(projectRoot, 'packages', 'grimoires', grimoire, 'migrations', `${name}.sql`);
        try {
            await fs.access(filepath);
        }
        catch {
            console.log(chalk.red(`Migration file not found for ${grimoire}/${name}`));
            return;
        }
    }
    console.log(chalk.gray(`  Rolling back ${grimoire}/${name}...`));
    if (filepath.endsWith('.sql')) {
        console.log(chalk.yellow(`  ⚠️ SQL migrations don't have automatic rollback. Please revert manually if needed.`));
    }
    else {
        const module = await import(filepath);
        const migration = module.default;
        await migration.down(db);
    }
    await db.execute(sql `
    DELETE FROM _migrations 
    WHERE grimoire = ${grimoire} AND name = ${name}
  `);
    console.log(chalk.green(`  ✓ Rolled back`));
}
async function calculateChecksum(filepath) {
    const crypto = await import('crypto');
    const content = await fs.readFile(filepath, 'utf-8');
    return crypto.createHash('md5').update(content).digest('hex');
}
//# sourceMappingURL=migrate.js.map