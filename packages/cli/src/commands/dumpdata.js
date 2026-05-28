import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { loadDatabase, closeDatabase } from '../utils/database.js';
import { findProjectRoot } from '../utils/project.js';
import { sql } from 'drizzle-orm';
export async function dumpdataCommand(grimoireName, options) {
    console.log(chalk.blue('💾 Dumping data...\n'));
    try {
        const { db, client } = await loadDatabase();
        const projectRoot = await findProjectRoot();
        const grimoiresPath = path.join(projectRoot, 'packages', 'grimoires');
        let tablesToDump = [];
        if (grimoireName) {
            // Dump específico de un grimoire
            const schemaPath = path.join(grimoiresPath, grimoireName, 'schema.ts');
            try {
                const content = await fs.readFile(schemaPath, 'utf-8');
                const matches = content.match(/pgTable\(['"]([^'"]+)['"]/g);
                if (matches) {
                    tablesToDump = matches.map(m => m.match(/['"]([^'"]+)['"]/)?.[1] || '');
                }
            }
            catch {
                console.error(chalk.red(`Grimoire "${grimoireName}" not found`));
                process.exit(1);
            }
        }
        else {
            // Dump de todas las tablas
            const tables = await db.execute(sql `
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename NOT LIKE '\_%'
      `);
            tablesToDump = tables.map((t) => t.tablename);
        }
        const dump = {};
        for (const table of tablesToDump) {
            if (!table)
                continue;
            console.log(chalk.gray(`  Dumping ${table}...`));
            const rows = await db.execute(sql.raw(`SELECT * FROM "${table}"`));
            dump[table] = rows;
        }
        const jsonData = JSON.stringify(dump, null, options.indent ? 2 : undefined);
        if (options.output) {
            await fs.writeFile(options.output, jsonData);
            console.log(chalk.green(`\n✅ Data saved to ${options.output}`));
        }
        else {
            console.log('\n' + jsonData);
        }
        const totalRows = Object.values(dump).reduce((sum, rows) => sum + rows.length, 0);
        console.log(chalk.gray(`\nDumped ${totalRows} row(s) from ${Object.keys(dump).length} table(s)`));
        await closeDatabase(client);
    }
    catch (error) {
        console.error(chalk.red('❌ Error dumping data:'), error);
        process.exit(1);
    }
}
//# sourceMappingURL=dumpdata.js.map