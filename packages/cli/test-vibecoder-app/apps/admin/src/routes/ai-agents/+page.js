import { redirect } from '@sveltejs/kit';
export function load() {
    throw redirect(307, '/agents');
}
//# sourceMappingURL=+page.js.map