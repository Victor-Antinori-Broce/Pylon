import fs from 'fs/promises';
import path from 'path';
export async function findProjectRoot(cwd = process.cwd()) {
    let current = cwd;
    while (true) {
        try {
            await fs.access(path.join(current, 'pnpm-workspace.yaml'));
            return current;
        }
        catch {
            const parent = path.dirname(current);
            if (parent === current) {
                // Fallback: usar cwd si no encontramos pnpm-workspace.yaml
                return cwd;
            }
            current = parent;
        }
    }
}
//# sourceMappingURL=project.js.map