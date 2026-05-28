// @ts-nocheck
import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load = () => {
  throw redirect(308, '/g/grimoire-academy-lms');
};
;null as any as PageLoad;