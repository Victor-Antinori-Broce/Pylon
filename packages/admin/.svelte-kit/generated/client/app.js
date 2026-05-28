export { matchers } from './matchers.js';

export const nodes = [
	() => import('./nodes/0'),
	() => import('./nodes/1'),
	() => import('./nodes/2'),
	() => import('./nodes/3'),
	() => import('./nodes/4'),
	() => import('./nodes/5'),
	() => import('./nodes/6'),
	() => import('./nodes/7'),
	() => import('./nodes/8'),
	() => import('./nodes/9'),
	() => import('./nodes/10'),
	() => import('./nodes/11'),
	() => import('./nodes/12'),
	() => import('./nodes/13'),
	() => import('./nodes/14'),
	() => import('./nodes/15'),
	() => import('./nodes/16'),
	() => import('./nodes/17'),
	() => import('./nodes/18'),
	() => import('./nodes/19'),
	() => import('./nodes/20'),
	() => import('./nodes/21'),
	() => import('./nodes/22'),
	() => import('./nodes/23'),
	() => import('./nodes/24'),
	() => import('./nodes/25'),
	() => import('./nodes/26'),
	() => import('./nodes/27'),
	() => import('./nodes/28'),
	() => import('./nodes/29'),
	() => import('./nodes/30')
];

export const server_loads = [];

export const dictionary = {
		"/": [3],
		"/academy": [4],
		"/actions": [5],
		"/admin/connectors": [6],
		"/agents": [7,[2]],
		"/agents/traces": [8,[2]],
		"/agents/[id]": [9,[2]],
		"/ai-agents": [10],
		"/booking": [11],
		"/builder": [12],
		"/collections": [13],
		"/content/edit": [14],
		"/dashboard": [15],
		"/data-viewer": [16],
		"/datasets": [17],
		"/datasets/new": [18],
		"/datasets/[id]/edit": [19],
		"/datasets/[id]/entries": [20],
		"/directory": [21],
		"/directory/org-chart": [22],
		"/editor": [23],
		"/grimoires": [26],
		"/g/[id]": [24],
		"/g/[id]/[viewId]": [25],
		"/mcp": [27],
		"/realms": [28],
		"/settings": [29],
		"/traces": [30]
	};

export const hooks = {
	handleError: (({ error }) => { console.error(error) }),
	
	reroute: (() => {}),
	transport: {}
};

export const decoders = Object.fromEntries(Object.entries(hooks.transport).map(([k, v]) => [k, v.decode]));
export const encoders = Object.fromEntries(Object.entries(hooks.transport).map(([k, v]) => [k, v.encode]));

export const hash = false;

export const decode = (type, value) => decoders[type](value);

export { default as root } from '../root.js';