
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	export interface AppTypes {
		RouteId(): "/" | "/academy" | "/actions" | "/admin" | "/admin/connectors" | "/agents" | "/agents/traces" | "/agents/[id]" | "/ai-agents" | "/booking" | "/builder" | "/collections" | "/content" | "/content/edit" | "/dashboard" | "/data-viewer" | "/datasets" | "/datasets/new" | "/datasets/[id]" | "/datasets/[id]/edit" | "/datasets/[id]/entries" | "/directory" | "/directory/org-chart" | "/editor" | "/grimoires" | "/g" | "/g/[id]" | "/g/[id]/[viewId]" | "/mcp" | "/realms" | "/settings" | "/traces";
		RouteParams(): {
			"/agents/[id]": { id: string };
			"/datasets/[id]": { id: string };
			"/datasets/[id]/edit": { id: string };
			"/datasets/[id]/entries": { id: string };
			"/g/[id]": { id: string };
			"/g/[id]/[viewId]": { id: string; viewId: string }
		};
		LayoutParams(): {
			"/": { id?: string; viewId?: string };
			"/academy": Record<string, never>;
			"/actions": Record<string, never>;
			"/admin": Record<string, never>;
			"/admin/connectors": Record<string, never>;
			"/agents": { id?: string };
			"/agents/traces": Record<string, never>;
			"/agents/[id]": { id: string };
			"/ai-agents": Record<string, never>;
			"/booking": Record<string, never>;
			"/builder": Record<string, never>;
			"/collections": Record<string, never>;
			"/content": Record<string, never>;
			"/content/edit": Record<string, never>;
			"/dashboard": Record<string, never>;
			"/data-viewer": Record<string, never>;
			"/datasets": { id?: string };
			"/datasets/new": Record<string, never>;
			"/datasets/[id]": { id: string };
			"/datasets/[id]/edit": { id: string };
			"/datasets/[id]/entries": { id: string };
			"/directory": Record<string, never>;
			"/directory/org-chart": Record<string, never>;
			"/editor": Record<string, never>;
			"/grimoires": Record<string, never>;
			"/g": { id?: string; viewId?: string };
			"/g/[id]": { id: string; viewId?: string };
			"/g/[id]/[viewId]": { id: string; viewId: string };
			"/mcp": Record<string, never>;
			"/realms": Record<string, never>;
			"/settings": Record<string, never>;
			"/traces": Record<string, never>
		};
		Pathname(): "/" | "/academy" | "/actions" | "/admin/connectors" | "/agents" | "/agents/traces" | `/agents/${string}` & {} | "/ai-agents" | "/booking" | "/builder" | "/collections" | "/content/edit" | "/dashboard" | "/data-viewer" | "/datasets" | "/datasets/new" | `/datasets/${string}/edit` & {} | `/datasets/${string}/entries` & {} | "/directory" | "/directory/org-chart" | "/editor" | "/grimoires" | `/g/${string}` & {} | `/g/${string}/${string}` & {} | "/mcp" | "/realms" | "/settings" | "/traces";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/favicon.png" | string & {};
	}
}