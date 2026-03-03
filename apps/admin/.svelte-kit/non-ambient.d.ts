
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
		RouteId(): "/" | "/builder" | "/dashboard" | "/datasets" | "/datasets/new" | "/datasets/[id]" | "/datasets/[id]/entries" | "/data" | "/data/games" | "/editor" | "/formulas" | "/games" | "/grimoires" | "/media" | "/posts" | "/posts/new" | "/posts/[id]" | "/realms" | "/settings" | "/streamers" | "/webhooks" | "/workers";
		RouteParams(): {
			"/datasets/[id]": { id: string };
			"/datasets/[id]/entries": { id: string };
			"/posts/[id]": { id: string }
		};
		LayoutParams(): {
			"/": { id?: string };
			"/builder": Record<string, never>;
			"/dashboard": Record<string, never>;
			"/datasets": { id?: string };
			"/datasets/new": Record<string, never>;
			"/datasets/[id]": { id: string };
			"/datasets/[id]/entries": { id: string };
			"/data": { id?: string };
			"/data/games": Record<string, never>;
			"/editor": Record<string, never>;
			"/formulas": Record<string, never>;
			"/games": Record<string, never>;
			"/grimoires": Record<string, never>;
			"/media": Record<string, never>;
			"/posts": { id?: string };
			"/posts/new": Record<string, never>;
			"/posts/[id]": { id: string };
			"/realms": Record<string, never>;
			"/settings": Record<string, never>;
			"/streamers": Record<string, never>;
			"/webhooks": Record<string, never>;
			"/workers": Record<string, never>
		};
		Pathname(): "/" | "/builder" | "/dashboard" | "/datasets" | "/datasets/new" | `/datasets/${string}/entries` & {} | "/data/games" | "/editor" | "/formulas" | "/games" | "/grimoires" | "/media" | "/posts" | "/posts/new" | `/posts/${string}` & {} | "/realms" | "/settings" | "/streamers" | "/webhooks" | "/workers";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/favicon.png" | string & {};
	}
}