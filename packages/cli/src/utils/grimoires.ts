import fs from 'fs/promises';
import path from 'path';
import { findProjectRoot } from './project.js';

export async function loadGrimoires(): Promise<{ models: Record<string, any> }> {
  const projectRoot = await findProjectRoot();
  const grimoiresPath = path.join(projectRoot, 'packages', 'grimoires');
  const models: Record<string, any> = {};
  
  try {
    const grimoires = await fs.readdir(grimoiresPath);
    
    for (const grimoire of grimoires) {
      const schemaPath = path.join(grimoiresPath, grimoire, 'schema.ts');
      
      try {
        const module = await import(schemaPath);
        
        // Extraer tablas exportadas
        for (const [key, value] of Object.entries(module)) {
          if (key !== 'default' && !key.startsWith('_')) {
            models[key] = value;
          }
        }
      } catch {
        // Ignorar si no tiene schema
      }
    }
  } catch {
    // Ignorar si no existe directorio
  }
  
  return { models };
}
