import { redirect } from '@sveltejs/kit';

export const load = ({ url }: { url: URL }) => {
  const collection = url.searchParams.get('collection') || 'blog-posts';
  const id = url.searchParams.get('id');
  const target = `/g/system-tools/editor?collection=${collection}${id ? `&id=${id}` : ''}`;
  throw redirect(308, target);
};
