import { db } from './src/db';
import { siteSettings } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function update() {
    await db.update(siteSettings).set({ activeTheme: 'gremio-cms' });
    console.log('Updated activeTheme');
    process.exit(0);
}
update();
