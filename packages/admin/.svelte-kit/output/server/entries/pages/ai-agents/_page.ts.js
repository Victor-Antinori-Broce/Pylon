import { redirect } from "@sveltejs/kit";
function load() {
  throw redirect(307, "/agents");
}
export {
  load
};
