import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { loadDatabase, closeDatabase } from '../utils/database.js';
import { sql } from 'drizzle-orm';
export async function loaddataCommand(file) {
    console.log(chalk.blue('📥 Loading data...\n'));
    try {
        const { db, client } = await loadDatabase();
        const pgClient = client;
        // Leer archivo
        const filePath = path.resolve(file);
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        let totalLoaded = 0;
        for (const [table, rows] of Object.entries(data)) {
            if (rows.length === 0)
                continue;
            console.log(chalk.gray(`  Loading ${rows.length} row(s) into ${table}...`));
            // Desactivar constraints temporalmente
            await db.execute(sql.raw(`ALTER TABLE "${table}" DISABLE TRIGGER ALL`));
            // Limpiar tabla primero
            await db.execute(sql.raw(`DELETE FROM "${table}"`));
            // Insertar datos
            for (const row of rows) {
                const columns = Object.keys(row);
                const values = Object.values(row);
                const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
                await pgClient.unsafe(`INSERT INTO "${table}" (${columns.map(c => `\"${c}\"`).join(', ')}) VALUES (${placeholders})`, values);
            }
            // Reactivar constraints
            await db.execute(sql.raw(`ALTER TABLE "${table}" ENABLE TRIGGER ALL`));
            totalLoaded += rows.length;
        }
        console.log(chalk.green(`\n✅ Loaded ${totalLoaded} row(s) into ${Object.keys(data).length} table(s)`));
        await closeDatabase(client);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            console.error(chalk.red(`❌ File not found: ${file}`));
        }
        else if (error instanceof SyntaxError) {
            console.error(chalk.red('❌ Invalid JSON file'));
        }
        else {
            console.error(chalk.red('❌ Error loading data:'), error.message);
        }
        process.exit(1);
    }
}
//# sourceMappingURL=loaddata.js.map