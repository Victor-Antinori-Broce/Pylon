import { redirect } from "@sveltejs/kit";
const load = () => {
  throw redirect(308, "/g/grimoire-academy-lms");
};
export {
  load
};
