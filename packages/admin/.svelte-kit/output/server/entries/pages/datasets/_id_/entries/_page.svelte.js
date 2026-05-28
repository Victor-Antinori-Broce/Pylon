import { j as sanitize_props, k as spread_props, h as slot, e as escape_html, a as ensure_array_like, c as attr_class, o as stringify, b as attr, l as derived, p as attr_style, d as clsx, f as store_get, i as unsubscribe_stores } from "../../../../../chunks/index.js";
import "clsx";
import { I as Icon } from "../../../../../chunks/Icon.js";
import { C as Chevron_right } from "../../../../../chunks/chevron-right.js";
import { R as Refresh_cw } from "../../../../../chunks/refresh-cw.js";
import { P as Plus } from "../../../../../chunks/plus.js";
import { S as Search } from "../../../../../chunks/search.js";
import { F as Funnel } from "../../../../../chunks/funnel.js";
import { E as Eye_off } from "../../../../../chunks/eye-off.js";
import { T as Trash_2 } from "../../../../../chunks/trash-2.js";
import { C as Check } from "../../../../../chunks/check.js";
import { X } from "../../../../../chunks/x.js";
import { M as Mail } from "../../../../../chunks/mail.js";
import { p as page } from "../../../../../chunks/stores.js";
function Arrow_down($$renderer, $$props) {
  const $$sanitized_props = sanitize_props($$props);
  /**
   * @license lucide-svelte v0.575.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   */
  const iconNode = [
    ["path", { "d": "M12 5v14" }],
    ["path", { "d": "m19 12-7 7-7-7" }]
  ];
  Icon($$renderer, spread_props([
    { name: "arrow-down" },
    $$sanitized_props,
    {
      /**
       * @component @name ArrowDown
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTIgNXYxNCIgLz4KICA8cGF0aCBkPSJtMTkgMTItNyA3LTctNyIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/arrow-down
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      iconNode,
      children: ($$renderer2) => {
        $$renderer2.push(`<!--[-->`);
        slot($$renderer2, $$props, "default", {});
        $$renderer2.push(`<!--]-->`);
      },
      $$slots: { default: true }
    }
  ]));
}
function Arrow_up_down($$renderer, $$props) {
  const $$sanitized_props = sanitize_props($$props);
  /**
   * @license lucide-svelte v0.575.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   */
  const iconNode = [
    ["path", { "d": "m21 16-4 4-4-4" }],
    ["path", { "d": "M17 20V4" }],
    ["path", { "d": "m3 8 4-4 4 4" }],
    ["path", { "d": "M7 4v16" }]
  ];
  Icon($$renderer, spread_props([
    { name: "arrow-up-down" },
    $$sanitized_props,
    {
      /**
       * @component @name ArrowUpDown
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJtMjEgMTYtNCA0LTQtNCIgLz4KICA8cGF0aCBkPSJNMTcgMjBWNCIgLz4KICA8cGF0aCBkPSJtMyA4IDQtNCA0IDQiIC8+CiAgPHBhdGggZD0iTTcgNHYxNiIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/arrow-up-down
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      iconNode,
      children: ($$renderer2) => {
        $$renderer2.push(`<!--[-->`);
        slot($$renderer2, $$props, "default", {});
        $$renderer2.push(`<!--]-->`);
      },
      $$slots: { default: true }
    }
  ]));
}
function Arrow_up($$renderer, $$props) {
  const $$sanitized_props = sanitize_props($$props);
  /**
   * @license lucide-svelte v0.575.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   */
  const iconNode = [
    ["path", { "d": "m5 12 7-7 7 7" }],
    ["path", { "d": "M12 19V5" }]
  ];
  Icon($$renderer, spread_props([
    { name: "arrow-up" },
    $$sanitized_props,
    {
      /**
       * @component @name ArrowUp
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJtNSAxMiA3LTcgNyA3IiAvPgogIDxwYXRoIGQ9Ik0xMiAxOVY1IiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/arrow-up
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      iconNode,
      children: ($$renderer2) => {
        $$renderer2.push(`<!--[-->`);
        slot($$renderer2, $$props, "default", {});
        $$renderer2.push(`<!--]-->`);
      },
      $$slots: { default: true }
    }
  ]));
}
function Chevron_left($$renderer, $$props) {
  const $$sanitized_props = sanitize_props($$props);
  /**
   * @license lucide-svelte v0.575.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   */
  const iconNode = [["path", { "d": "m15 18-6-6 6-6" }]];
  Icon($$renderer, spread_props([
    { name: "chevron-left" },
    $$sanitized_props,
    {
      /**
       * @component @name ChevronLeft
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJtMTUgMTgtNi02IDYtNiIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/chevron-left
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      iconNode,
      children: ($$renderer2) => {
        $$renderer2.push(`<!--[-->`);
        slot($$renderer2, $$props, "default", {});
        $$renderer2.push(`<!--]-->`);
      },
      $$slots: { default: true }
    }
  ]));
}
function Chevrons_left($$renderer, $$props) {
  const $$sanitized_props = sanitize_props($$props);
  /**
   * @license lucide-svelte v0.575.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   */
  const iconNode = [
    ["path", { "d": "m11 17-5-5 5-5" }],
    ["path", { "d": "m18 17-5-5 5-5" }]
  ];
  Icon($$renderer, spread_props([
    { name: "chevrons-left" },
    $$sanitized_props,
    {
      /**
       * @component @name ChevronsLeft
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJtMTEgMTctNS01IDUtNSIgLz4KICA8cGF0aCBkPSJtMTggMTctNS01IDUtNSIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/chevrons-left
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      iconNode,
      children: ($$renderer2) => {
        $$renderer2.push(`<!--[-->`);
        slot($$renderer2, $$props, "default", {});
        $$renderer2.push(`<!--]-->`);
      },
      $$slots: { default: true }
    }
  ]));
}
function Chevrons_right($$renderer, $$props) {
  const $$sanitized_props = sanitize_props($$props);
  /**
   * @license lucide-svelte v0.575.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   */
  const iconNode = [
    ["path", { "d": "m6 17 5-5-5-5" }],
    ["path", { "d": "m13 17 5-5-5-5" }]
  ];
  Icon($$renderer, spread_props([
    { name: "chevrons-right" },
    $$sanitized_props,
    {
      /**
       * @component @name ChevronsRight
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJtNiAxNyA1LTUtNS01IiAvPgogIDxwYXRoIGQ9Im0xMyAxNyA1LTUtNS01IiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/chevrons-right
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      iconNode,
      children: ($$renderer2) => {
        $$renderer2.push(`<!--[-->`);
        slot($$renderer2, $$props, "default", {});
        $$renderer2.push(`<!--]-->`);
      },
      $$slots: { default: true }
    }
  ]));
}
function Columns_3($$renderer, $$props) {
  const $$sanitized_props = sanitize_props($$props);
  /**
   * @license lucide-svelte v0.575.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   */
  const iconNode = [
    [
      "rect",
      { "width": "18", "height": "18", "x": "3", "y": "3", "rx": "2" }
    ],
    ["path", { "d": "M9 3v18" }],
    ["path", { "d": "M15 3v18" }]
  ];
  Icon($$renderer, spread_props([
    { name: "columns-3" },
    $$sanitized_props,
    {
      /**
       * @component @name Columns3
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cmVjdCB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHg9IjMiIHk9IjMiIHJ4PSIyIiAvPgogIDxwYXRoIGQ9Ik05IDN2MTgiIC8+CiAgPHBhdGggZD0iTTE1IDN2MTgiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/columns-3
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      iconNode,
      children: ($$renderer2) => {
        $$renderer2.push(`<!--[-->`);
        slot($$renderer2, $$props, "default", {});
        $$renderer2.push(`<!--]-->`);
      },
      $$slots: { default: true }
    }
  ]));
}
function Copy($$renderer, $$props) {
  const $$sanitized_props = sanitize_props($$props);
  /**
   * @license lucide-svelte v0.575.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   */
  const iconNode = [
    [
      "rect",
      {
        "width": "14",
        "height": "14",
        "x": "8",
        "y": "8",
        "rx": "2",
        "ry": "2"
      }
    ],
    [
      "path",
      {
        "d": "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
      }
    ]
  ];
  Icon($$renderer, spread_props([
    { name: "copy" },
    $$sanitized_props,
    {
      /**
       * @component @name Copy
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cmVjdCB3aWR0aD0iMTQiIGhlaWdodD0iMTQiIHg9IjgiIHk9IjgiIHJ4PSIyIiByeT0iMiIgLz4KICA8cGF0aCBkPSJNNCAxNmMtMS4xIDAtMi0uOS0yLTJWNGMwLTEuMS45LTIgMi0yaDEwYzEuMSAwIDIgLjkgMiAyIiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/copy
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      iconNode,
      children: ($$renderer2) => {
        $$renderer2.push(`<!--[-->`);
        slot($$renderer2, $$props, "default", {});
        $$renderer2.push(`<!--]-->`);
      },
      $$slots: { default: true }
    }
  ]));
}
function Download($$renderer, $$props) {
  const $$sanitized_props = sanitize_props($$props);
  /**
   * @license lucide-svelte v0.575.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   */
  const iconNode = [
    ["path", { "d": "M12 15V3" }],
    ["path", { "d": "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }],
    ["path", { "d": "m7 10 5 5 5-5" }]
  ];
  Icon($$renderer, spread_props([
    { name: "download" },
    $$sanitized_props,
    {
      /**
       * @component @name Download
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTIgMTVWMyIgLz4KICA8cGF0aCBkPSJNMjEgMTV2NGEyIDIgMCAwIDEtMiAySDVhMiAyIDAgMCAxLTItMnYtNCIgLz4KICA8cGF0aCBkPSJtNyAxMCA1IDUgNS01IiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/download
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      iconNode,
      children: ($$renderer2) => {
        $$renderer2.push(`<!--[-->`);
        slot($$renderer2, $$props, "default", {});
        $$renderer2.push(`<!--]-->`);
      },
      $$slots: { default: true }
    }
  ]));
}
function External_link($$renderer, $$props) {
  const $$sanitized_props = sanitize_props($$props);
  /**
   * @license lucide-svelte v0.575.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   */
  const iconNode = [
    ["path", { "d": "M15 3h6v6" }],
    ["path", { "d": "M10 14 21 3" }],
    [
      "path",
      {
        "d": "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
      }
    ]
  ];
  Icon($$renderer, spread_props([
    { name: "external-link" },
    $$sanitized_props,
    {
      /**
       * @component @name ExternalLink
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTUgM2g2djYiIC8+CiAgPHBhdGggZD0iTTEwIDE0IDIxIDMiIC8+CiAgPHBhdGggZD0iTTE4IDEzdjZhMiAyIDAgMCAxLTIgMkg1YTIgMiAwIDAgMS0yLTJWOGEyIDIgMCAwIDEgMi0yaDYiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/external-link
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      iconNode,
      children: ($$renderer2) => {
        $$renderer2.push(`<!--[-->`);
        slot($$renderer2, $$props, "default", {});
        $$renderer2.push(`<!--]-->`);
      },
      $$slots: { default: true }
    }
  ]));
}
function Eye($$renderer, $$props) {
  const $$sanitized_props = sanitize_props($$props);
  /**
   * @license lucide-svelte v0.575.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   */
  const iconNode = [
    [
      "path",
      {
        "d": "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"
      }
    ],
    ["circle", { "cx": "12", "cy": "12", "r": "3" }]
  ];
  Icon($$renderer, spread_props([
    { name: "eye" },
    $$sanitized_props,
    {
      /**
       * @component @name Eye
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMi4wNjIgMTIuMzQ4YTEgMSAwIDAgMSAwLS42OTYgMTAuNzUgMTAuNzUgMCAwIDEgMTkuODc2IDAgMSAxIDAgMCAxIDAgLjY5NiAxMC43NSAxMC43NSAwIDAgMS0xOS44NzYgMCIgLz4KICA8Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIzIiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/eye
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      iconNode,
      children: ($$renderer2) => {
        $$renderer2.push(`<!--[-->`);
        slot($$renderer2, $$props, "default", {});
        $$renderer2.push(`<!--]-->`);
      },
      $$slots: { default: true }
    }
  ]));
}
function File_braces($$renderer, $$props) {
  const $$sanitized_props = sanitize_props($$props);
  /**
   * @license lucide-svelte v0.575.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   */
  const iconNode = [
    [
      "path",
      {
        "d": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"
      }
    ],
    ["path", { "d": "M14 2v5a1 1 0 0 0 1 1h5" }],
    [
      "path",
      {
        "d": "M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1"
      }
    ],
    [
      "path",
      {
        "d": "M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1"
      }
    ]
  ];
  Icon($$renderer, spread_props([
    { name: "file-braces" },
    $$sanitized_props,
    {
      /**
       * @component @name FileBraces
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNNiAyMmEyIDIgMCAwIDEtMi0yVjRhMiAyIDAgMCAxIDItMmg4YTIuNCAyLjQgMCAwIDEgMS43MDQuNzA2bDMuNTg4IDMuNTg4QTIuNCAyLjQgMCAwIDEgMjAgOHYxMmEyIDIgMCAwIDEtMiAyeiIgLz4KICA8cGF0aCBkPSJNMTQgMnY1YTEgMSAwIDAgMCAxIDFoNSIgLz4KICA8cGF0aCBkPSJNMTAgMTJhMSAxIDAgMCAwLTEgMXYxYTEgMSAwIDAgMS0xIDEgMSAxIDAgMCAxIDEgMXYxYTEgMSAwIDAgMCAxIDEiIC8+CiAgPHBhdGggZD0iTTE0IDE4YTEgMSAwIDAgMCAxLTF2LTFhMSAxIDAgMCAxIDEtMSAxIDEgMCAwIDEtMS0xdi0xYTEgMSAwIDAgMC0xLTEiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/file-braces
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      iconNode,
      children: ($$renderer2) => {
        $$renderer2.push(`<!--[-->`);
        slot($$renderer2, $$props, "default", {});
        $$renderer2.push(`<!--]-->`);
      },
      $$slots: { default: true }
    }
  ]));
}
function Square_pen($$renderer, $$props) {
  const $$sanitized_props = sanitize_props($$props);
  /**
   * @license lucide-svelte v0.575.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   */
  const iconNode = [
    [
      "path",
      {
        "d": "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
      }
    ],
    [
      "path",
      {
        "d": "M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"
      }
    ]
  ];
  Icon($$renderer, spread_props([
    { name: "square-pen" },
    $$sanitized_props,
    {
      /**
       * @component @name SquarePen
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTIgM0g1YTIgMiAwIDAgMC0yIDJ2MTRhMiAyIDAgMCAwIDIgMmgxNGEyIDIgMCAwIDAgMi0ydi03IiAvPgogIDxwYXRoIGQ9Ik0xOC4zNzUgMi42MjVhMSAxIDAgMCAxIDMgM2wtOS4wMTMgOS4wMTRhMiAyIDAgMCAxLS44NTMuNTA1bC0yLjg3My44NGEuNS41IDAgMCAxLS42Mi0uNjJsLjg0LTIuODczYTIgMiAwIDAgMSAuNTA2LS44NTJ6IiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/square-pen
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      iconNode,
      children: ($$renderer2) => {
        $$renderer2.push(`<!--[-->`);
        slot($$renderer2, $$props, "default", {});
        $$renderer2.push(`<!--]-->`);
      },
      $$slots: { default: true }
    }
  ]));
}
function KanbanBoard($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { view } = $$props;
    let data = [];
    $$renderer2.push(`<div class="space-y-4"><div class="flex items-center justify-between"><h2 class="text-xl font-semibold text-gremius-text">${escape_html(view.title)}</h2> <span class="text-sm text-gremius-text-dim">${escape_html(data.length)} records</span></div> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex items-center justify-center h-64"><div class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div></div>`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
function CalendarView($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { view, apiEndpoint } = $$props;
    apiEndpoint || `/api/explorer/${view.table}`;
    let currentMonth = (/* @__PURE__ */ new Date()).getMonth();
    let currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    const MONTHS = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ];
    $$renderer2.push(`<div class="space-y-4"><div class="flex items-center justify-between"><h2 class="text-xl font-semibold text-gremius-text">${escape_html(view.title)}</h2> <div class="flex items-center gap-2"><button class="btn-secondary-sm">Today</button> <button class="p-2 rounded hover:bg-gremius-border/30">`);
    Chevron_left($$renderer2, { class: "w-4 h-4 text-gremius-text-dim" });
    $$renderer2.push(`<!----></button> <span class="text-sm font-medium text-gremius-text min-w-[140px] text-center">${escape_html(MONTHS[currentMonth])} ${escape_html(currentYear)}</span> <button class="p-2 rounded hover:bg-gremius-border/30">`);
    Chevron_right($$renderer2, { class: "w-4 h-4 text-gremius-text-dim" });
    $$renderer2.push(`<!----></button></div></div> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex items-center justify-center h-64"><div class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div></div>`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
function DataExplorer($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { grimoireId, config, viewId } = $$props;
    let loading = true;
    let data = [];
    let selectedRows = /* @__PURE__ */ new Set();
    let searchQuery = "";
    let currentPage = 1;
    let pageSize = 25;
    let totalCount = 0;
    let sortStack = [];
    let hiddenColumns = /* @__PURE__ */ new Set();
    let activeFilters = {};
    let schema = null;
    let bulkActionLoading = false;
    let fkDisplayCache = {};
    let filterRelationOptions = {};
    let activeView = derived(() => config?.views?.find((v) => v.id === viewId) || config?.views?.[0] || {
      type: "grid",
      table: grimoireId,
      id: "default",
      title: grimoireId
    });
    let columns = derived(() => schema?.columns || generateColumnsFromData(data));
    let visibleColumns = derived(() => columns().filter((c) => !hiddenColumns.has(c.name)));
    let displayColumns = derived(() => visibleColumns().slice(0, 12));
    let searchFields = derived(() => columns().filter((c) => ["text", "string", "varchar", "email", "url"].includes(c.type || "") || [
      "name",
      "title",
      "label",
      "slug",
      "description",
      "displayName",
      "display_name",
      "email"
    ].includes(c.name)).map((c) => c.name));
    let discoveredViews = [];
    let views = derived(() => [
      ...config?.views || [],
      ...discoveredViews.filter((dv) => !(config?.views || []).some((cv) => cv.table === dv.table))
    ]);
    let rowActions = derived(() => activeView()?.rowActions || []);
    const API_URL = "http://localhost:3001";
    function getEndpoint(tblName) {
      const table = tblName || activeView()?.table || grimoireId;
      const base = config?.apiEndpoint;
      if (!base) return `/api/explorer/${table}`;
      const segments = base.replace(/^\//, "").split("/");
      if (segments.length >= 3) return base;
      return `${base}/${table}`;
    }
    const FK_TABLE_MAP = {
      game_id: "games",
      gameId: "games",
      platform_id: "platforms",
      platformId: "platforms",
      tag_id: "tags",
      tagId: "tags",
      streamer_id: "streamers",
      streamerId: "streamers",
      collection_id: "collections",
      collectionId: "collections",
      user_id: "auth_users",
      userId: "auth_users",
      author_id: "auth_users",
      authorId: "auth_users",
      assigned_to_id: "auth_users",
      assignedToId: "auth_users",
      contact_id: "contacts",
      contactId: "contacts",
      dataset_id: "datasets",
      datasetId: "datasets",
      cover_art_id: "media",
      coverArtId: "media",
      featured_image_id: "media",
      featuredImageId: "media",
      avatar_id: "media",
      avatarId: "media",
      icon_id: "media",
      iconId: "media",
      thumbnail_id: "media",
      thumbnailId: "media",
      uploaded_by_id: "auth_users",
      uploadedById: "auth_users",
      created_by_id: "auth_users",
      createdById: "auth_users"
    };
    function isRelationColumn(colName) {
      return colName.endsWith("_id") || colName.endsWith("Id") && colName !== "id";
    }
    function getRelatedTable(colName) {
      if (FK_TABLE_MAP[colName]) return FK_TABLE_MAP[colName];
      const base = colName.replace(/_id$/, "").replace(/Id$/, "");
      return base.endsWith("s") ? base : base + "s";
    }
    function generateColumnsFromData(rows) {
      if (!rows.length) return [];
      return Object.keys(rows[0]).map((key) => ({ name: key, type: typeof rows[0][key], nullable: true }));
    }
    async function loadData() {
      loading = true;
      try {
        const params = new URLSearchParams();
        params.set("limit", String(pageSize));
        params.set("page", String(currentPage));
        if (searchQuery) ;
        if (sortStack.length > 0) {
          params.set("sort", sortStack.map((s) => `${s.direction === "desc" ? "-" : ""}${s.column}`).join(","));
          params.set("dir", sortStack[0].direction);
        }
        Object.entries(activeFilters).forEach(([key, value]) => {
          if (value !== void 0 && value !== "" && value !== null) {
            params.set("filter_field", key);
            if (typeof value === "boolean") {
              params.set("filter_op", "equals");
              params.set("filter_value", String(value));
            } else {
              params.set("filter_op", "contains");
              params.set("filter_value", String(value));
            }
          }
        });
        const tableName = activeView()?.table || grimoireId;
        const endpoint = getEndpoint(tableName);
        const res = await fetch(`${API_URL}${endpoint}?${params}`, { credentials: "include" });
        if (res.ok) {
          const result = await res.json();
          data = result.data || result.docs || result;
          totalCount = result.pagination?.total || result.totalDocs || result.total || data.length;
          if (!schema && result.columns && result.columns.length > 0) {
            schema = {
              name: tableName,
              columns: result.columns.map((col) => ({ name: col.field, type: col.type, nullable: true })),
              primaryKey: "id"
            };
          }
          await loadFkDisplayValues();
        }
      } catch (e) {
        console.error("Failed to load data", e);
      } finally {
        loading = false;
      }
    }
    async function loadFkDisplayValues() {
      const relationCols = columns().filter((c) => isRelationColumn(c.name));
      if (relationCols.length === 0 || data.length === 0) return;
      for (const col of relationCols) {
        const relTable = getRelatedTable(col.name);
        if (!relTable || fkDisplayCache[relTable]) continue;
        try {
          const res = await fetch(`${API_URL}/api/explorer/${relTable}/options`, { credentials: "include" });
          if (res.ok) {
            const result = await res.json();
            const map = {};
            const options = [];
            for (const opt of result.options || []) {
              map[String(opt.value)] = opt.label;
              options.push(opt);
            }
            fkDisplayCache[relTable] = map;
            fkDisplayCache = { ...fkDisplayCache };
            filterRelationOptions[col.name] = options;
            filterRelationOptions = { ...filterRelationOptions };
          }
        } catch {
        }
      }
    }
    function resolveFkDisplay(colName, rawValue) {
      if (rawValue === null || rawValue === void 0) return "-";
      const relTable = getRelatedTable(colName);
      if (relTable && fkDisplayCache[relTable]) {
        return fkDisplayCache[relTable][String(rawValue)] || String(rawValue).slice(0, 8) + "…";
      }
      return String(rawValue).slice(0, 8) + "…";
    }
    function getRowActionClasses(variant) {
      const base = "group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all duration-200 text-xs font-medium ";
      switch (variant) {
        case "success":
          return base + "bg-emerald-500/5 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30";
        case "warning":
          return base + "bg-amber-500/5 border-amber-500/20 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/30";
        case "danger":
          return base + "bg-red-500/5 border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500/30";
        case "primary":
          return base + "bg-gremius-cyan/5 border-gremius-cyan/20 text-gremius-cyan hover:bg-gremius-cyan/10 hover:border-gremius-cyan/30";
        default:
          return base + "bg-gremius-surface border-gremius-border text-gremius-text hover:bg-gremius-cyan/5 hover:border-gremius-cyan/20 hover:text-gremius-cyan";
      }
    }
    function hasStatusField() {
      return data.length > 0 && data.some((row) => row.status !== void 0);
    }
    function getSortIndex(column) {
      return sortStack.findIndex((s) => s.column === column);
    }
    function getSortDir(column) {
      const s = sortStack.find((s2) => s2.column === column);
      return s?.direction || null;
    }
    function getCellValue(row, column) {
      return column.split(".").reduce((obj, key) => obj?.[key], row);
    }
    function getColumnType(colName) {
      const col = columns().find((c) => c.name === colName);
      if (col?.type) return col.type;
      if (isRelationColumn(colName)) return "relation";
      if (colName.includes("url") || colName.includes("Url")) return "url";
      if (colName.includes("email")) return "email";
      if (colName.includes("color") || colName.includes("Color")) return "color";
      if (colName.endsWith("At") || colName.endsWith("_at") || colName.includes("date") || colName.includes("Date")) return "date";
      return "text";
    }
    function formatValue(value) {
      if (value === null || value === void 0) return "-";
      if (typeof value === "boolean") return value ? "✓" : "✗";
      if (value instanceof Date) return value.toLocaleDateString();
      if (typeof value === "object") return JSON.stringify(value).slice(0, 50) + "...";
      return String(value);
    }
    function formatDateTime(value) {
      if (!value) return "-";
      try {
        const d = new Date(value);
        if (isNaN(d.getTime())) return String(value);
        return d.toLocaleDateString(void 0, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        });
      } catch {
        return String(value);
      }
    }
    const totalPages = derived(() => Math.ceil(totalCount / pageSize));
    const activeFilterCount = derived(() => Object.keys(activeFilters).length);
    if (activeView()?.type === "kanban") {
      $$renderer2.push("<!--[-->");
      KanbanBoard($$renderer2, { view: activeView(), apiEndpoint: config?.apiEndpoint });
    } else if (activeView()?.type === "calendar") {
      $$renderer2.push("<!--[1-->");
      CalendarView($$renderer2, { view: activeView(), apiEndpoint: config?.apiEndpoint });
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="space-y-4"><div class="flex items-center justify-between"><div><h1 class="text-xl font-semibold text-gremius-text">${escape_html(config?.name || activeView()?.title || grimoireId)}</h1> <p class="text-sm text-gremius-text-dim">${escape_html(totalCount.toLocaleString())} records</p></div> <div class="flex items-center gap-2"><button class="group inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-gremius-cyan/5 hover:border-gremius-cyan/20 hover:text-gremius-cyan transition-all duration-200" title="Actualizar">`);
      Refresh_cw($$renderer2, {
        class: "w-4 h-4 group-hover:rotate-180 transition-transform duration-500"
      });
      $$renderer2.push(`<!----> <span class="hidden sm:inline">Actualizar</span></button> <button class="group inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-emerald-500/5 hover:border-emerald-500/20 hover:text-emerald-400 transition-all duration-200" title="Exportar como CSV">`);
      Download($$renderer2, {
        class: "w-4 h-4 group-hover:translate-y-0.5 transition-transform"
      });
      $$renderer2.push(`<!----> <span class="hidden sm:inline">Exportar</span></button> <button class="group inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gremius-cyan to-cyan-400 text-black rounded-xl font-semibold shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-105 active:scale-95 transition-all duration-200">`);
      Plus($$renderer2, {
        class: "w-4 h-4 group-hover:rotate-90 transition-transform duration-300"
      });
      $$renderer2.push(`<!----> <span>Agregar ${escape_html(config?.singularName || "Registro")}</span></button></div></div> `);
      if (views().length > 1) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="flex items-center gap-1 p-1 bg-gremius-bg border border-gremius-border rounded-lg w-fit"><!--[-->`);
        const each_array = ensure_array_like(views());
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let v = each_array[$$index];
          $$renderer2.push(`<button${attr_class(`px-3 py-1.5 text-sm rounded-md transition-colors ${stringify(views()[0]?.id === v.id ? "bg-gremius-card text-gremius-text shadow-sm" : "text-gremius-text-dim hover:text-gremius-text")}`)}>${escape_html(v.title)}</button>`);
        }
        $$renderer2.push(`<!--]--></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> <div class="flex items-center gap-3 p-3 bg-gremius-card border border-gremius-border rounded-lg"><div class="relative flex-1 max-w-md">`);
      Search($$renderer2, {
        class: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gremius-text-dim"
      });
      $$renderer2.push(`<!----> <input type="text" placeholder="Buscar en todos los campos..." class="input pl-10 w-full"${attr("value", searchQuery)}/></div> <button${attr_class(`group inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-gremius-cyan/5 hover:border-gremius-cyan/20 transition-all duration-200 ${stringify("")}`)}>`);
      Funnel($$renderer2, { class: "w-4 h-4 group-hover:scale-110 transition-transform" });
      $$renderer2.push(`<!----> <span class="hidden sm:inline">Filtros</span> `);
      if (activeFilterCount() > 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<span class="ml-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-gremius-cyan text-white">${escape_html(activeFilterCount())}</span>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></button> <div class="relative"><button${attr_class(`group inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-gremius-cyan/5 hover:border-gremius-cyan/20 transition-all duration-200 ${stringify("")}`)} title="Mostrar/ocultar columnas">`);
      Columns_3($$renderer2, { class: "w-4 h-4 group-hover:scale-110 transition-transform" });
      $$renderer2.push(`<!----> <span class="hidden sm:inline">Columnas</span> `);
      if (hiddenColumns.size > 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<span class="ml-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500 text-white">${escape_html(hiddenColumns.size)}</span>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></button> `);
      {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div> `);
      if (sortStack.length > 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="flex items-center gap-1 text-xs text-gremius-subtle">`);
        Arrow_up_down($$renderer2, { class: "w-3.5 h-3.5" });
        $$renderer2.push(`<!----> ${escape_html(sortStack.length)} sort${escape_html(sortStack.length > 1 ? "s" : "")} <button class="text-gremius-cyan hover:underline ml-1">clear</button></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div> `);
      {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (selectedRows.size > 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="sticky top-4 z-20 flex flex-wrap items-center justify-between gap-3 p-3 bg-gremius-card border border-gremius-border rounded-lg shadow-lg shadow-black/10"><div class="flex items-center gap-3"><span class="px-2.5 py-1 text-sm font-medium rounded-full bg-gremius-cyan/10 text-gremius-cyan border border-gremius-cyan/20">${escape_html(selectedRows.size)} selected</span> `);
        if (selectedRows.size < data.length) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<button class="text-xs text-gremius-text-dim hover:text-gremius-cyan transition-colors">Select all ${escape_html(data.length)}</button>`);
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push(`<button class="text-xs text-gremius-text-dim hover:text-gremius-cyan transition-colors">Deselect all</button>`);
        }
        $$renderer2.push(`<!--]--></div> <div class="flex items-center gap-2">`);
        if (hasStatusField()) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<button class="group inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-400 transition-all duration-200 disabled:opacity-50"${attr("disabled", bulkActionLoading, true)} title="Publish selected">`);
          Eye($$renderer2, { class: "w-3.5 h-3.5" });
          $$renderer2.push(`<!----> Publish</button> <button class="group inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-amber-500/10 hover:border-amber-500/30 hover:text-amber-400 transition-all duration-200 disabled:opacity-50"${attr("disabled", bulkActionLoading, true)} title="Unpublish selected">`);
          Eye_off($$renderer2, { class: "w-3.5 h-3.5" });
          $$renderer2.push(`<!----> Unpublish</button>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> <button class="group inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-gremius-cyan/10 hover:border-gremius-cyan/30 hover:text-gremius-cyan transition-all duration-200 disabled:opacity-50"${attr("disabled", bulkActionLoading, true)} title="Duplicate selected">`);
        Copy($$renderer2, { class: "w-3.5 h-3.5" });
        $$renderer2.push(`<!----> Duplicate</button> <div class="w-px h-6 bg-gremius-border mx-1"></div> <button class="group inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-red-500/10 to-red-600/10 text-red-400 border border-red-500/20 hover:from-red-500/20 hover:to-red-600/20 hover:border-red-500/30 transition-all duration-200 disabled:opacity-50"${attr("disabled", bulkActionLoading, true)} title="Delete selected">`);
        Trash_2($$renderer2, { class: "w-3.5 h-3.5 group-hover:animate-pulse" });
        $$renderer2.push(`<!----> Delete</button></div></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> <div class="border border-gremius-border rounded-lg overflow-hidden bg-gremius-card"><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-gremius-border bg-gremius-bg"><th class="w-10 p-3"><input type="checkbox"${attr("checked", data.length > 0 && selectedRows.size === data.length, true)}${attr("indeterminate", selectedRows.size > 0 && selectedRows.size < data.length, true)} class="w-4 h-4 rounded border-gremius-border accent-gremius-cyan"/></th><!--[-->`);
      const each_array_4 = ensure_array_like(displayColumns());
      for (let $$index_4 = 0, $$length = each_array_4.length; $$index_4 < $$length; $$index_4++) {
        let column = each_array_4[$$index_4];
        const dir = getSortDir(column.name);
        const idx = getSortIndex(column.name);
        $$renderer2.push(`<th class="p-3 text-left"><button${attr_class(`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors ${stringify(dir ? "text-gremius-cyan" : "text-gremius-subtle hover:text-gremius-cyan")}`)} title="Clic para ordenar, Shift+clic para ordenar múltiple">`);
        if (isRelationColumn(column.name)) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`${escape_html(column.name.replace(/_id$/, "").replace(/Id$/, "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()))}`);
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push(`${escape_html(column.name.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()).trim())}`);
        }
        $$renderer2.push(`<!--]--> `);
        if (dir === "asc") {
          $$renderer2.push("<!--[-->");
          Arrow_up($$renderer2, { class: "w-3 h-3" });
        } else if (dir === "desc") {
          $$renderer2.push("<!--[1-->");
          Arrow_down($$renderer2, { class: "w-3 h-3" });
        } else {
          $$renderer2.push("<!--[!-->");
          Arrow_up_down($$renderer2, { class: "w-3 h-3 opacity-0 group-hover:opacity-30" });
        }
        $$renderer2.push(`<!--]--> `);
        if (sortStack.length > 1 && idx >= 0) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="text-[9px] font-bold bg-gremius-cyan/20 text-gremius-cyan rounded-full w-4 h-4 flex items-center justify-center">${escape_html(idx + 1)}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></button></th>`);
      }
      $$renderer2.push(`<!--]--><th class="p-3 text-right text-xs font-semibold uppercase tracking-wider text-gremius-subtle">Acciones</th></tr></thead><tbody>`);
      if (loading) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<!--[-->`);
        const each_array_5 = ensure_array_like(Array(5));
        for (let i = 0, $$length = each_array_5.length; i < $$length; i++) {
          each_array_5[i];
          $$renderer2.push(`<tr class="border-b border-gremius-border"><!--[-->`);
          const each_array_6 = ensure_array_like(Array(Math.min(displayColumns().length + 2, 10)));
          for (let $$index_5 = 0, $$length2 = each_array_6.length; $$index_5 < $$length2; $$index_5++) {
            each_array_6[$$index_5];
            $$renderer2.push(`<td class="p-3"><div class="h-4 bg-gremius-border/30 rounded animate-pulse"></div></td>`);
          }
          $$renderer2.push(`<!--]--></tr>`);
        }
        $$renderer2.push(`<!--]-->`);
      } else if (data.length === 0) {
        $$renderer2.push("<!--[1-->");
        $$renderer2.push(`<tr><td colspan="100" class="p-12 text-center"><div class="flex flex-col items-center gap-3"><div class="w-12 h-12 rounded-full bg-gremius-border/20 flex items-center justify-center">`);
        File_braces($$renderer2, { class: "w-6 h-6 text-gremius-subtle" });
        $$renderer2.push(`<!----></div> <p class="text-gremius-text-dim">No se encontraron registros</p> `);
        if (activeFilterCount() > 0) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<button class="text-xs px-3 py-1.5 rounded-lg bg-gremius-cyan/10 text-gremius-cyan hover:bg-gremius-cyan/20 transition-colors">Limpiar búsqueda y filtros</button>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div></td></tr>`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<!--[-->`);
        const each_array_7 = ensure_array_like(data);
        for (let $$index_9 = 0, $$length = each_array_7.length; $$index_9 < $$length; $$index_9++) {
          let row = each_array_7[$$index_9];
          $$renderer2.push(`<tr class="border-b border-gremius-border hover:bg-gremius-cyan/[0.03] transition-colors"><td class="p-3"><input type="checkbox"${attr("checked", selectedRows.has(row.id), true)} class="w-4 h-4 rounded border-gremius-border accent-gremius-cyan"/></td><!--[-->`);
          const each_array_8 = ensure_array_like(displayColumns());
          for (let $$index_7 = 0, $$length2 = each_array_8.length; $$index_7 < $$length2; $$index_7++) {
            let column = each_array_8[$$index_7];
            const value = getCellValue(row, column.name);
            const colType = getColumnType(column.name);
            $$renderer2.push(`<td class="p-3">`);
            if (colType === "boolean") {
              $$renderer2.push("<!--[-->");
              if (value === true) {
                $$renderer2.push("<!--[-->");
                $$renderer2.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">`);
                Check($$renderer2, { class: "w-3 h-3" });
                $$renderer2.push(`<!----> Sí</span>`);
              } else if (value === false) {
                $$renderer2.push("<!--[1-->");
                $$renderer2.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">`);
                X($$renderer2, { class: "w-3 h-3" });
                $$renderer2.push(`<!----> No</span>`);
              } else {
                $$renderer2.push("<!--[!-->");
                $$renderer2.push(`<span class="text-gremius-subtle">-</span>`);
              }
              $$renderer2.push(`<!--]-->`);
            } else if (colType === "date") {
              $$renderer2.push("<!--[1-->");
              $$renderer2.push(`<span class="text-gremius-text-dim text-xs"${attr("title", value ? String(value) : "")}>${escape_html(formatDateTime(value))}</span>`);
            } else if (colType === "relation" || isRelationColumn(column.name)) {
              $$renderer2.push("<!--[2-->");
              $$renderer2.push(`<span class="inline-flex items-center px-2 py-0.5 rounded-md bg-gremius-surface text-xs font-medium text-gremius-text-dim"${attr("title", String(value || ""))}>${escape_html(resolveFkDisplay(column.name, value))}</span>`);
            } else if (colType === "url") {
              $$renderer2.push("<!--[3-->");
              if (value) {
                $$renderer2.push("<!--[-->");
                $$renderer2.push(`<a${attr("href", value)} target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-gremius-cyan hover:underline text-xs truncate max-w-[200px]">`);
                External_link($$renderer2, { class: "w-3 h-3 shrink-0" });
                $$renderer2.push(`<!----> ${escape_html(String(value).replace(/^https?:\/\//, "").slice(0, 30))}</a>`);
              } else {
                $$renderer2.push("<!--[!-->");
                $$renderer2.push(`<span class="text-gremius-subtle">-</span>`);
              }
              $$renderer2.push(`<!--]-->`);
            } else if (colType === "email") {
              $$renderer2.push("<!--[4-->");
              if (value) {
                $$renderer2.push("<!--[-->");
                $$renderer2.push(`<a${attr("href", `mailto:${stringify(value)}`)} class="inline-flex items-center gap-1 text-gremius-cyan hover:underline text-xs">`);
                Mail($$renderer2, { class: "w-3 h-3 shrink-0" });
                $$renderer2.push(`<!----> ${escape_html(value)}</a>`);
              } else {
                $$renderer2.push("<!--[!-->");
                $$renderer2.push(`<span class="text-gremius-subtle">-</span>`);
              }
              $$renderer2.push(`<!--]-->`);
            } else if (colType === "color") {
              $$renderer2.push("<!--[5-->");
              if (value) {
                $$renderer2.push("<!--[-->");
                $$renderer2.push(`<div class="flex items-center gap-2"><div class="w-5 h-5 rounded border border-gremius-border shrink-0"${attr_style(`background-color: ${stringify(value)}`)}></div> <span class="text-xs text-gremius-text-dim font-mono">${escape_html(value)}</span></div>`);
              } else {
                $$renderer2.push("<!--[!-->");
                $$renderer2.push(`<span class="text-gremius-subtle">-</span>`);
              }
              $$renderer2.push(`<!--]-->`);
            } else if (colType === "id") {
              $$renderer2.push("<!--[6-->");
              $$renderer2.push(`<span class="text-xs text-gremius-subtle font-mono"${attr("title", value)}>${escape_html(value ? String(value).slice(0, 8) + "…" : "-")}</span>`);
            } else if (column.name === "image" || column.name === "portada" || column.name === "cover" || column.name === "thumbnailUrl" || column.name === "thumbnail_url") {
              $$renderer2.push("<!--[7-->");
              if (value) {
                $$renderer2.push("<!--[-->");
                $$renderer2.push(`<img${attr("src", value)} alt="" class="w-10 h-10 object-cover rounded border border-gremius-border"/>`);
              } else {
                $$renderer2.push("<!--[!-->");
                $$renderer2.push(`<div class="w-10 h-10 bg-gremius-border/30 rounded flex items-center justify-center text-xs text-gremius-text-dim">N/A</div>`);
              }
              $$renderer2.push(`<!--]-->`);
            } else if (colType === "json") {
              $$renderer2.push("<!--[8-->");
              if (value !== null && value !== void 0) {
                $$renderer2.push("<!--[-->");
                $$renderer2.push(`<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-gremius-surface text-gremius-subtle"${attr("title", JSON.stringify(value, null, 2))}>`);
                File_braces($$renderer2, { class: "w-3 h-3" });
                $$renderer2.push(`<!----> ${escape_html(Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`)}</span>`);
              } else {
                $$renderer2.push("<!--[!-->");
                $$renderer2.push(`<span class="text-gremius-subtle">-</span>`);
              }
              $$renderer2.push(`<!--]-->`);
            } else if (colType === "number") {
              $$renderer2.push("<!--[9-->");
              $$renderer2.push(`<span class="text-gremius-text tabular-nums">${escape_html(value !== null && value !== void 0 ? Number(value).toLocaleString() : "-")}</span>`);
            } else {
              $$renderer2.push("<!--[!-->");
              $$renderer2.push(`<span class="text-gremius-text truncate max-w-[250px] block">${escape_html(formatValue(value))}</span>`);
            }
            $$renderer2.push(`<!--]--></td>`);
          }
          $$renderer2.push(`<!--]--><td class="p-3 text-right"><div class="flex items-center justify-end gap-2 flex-wrap"><!--[-->`);
          const each_array_9 = ensure_array_like(rowActions());
          for (let $$index_8 = 0, $$length2 = each_array_9.length; $$index_8 < $$length2; $$index_8++) {
            let action = each_array_9[$$index_8];
            const visible = !action.showIf || row[action.showIf.field] === action.showIf.equals;
            if (visible) {
              $$renderer2.push("<!--[-->");
              $$renderer2.push(`<button${attr_class(clsx(getRowActionClasses(action.variant)))}${attr("title", action.label)}><span>${escape_html(action.label)}</span></button>`);
            } else {
              $$renderer2.push("<!--[!-->");
            }
            $$renderer2.push(`<!--]-->`);
          }
          $$renderer2.push(`<!--]--> <button class="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-gremius-cyan/10 hover:border-gremius-cyan/30 hover:text-gremius-cyan transition-all duration-200" title="Editar">`);
          Square_pen($$renderer2, { class: "w-3.5 h-3.5" });
          $$renderer2.push(`<!----> <span class="text-xs font-medium">Editar</span></button> <button class="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition-all duration-200" title="Eliminar">`);
          Trash_2($$renderer2, { class: "w-3.5 h-3.5" });
          $$renderer2.push(`<!----> <span class="text-xs font-medium">Eliminar</span></button></div></td></tr>`);
        }
        $$renderer2.push(`<!--]-->`);
      }
      $$renderer2.push(`<!--]--></tbody></table></div> <div class="flex items-center justify-between p-3 border-t border-gremius-border"><div class="text-sm text-gremius-text-dim">`);
      if (totalCount > 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`Showing ${escape_html((currentPage - 1) * pageSize + 1)} to ${escape_html(Math.min(currentPage * pageSize, totalCount))} of ${escape_html(totalCount)}`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`No records`);
      }
      $$renderer2.push(`<!--]--></div> <div class="flex items-center gap-2">`);
      $$renderer2.select(
        {
          class: "px-3 py-2 text-sm rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text focus:outline-none focus:ring-2 focus:ring-gremius-cyan/50 focus:border-gremius-cyan/50 transition-all duration-200 hover:border-gremius-cyan/30 cursor-pointer",
          value: pageSize,
          onchange: () => {
            currentPage = 1;
            loadData();
          }
        },
        ($$renderer3) => {
          $$renderer3.option({ value: 10 }, ($$renderer4) => {
            $$renderer4.push(`10 por página`);
          });
          $$renderer3.option({ value: 25 }, ($$renderer4) => {
            $$renderer4.push(`25 por página`);
          });
          $$renderer3.option({ value: 50 }, ($$renderer4) => {
            $$renderer4.push(`50 por página`);
          });
          $$renderer3.option({ value: 100 }, ($$renderer4) => {
            $$renderer4.push(`100 por página`);
          });
        }
      );
      $$renderer2.push(` <div class="flex items-center gap-1 bg-gremius-surface border border-gremius-border rounded-xl p-1"><button class="group p-2 rounded-lg text-gremius-text-dim hover:bg-gremius-cyan/10 hover:text-gremius-cyan disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all duration-200"${attr("disabled", currentPage === 1, true)} title="Primera página">`);
      Chevrons_left($$renderer2, {
        class: "w-4 h-4 group-hover:-translate-x-0.5 transition-transform"
      });
      $$renderer2.push(`<!----></button> <button class="group p-2 rounded-lg text-gremius-text-dim hover:bg-gremius-cyan/10 hover:text-gremius-cyan disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all duration-200"${attr("disabled", currentPage === 1, true)} title="Página anterior">`);
      Chevron_left($$renderer2, {
        class: "w-4 h-4 group-hover:-translate-x-0.5 transition-transform"
      });
      $$renderer2.push(`<!----></button> <span class="px-4 py-1 text-sm font-semibold text-gremius-text tabular-nums bg-gremius-bg rounded-lg border border-gremius-border min-w-[80px] text-center">${escape_html(currentPage)} / ${escape_html(totalPages() || 1)}</span> <button class="group p-2 rounded-lg text-gremius-text-dim hover:bg-gremius-cyan/10 hover:text-gremius-cyan disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all duration-200"${attr("disabled", currentPage >= totalPages(), true)} title="Página siguiente">`);
      Chevron_right($$renderer2, {
        class: "w-4 h-4 group-hover:translate-x-0.5 transition-transform"
      });
      $$renderer2.push(`<!----></button> <button class="group p-2 rounded-lg text-gremius-text-dim hover:bg-gremius-cyan/10 hover:text-gremius-cyan disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all duration-200"${attr("disabled", currentPage >= totalPages(), true)} title="Última página">`);
      Chevrons_right($$renderer2, {
        class: "w-4 h-4 group-hover:translate-x-0.5 transition-transform"
      });
      $$renderer2.push(`<!----></button></div></div></div></div></div>`);
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    const datasetId = derived(() => store_get($$store_subs ??= {}, "$page", page).params.id);
    DataExplorer($$renderer2, {
      grimoireId: datasetId(),
      config: {
        name: `Dataset: ${datasetId()}`,
        singularName: "Entry",
        apiEndpoint: `/api/data-sets/${datasetId()}/entries`,
        views: []
      }
    });
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _page as default
};
