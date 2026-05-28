import { redirect } from "@sveltejs/kit";
const load = () => {
  throw redirect(308, "/g/system-tools/editor");
};
export {
  load
};
