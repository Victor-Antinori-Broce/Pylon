import { l as derived, f as store_get, i as unsubscribe_stores } from "../../../../chunks/index.js";
import { p as page } from "../../../../chunks/stores.js";
import { G as GrimoirePage } from "../../../../chunks/GrimoirePage.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let grimoireId = derived(() => store_get($$store_subs ??= {}, "$page", page).params.id);
    GrimoirePage($$renderer2, { grimoireId: grimoireId() });
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _page as default
};
