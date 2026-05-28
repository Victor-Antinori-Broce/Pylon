import { redirect } from "@sveltejs/kit";
const load = () => {
  throw redirect(308, "/g/grimoire-booking");
};
export {
  load
};
