import "clsx";
import "@sveltejs/kit/internal";
import "../../../../chunks/exports.js";
import "../../../../chunks/utils2.js";
import "@sveltejs/kit/internal/server";
import "../../../../chunks/root.js";
import "../../../../chunks/state.svelte.js";
import { j as sanitize_props, k as spread_props, h as slot, a as ensure_array_like, p as attr_style, o as stringify, e as escape_html, b as attr, c as attr_class, l as derived } from "../../../../chunks/index.js";
import "hono";
import "../../../../chunks/SchemaBuilder.svelte_svelte_type_style_lang.js";
import { I as Icon } from "../../../../chunks/Icon.js";
import { F as File_text, I as Image, L as Layers } from "../../../../chunks/layers.js";
import { M as Mail } from "../../../../chunks/mail.js";
import { C as Calendar } from "../../../../chunks/calendar.js";
import { X } from "../../../../chunks/x.js";
import { P as Plus } from "../../../../chunks/plus.js";
import { A as Arrow_left } from "../../../../chunks/arrow-left.js";
function Braces($$renderer, $$props) {
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
        "d": "M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"
      }
    ],
    [
      "path",
      {
        "d": "M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"
      }
    ]
  ];
  Icon($$renderer, spread_props([
    { name: "braces" },
    $$sanitized_props,
    {
      /**
       * @component @name Braces
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNOCAzSDdhMiAyIDAgMCAwLTIgMnY1YTIgMiAwIDAgMS0yIDIgMiAyIDAgMCAxIDIgMnY1YzAgMS4xLjkgMiAyIDJoMSIgLz4KICA8cGF0aCBkPSJNMTYgMjFoMWEyIDIgMCAwIDAgMi0ydi01YzAtMS4xLjktMiAyLTJhMiAyIDAgMCAxLTItMlY1YTIgMiAwIDAgMC0yLTJoLTEiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/braces
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
function Git_branch($$renderer, $$props) {
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
    ["path", { "d": "M15 6a9 9 0 0 0-9 9V3" }],
    ["circle", { "cx": "18", "cy": "6", "r": "3" }],
    ["circle", { "cx": "6", "cy": "18", "r": "3" }]
  ];
  Icon($$renderer, spread_props([
    { name: "git-branch" },
    $$sanitized_props,
    {
      /**
       * @component @name GitBranch
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTUgNmE5IDkgMCAwIDAtOSA5VjMiIC8+CiAgPGNpcmNsZSBjeD0iMTgiIGN5PSI2IiByPSIzIiAvPgogIDxjaXJjbGUgY3g9IjYiIGN5PSIxOCIgcj0iMyIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/git-branch
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
function Git_pull_request($$renderer, $$props) {
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
    ["circle", { "cx": "18", "cy": "18", "r": "3" }],
    ["circle", { "cx": "6", "cy": "6", "r": "3" }],
    ["path", { "d": "M13 6h3a2 2 0 0 1 2 2v7" }],
    ["line", { "x1": "6", "x2": "6", "y1": "9", "y2": "21" }]
  ];
  Icon($$renderer, spread_props([
    { name: "git-pull-request" },
    $$sanitized_props,
    {
      /**
       * @component @name GitPullRequest
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8Y2lyY2xlIGN4PSIxOCIgY3k9IjE4IiByPSIzIiAvPgogIDxjaXJjbGUgY3g9IjYiIGN5PSI2IiByPSIzIiAvPgogIDxwYXRoIGQ9Ik0xMyA2aDNhMiAyIDAgMCAxIDIgMnY3IiAvPgogIDxsaW5lIHgxPSI2IiB4Mj0iNiIgeTE9IjkiIHkyPSIyMSIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/git-pull-request
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
function Grip_vertical($$renderer, $$props) {
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
    ["circle", { "cx": "9", "cy": "12", "r": "1" }],
    ["circle", { "cx": "9", "cy": "5", "r": "1" }],
    ["circle", { "cx": "9", "cy": "19", "r": "1" }],
    ["circle", { "cx": "15", "cy": "12", "r": "1" }],
    ["circle", { "cx": "15", "cy": "5", "r": "1" }],
    ["circle", { "cx": "15", "cy": "19", "r": "1" }]
  ];
  Icon($$renderer, spread_props([
    { name: "grip-vertical" },
    $$sanitized_props,
    {
      /**
       * @component @name GripVertical
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8Y2lyY2xlIGN4PSI5IiBjeT0iMTIiIHI9IjEiIC8+CiAgPGNpcmNsZSBjeD0iOSIgY3k9IjUiIHI9IjEiIC8+CiAgPGNpcmNsZSBjeD0iOSIgY3k9IjE5IiByPSIxIiAvPgogIDxjaXJjbGUgY3g9IjE1IiBjeT0iMTIiIHI9IjEiIC8+CiAgPGNpcmNsZSBjeD0iMTUiIGN5PSI1IiByPSIxIiAvPgogIDxjaXJjbGUgY3g9IjE1IiBjeT0iMTkiIHI9IjEiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/grip-vertical
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
function Hash($$renderer, $$props) {
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
    ["line", { "x1": "4", "x2": "20", "y1": "9", "y2": "9" }],
    ["line", { "x1": "4", "x2": "20", "y1": "15", "y2": "15" }],
    ["line", { "x1": "10", "x2": "8", "y1": "3", "y2": "21" }],
    ["line", { "x1": "16", "x2": "14", "y1": "3", "y2": "21" }]
  ];
  Icon($$renderer, spread_props([
    { name: "hash" },
    $$sanitized_props,
    {
      /**
       * @component @name Hash
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8bGluZSB4MT0iNCIgeDI9IjIwIiB5MT0iOSIgeTI9IjkiIC8+CiAgPGxpbmUgeDE9IjQiIHgyPSIyMCIgeTE9IjE1IiB5Mj0iMTUiIC8+CiAgPGxpbmUgeDE9IjEwIiB4Mj0iOCIgeTE9IjMiIHkyPSIyMSIgLz4KICA8bGluZSB4MT0iMTYiIHgyPSIxNCIgeTE9IjMiIHkyPSIyMSIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/hash
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
function Link_2($$renderer, $$props) {
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
    ["path", { "d": "M9 17H7A5 5 0 0 1 7 7h2" }],
    ["path", { "d": "M15 7h2a5 5 0 1 1 0 10h-2" }],
    ["line", { "x1": "8", "x2": "16", "y1": "12", "y2": "12" }]
  ];
  Icon($$renderer, spread_props([
    { name: "link-2" },
    $$sanitized_props,
    {
      /**
       * @component @name Link2
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNOSAxN0g3QTUgNSAwIDAgMSA3IDdoMiIgLz4KICA8cGF0aCBkPSJNMTUgN2gyYTUgNSAwIDEgMSAwIDEwaC0yIiAvPgogIDxsaW5lIHgxPSI4IiB4Mj0iMTYiIHkxPSIxMiIgeTI9IjEyIiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/link-2
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
function List($$renderer, $$props) {
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
    ["path", { "d": "M3 5h.01" }],
    ["path", { "d": "M3 12h.01" }],
    ["path", { "d": "M3 19h.01" }],
    ["path", { "d": "M8 5h13" }],
    ["path", { "d": "M8 12h13" }],
    ["path", { "d": "M8 19h13" }]
  ];
  Icon($$renderer, spread_props([
    { name: "list" },
    $$sanitized_props,
    {
      /**
       * @component @name List
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMyA1aC4wMSIgLz4KICA8cGF0aCBkPSJNMyAxMmguMDEiIC8+CiAgPHBhdGggZD0iTTMgMTloLjAxIiAvPgogIDxwYXRoIGQ9Ik04IDVoMTMiIC8+CiAgPHBhdGggZD0iTTggMTJoMTMiIC8+CiAgPHBhdGggZD0iTTggMTloMTMiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/list
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
function Save($$renderer, $$props) {
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
        "d": "M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
      }
    ],
    ["path", { "d": "M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" }],
    ["path", { "d": "M7 3v4a1 1 0 0 0 1 1h7" }]
  ];
  Icon($$renderer, spread_props([
    { name: "save" },
    $$sanitized_props,
    {
      /**
       * @component @name Save
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTUuMiAzYTIgMiAwIDAgMSAxLjQuNmwzLjggMy44YTIgMiAwIDAgMSAuNiAxLjRWMTlhMiAyIDAgMCAxLTIgMkg1YTIgMiAwIDAgMS0yLTJWNWEyIDIgMCAwIDEgMi0yeiIgLz4KICA8cGF0aCBkPSJNMTcgMjF2LTdhMSAxIDAgMCAwLTEtMUg4YTEgMSAwIDAgMC0xIDF2NyIgLz4KICA8cGF0aCBkPSJNNyAzdjRhMSAxIDAgMCAwIDEgMWg3IiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/save
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
function Shield($$renderer, $$props) {
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
        "d": "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
      }
    ]
  ];
  Icon($$renderer, spread_props([
    { name: "shield" },
    $$sanitized_props,
    {
      /**
       * @component @name Shield
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMjAgMTNjMCA1LTMuNSA3LjUtNy42NiA4Ljk1YTEgMSAwIDAgMS0uNjctLjAxQzcuNSAyMC41IDQgMTggNCAxM1Y2YTEgMSAwIDAgMSAxLTFjMiAwIDQuNS0xLjIgNi4yNC0yLjcyYTEuMTcgMS4xNyAwIDAgMSAxLjUyIDBDMTQuNTEgMy44MSAxNyA1IDE5IDVhMSAxIDAgMCAxIDEgMXoiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/shield
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
function Toggle_left($$renderer, $$props) {
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
    ["circle", { "cx": "9", "cy": "12", "r": "3" }],
    [
      "rect",
      { "width": "20", "height": "14", "x": "2", "y": "5", "rx": "7" }
    ]
  ];
  Icon($$renderer, spread_props([
    { name: "toggle-left" },
    $$sanitized_props,
    {
      /**
       * @component @name ToggleLeft
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8Y2lyY2xlIGN4PSI5IiBjeT0iMTIiIHI9IjMiIC8+CiAgPHJlY3Qgd2lkdGg9IjIwIiBoZWlnaHQ9IjE0IiB4PSIyIiB5PSI1IiByeD0iNyIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/toggle-left
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
function Type($$renderer, $$props) {
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
    ["path", { "d": "M12 4v16" }],
    ["path", { "d": "M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" }],
    ["path", { "d": "M9 20h6" }]
  ];
  Icon($$renderer, spread_props([
    { name: "type" },
    $$sanitized_props,
    {
      /**
       * @component @name Type
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTIgNHYxNiIgLz4KICA8cGF0aCBkPSJNNCA3VjVhMSAxIDAgMCAxIDEtMWgxNGExIDEgMCAwIDEgMSAxdjIiIC8+CiAgPHBhdGggZD0iTTkgMjBoNiIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/type
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
const FIELD_TYPE_OPTIONS = [
  { type: "text", label: "Text", icon: "Type", description: "Single or multi-line text", color: "#00E5FF" },
  { type: "number", label: "Number", icon: "Hash", description: "Integer or decimal", color: "#76FF03" },
  { type: "boolean", label: "Boolean", icon: "ToggleLeft", description: "True / False toggle", color: "#FFD600" },
  { type: "date", label: "Date", icon: "Calendar", description: "Date or datetime", color: "#E040FB" },
  { type: "image", label: "Image", icon: "ImageIcon", description: "Image upload or URL", color: "#FF6E40" },
  { type: "url", label: "URL", icon: "Link2", description: "Web address", color: "#40C4FF" },
  { type: "email", label: "Email", icon: "Mail", description: "Email address", color: "#FFAB00" },
  { type: "select", label: "Select", icon: "List", description: "Dropdown from options", color: "#69F0AE" },
  { type: "json", label: "JSON", icon: "Braces", description: "Raw JSON object", color: "#B388FF" },
  { type: "richtext", label: "Rich Text", icon: "FileText", description: "Formatted content", color: "#FF80AB" },
  { type: "relation", label: "Relation", icon: "GitBranch", description: "Link to another collection", color: "#FF2A6D" },
  { type: "kpi", label: "KPI / Formula", icon: "Calculator", description: "Calculated metric", color: "#FF1493" }
];
function SchemaBuilder($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { definition, allDatasets = [] } = $$props;
    let activeTab = "fields";
    const tabs = [
      { id: "fields", label: "Fields", icon: Layers },
      { id: "security", label: "Security", icon: Shield },
      { id: "workflow", label: "Workflow", icon: Git_pull_request }
    ];
    const iconMap = {
      Type,
      Hash,
      ToggleLeft: Toggle_left,
      Calendar,
      ImageIcon: Image,
      Link2: Link_2,
      Mail,
      List,
      Braces,
      FileText: File_text,
      GitBranch: Git_branch
    };
    const iconOptions = [
      "📦",
      "⚔️",
      "🛡️",
      "🧪",
      "👤",
      "🗺️",
      "📊",
      "🏆",
      "📜",
      "🎮",
      "🎯",
      "🔮",
      "💎",
      "🏠",
      "🔧"
    ];
    let localDef = JSON.parse(JSON.stringify(definition));
    let selectedFieldId = null;
    let dragOverIndex = -1;
    let selectedField = derived(() => localDef.fields.find((f) => f.id === selectedFieldId) || null);
    let otherDatasets = derived(() => allDatasets.filter((d) => d.id !== localDef.id));
    let validationErrors = derived(() => {
      const errs = [];
      if (!localDef.name.trim()) errs.push("Dataset name is required");
      if (localDef.fields.length === 0) errs.push("Add at least one field");
      for (const f of localDef.fields) {
        if (!f.label.trim()) errs.push(`Field at position ${f.order + 1} needs a label`);
        if (!f.key.trim()) errs.push(`Field "${f.label}" needs a key`);
      }
      const keys = localDef.fields.map((f) => f.key).filter(Boolean);
      const dups = keys.filter((k, i) => keys.indexOf(k) !== i);
      if (dups.length) errs.push(`Duplicate field key: "${dups[0]}"`);
      return errs;
    });
    let canSave = derived(() => validationErrors().length === 0);
    function getFieldColor(type) {
      return FIELD_TYPE_OPTIONS.find((f) => f.type === type)?.color || "#888";
    }
    function getFieldIcon(type) {
      const opt = FIELD_TYPE_OPTIONS.find((f) => f.type === type);
      return iconMap[opt?.icon || "Type"] || Type;
    }
    function getFieldTypeLabel(type) {
      return FIELD_TYPE_OPTIONS.find((f) => f.type === type)?.label || type;
    }
    $$renderer2.push(`<div class="flex h-[calc(100vh-9rem)] gap-4 animate-fade-in">`);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="w-56 shrink-0 card overflow-y-auto"><div class="p-3 border-b border-gremius-border sticky top-0 bg-gremius-card z-10"><p class="label">Field Types</p> <p class="text-[10px] text-gremius-subtle mt-0.5">Drag or click to add</p></div> <div class="p-2 space-y-1"><!--[-->`);
      const each_array = ensure_array_like(FIELD_TYPE_OPTIONS);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let ft = each_array[$$index];
        $$renderer2.push(`<button draggable="true" class="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-gremius-border/30 transition-all cursor-grab active:cursor-grabbing group"><div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors"${attr_style(`background: ${stringify(ft.color)}12; border: 1px solid ${stringify(ft.color)}25`)}>`);
        if (iconMap[ft.icon]) {
          $$renderer2.push("<!--[-->");
          const IconComponent = iconMap[ft.icon];
          if (IconComponent) {
            $$renderer2.push("<!--[-->");
            IconComponent($$renderer2, { class: "w-4 h-4", style: `color: ${stringify(ft.color)}` });
            $$renderer2.push("<!--]-->");
          } else {
            $$renderer2.push("<!--[!-->");
            $$renderer2.push("<!--]-->");
          }
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div> <div class="min-w-0"><p class="font-medium text-gremius-text group-hover:text-gremius-text transition-colors">${escape_html(ft.label)}</p> <p class="text-[10px] text-gremius-subtle truncate">${escape_html(ft.description)}</p></div></button>`);
      }
      $$renderer2.push(`<!--]--></div></div>`);
    }
    $$renderer2.push(`<!--]--> <div class="flex-1 flex flex-col min-w-0"><div class="card p-4 mb-4"><div class="grid grid-cols-2 gap-4"><div><label class="label mb-1.5 block">Dataset Name *</label> <input${attr("value", localDef.name)} type="text" placeholder="e.g. Products" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-gray-100 placeholder-slate-400 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"/></div> <div><label class="label mb-1.5 block">Slug</label> <div class="flex items-center gap-2"><input${attr("value", localDef.slug)} type="text" placeholder="products" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-gray-100 placeholder-slate-400 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-xs"/> `);
    $$renderer2.select(
      {
        value: localDef.icon,
        class: "w-20 px-2 py-2 bg-slate-800 border border-slate-700 text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 text-center text-lg appearance-none"
      },
      ($$renderer3) => {
        $$renderer3.push(`<!--[-->`);
        const each_array_1 = ensure_array_like(iconOptions);
        for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
          let ic = each_array_1[$$index_1];
          $$renderer3.option({ value: ic }, ($$renderer4) => {
            $$renderer4.push(`${escape_html(ic)}`);
          });
        }
        $$renderer3.push(`<!--]-->`);
      }
    );
    $$renderer2.push(`</div></div></div> <div class="mt-3"><label class="label mb-1.5 block">Description</label> <input${attr("value", localDef.description)} type="text" placeholder="Optional description for this data set" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-gray-100 placeholder-slate-400 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"/></div></div> <div class="flex items-center gap-1 mb-3"><!--[-->`);
    const each_array_2 = ensure_array_like(tabs);
    for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
      let tab = each_array_2[$$index_2];
      $$renderer2.push(`<button${attr_class(
        `flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all border ${stringify(activeTab === tab.id ? "bg-gremius-cyan-10 text-gremius-cyan border-gremius-cyan-20" : "text-gremius-text-dim hover:text-gremius-text hover:bg-gremius-border/20 border-transparent")}`,
        "svelte-1cjslh8"
      )}>`);
      if (tab.icon) {
        $$renderer2.push("<!--[-->");
        tab.icon($$renderer2, { class: "w-3.5 h-3.5" });
        $$renderer2.push("<!--]-->");
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push("<!--]-->");
      }
      $$renderer2.push(` ${escape_html(tab.label)} `);
      if (tab.id === "security" && localDef.policyJson) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<span class="w-1.5 h-1.5 rounded-full bg-gremius-amber"></span>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (tab.id === "workflow" && localDef.workflowJson?.requireApproval) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<span class="w-1.5 h-1.5 rounded-full bg-gremius-purple"></span>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></button>`);
    }
    $$renderer2.push(`<!--]--></div>  `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex-1 flex flex-col min-h-0"><div class="flex-1 card overflow-y-auto"><div class="p-3 border-b border-gremius-border sticky top-0 bg-gremius-card z-10 flex items-center justify-between"><div class="flex items-center gap-2"><p class="label">Schema Fields</p> <span class="badge-cyan text-[9px]">${escape_html(localDef.fields.length)}</span></div> `);
      if (localDef.fields.length > 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<button class="btn-ghost btn-sm text-[10px]">Collapse All</button>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div> `);
      if (localDef.fields.length === 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="flex flex-col items-center justify-center py-12 text-gremius-subtle">`);
        Layers($$renderer2, { class: "w-10 h-10 mb-3 text-gremius-muted" });
        $$renderer2.push(`<!----> <p class="text-sm font-medium">No fields yet</p> <p class="text-xs mt-1">Click or drag field types from the left panel</p></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<div class="divide-y divide-gremius-border/50"><!--[-->`);
        const each_array_3 = ensure_array_like(localDef.fields);
        for (let idx = 0, $$length = each_array_3.length; idx < $$length; idx++) {
          let field = each_array_3[idx];
          $$renderer2.push(`<div draggable="true"${attr_class(`group transition-all ${stringify(dragOverIndex === idx ? "ring-2 ring-gremius-cyan-30 ring-inset" : "")} ${stringify(selectedFieldId === field.id ? "bg-gremius-cyan/[0.04]" : "hover:bg-gremius-border/20")}`)}><div role="button" tabindex="0" class="flex items-center gap-3 px-4 py-3 w-full text-left">`);
          Grip_vertical($$renderer2, {
            class: "w-4 h-4 text-gremius-muted shrink-0 opacity-0 group-hover:opacity-60 cursor-grab transition-opacity"
          });
          $$renderer2.push(`<!----> <div class="w-7 h-7 rounded-md flex items-center justify-center shrink-0"${attr_style(`background: ${stringify(getFieldColor(field.type))}15; border: 1px solid ${stringify(getFieldColor(field.type))}20`)}>`);
          if (getFieldIcon(field.type)) {
            $$renderer2.push("<!--[-->");
            const FieldIcon = getFieldIcon(field.type);
            if (FieldIcon) {
              $$renderer2.push("<!--[-->");
              FieldIcon($$renderer2, {
                class: "w-3.5 h-3.5",
                style: `color: ${stringify(getFieldColor(field.type))}`
              });
              $$renderer2.push("<!--]-->");
            } else {
              $$renderer2.push("<!--[!-->");
              $$renderer2.push("<!--]-->");
            }
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--></div> <div class="flex-1 min-w-0"><p class="text-sm font-medium text-gremius-text truncate">${escape_html(field.label || "Untitled Field")} `);
          if (field.isRequired) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span class="text-gremius-pink ml-1">*</span>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--></p> <p class="text-[10px] font-mono text-gremius-subtle">${escape_html(field.key || "(no key)")} · ${escape_html(field.type)}</p></div> <div class="flex items-center gap-1.5 shrink-0">`);
          if (field.isUnique) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span class="badge-amber text-[8px] py-0">UNQ</span>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if (field.relation) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span class="badge-pink text-[8px] py-0">${escape_html(field.relation.type === "many-to-many" ? "M:N" : field.relation.type === "one-to-many" ? "1:N" : "1:1")}</span>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--></div> <button type="button" class="btn-icon p-1.5 opacity-0 group-hover:opacity-100 hover:!text-gremius-pink transition-all">`);
          X($$renderer2, { class: "w-3.5 h-3.5" });
          $$renderer2.push(`<!----></button></div></div>`);
        }
        $$renderer2.push(`<!--]--></div>`);
      }
      $$renderer2.push(`<!--]--></div></div>`);
    }
    $$renderer2.push(`<!--]-->  `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->  `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div class="mt-4 flex items-center justify-between">`);
    if (validationErrors().length > 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<p class="text-xs text-gremius-pink">${escape_html(validationErrors()[0])}</p>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div></div>`);
    }
    $$renderer2.push(`<!--]--> <div class="flex items-center gap-3"><button class="btn-ghost">Cancel</button> <button${attr("disabled", !canSave(), true)} class="btn-primary">`);
    Save($$renderer2, { class: "w-4 h-4" });
    $$renderer2.push(`<!----> ${escape_html(localDef.id ? "Update Schema" : "Create Dataset")}</button></div></div></div> `);
    if (selectedField() && activeTab === "fields") {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="w-80 shrink-0 card overflow-y-auto"><div class="p-4 border-b border-gremius-border sticky top-0 bg-gremius-card z-10"><div class="flex items-center justify-between"><p class="label">Field Settings</p> <button class="btn-icon p-1">`);
      X($$renderer2, { class: "w-4 h-4" });
      $$renderer2.push(`<!----></button></div> <div class="flex items-center gap-2 mt-2"><div class="w-6 h-6 rounded flex items-center justify-center"${attr_style(`background: ${stringify(getFieldColor(selectedField().type))}15`)}>`);
      if (getFieldIcon(selectedField().type)) {
        $$renderer2.push("<!--[-->");
        const SFI = getFieldIcon(selectedField().type);
        if (SFI) {
          $$renderer2.push("<!--[-->");
          SFI($$renderer2, {
            class: "w-3 h-3",
            style: `color: ${stringify(getFieldColor(selectedField().type))}`
          });
          $$renderer2.push("<!--]-->");
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push("<!--]-->");
        }
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div> <span class="text-xs font-medium text-gremius-text">${escape_html(getFieldTypeLabel(selectedField().type))}</span></div></div> <div class="p-4 space-y-5"><div><label class="label mb-1.5 block">Label *</label> <input${attr("value", selectedField().label)} type="text" placeholder="e.g. Weapon Name" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-gray-100 placeholder-slate-400 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"/></div> <div><label class="label mb-1.5 block">Machine Key</label> <input${attr("value", selectedField().key)} type="text" placeholder="e.g. weapon_name" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-gray-100 placeholder-slate-400 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-xs"/></div> <div><label class="label mb-1.5 block">Help Text</label> <input${attr("value", selectedField().helpText)} type="text" placeholder="Shown below the field" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-gray-100 placeholder-slate-400 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"/></div> <div class="pt-3 border-t border-gremius-border"><p class="label mb-3">Validation Rules</p> <div class="flex items-center justify-between py-2"><div><p class="text-sm text-gremius-text">Required</p> <p class="text-[10px] text-gremius-subtle">Must have a value</p></div> <button${attr_class(`relative w-10 h-6 rounded-full transition-colors ${stringify(selectedField().isRequired ? "bg-gremius-cyan" : "bg-gremius-border")}`)}><span${attr_class(`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${stringify(selectedField().isRequired ? "translate-x-4.5" : "translate-x-0.5")}`)}></span></button></div> <div class="flex items-center justify-between py-2"><div><p class="text-sm text-gremius-text">Unique</p> <p class="text-[10px] text-gremius-subtle">No duplicate values</p></div> <button${attr_class(`relative w-10 h-6 rounded-full transition-colors ${stringify(selectedField().isUnique ? "bg-gremius-amber" : "bg-gremius-border")}`)}><span${attr_class(`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${stringify(selectedField().isUnique ? "translate-x-4.5" : "translate-x-0.5")}`)}></span></button></div> <div class="pt-2"><label class="label mb-1.5 block">Default Value</label> <input${attr("value", selectedField().defaultValue)} type="text" placeholder="e.g. Unknown" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-gray-100 placeholder-slate-400 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"/></div> `);
      if (["text", "email", "url"].includes(selectedField().type)) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="pt-2"><label class="label mb-1.5 block">Validation Regex</label> <input${attr("value", selectedField().validationRegex)} type="text" placeholder="e.g. ^[A-Za-z0-9]+$" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-gray-100 placeholder-slate-400 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-xs"/></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (selectedField().type === "number") {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="pt-2 grid grid-cols-2 gap-3"><div><label class="label mb-1.5 block">Min</label> <input${attr("value", selectedField().minValue)} type="number" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-gray-100 placeholder-slate-400 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="0"/></div> <div><label class="label mb-1.5 block">Max</label> <input${attr("value", selectedField().maxValue)} type="number" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-gray-100 placeholder-slate-400 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="100"/></div></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (selectedField().type === "text") {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="pt-2 grid grid-cols-2 gap-3"><div><label class="label mb-1.5 block">Min Length</label> <input${attr("value", selectedField().minLength)} type="number" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-gray-100 placeholder-slate-400 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="0"/></div> <div><label class="label mb-1.5 block">Max Length</label> <input${attr("value", selectedField().maxLength)} type="number" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-gray-100 placeholder-slate-400 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="255"/></div></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div> `);
      if (selectedField().type === "select") {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="pt-3 border-t border-gremius-border"><p class="label mb-3">Options</p> <div class="space-y-2"><!--[-->`);
        const each_array_8 = ensure_array_like(selectedField().options || []);
        for (let oi = 0, $$length = each_array_8.length; oi < $$length; oi++) {
          let opt = each_array_8[oi];
          $$renderer2.push(`<div class="flex items-center gap-2"><input${attr("value", opt.label)} type="text"${attr("placeholder", `Option ${stringify(oi + 1)}`)} class="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-gray-100 placeholder-slate-400 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 flex-1"/> <button class="btn-icon p-1.5 hover:!text-gremius-pink">`);
          X($$renderer2, { class: "w-3.5 h-3.5" });
          $$renderer2.push(`<!----></button></div>`);
        }
        $$renderer2.push(`<!--]--></div> <button class="btn-ghost btn-sm mt-2 w-full justify-center">`);
        Plus($$renderer2, { class: "w-3.5 h-3.5" });
        $$renderer2.push(`<!----> Add Option</button></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (selectedField().type === "relation") {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="pt-3 border-t border-gremius-border"><p class="label mb-3">`);
        Git_branch($$renderer2, { class: "w-3 h-3 inline text-gremius-pink mr-1" });
        $$renderer2.push(`<!----> Relationship</p> <div class="mb-3"><label class="label mb-1.5 block">Link to Collection</label> `);
        if (selectedField().relation) {
          $$renderer2.push("<!--[-->");
          $$renderer2.select(
            {
              value: selectedField().relation.target,
              class: "w-full px-3 py-2 bg-slate-800 border border-slate-700 text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 appearance-none"
            },
            ($$renderer3) => {
              $$renderer3.option({ value: "" }, ($$renderer4) => {
                $$renderer4.push(`— Select collection —`);
              });
              $$renderer3.option({ value: "games" }, ($$renderer4) => {
                $$renderer4.push(`🎮 Games`);
              });
              $$renderer3.option({ value: "blog-posts" }, ($$renderer4) => {
                $$renderer4.push(`📝 Blog Posts`);
              });
              $$renderer3.option({ value: "platforms" }, ($$renderer4) => {
                $$renderer4.push(`🖥️ Platforms`);
              });
              $$renderer3.option({ value: "tags" }, ($$renderer4) => {
                $$renderer4.push(`🏷️ Tags`);
              });
              $$renderer3.option({ value: "streamers" }, ($$renderer4) => {
                $$renderer4.push(`📺 Streamers`);
              });
              $$renderer3.push(`<optgroup label="── Datasets ──"><!--[-->`);
              const each_array_9 = ensure_array_like(otherDatasets());
              for (let $$index_9 = 0, $$length = each_array_9.length; $$index_9 < $$length; $$index_9++) {
                let ds = each_array_9[$$index_9];
                $$renderer3.option({ value: `dataset:${stringify(ds.id)}` }, ($$renderer4) => {
                  $$renderer4.push(`${escape_html(ds.icon || "📦")} ${escape_html(ds.name)}`);
                });
              }
              $$renderer3.push(`<!--]--></optgroup>`);
            }
          );
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div> <div class="mb-3"><label class="label mb-1.5 block">Cardinality</label> <div class="grid grid-cols-3 gap-2"><!--[-->`);
        const each_array_10 = ensure_array_like(["one-to-one", "one-to-many", "many-to-many"]);
        for (let $$index_10 = 0, $$length = each_array_10.length; $$index_10 < $$length; $$index_10++) {
          let rt = each_array_10[$$index_10];
          $$renderer2.push(`<button${attr_class(
            `card-glow p-3 text-center transition-all text-xs font-medium ${stringify(selectedField().relation?.type === rt ? "border-gremius-pink-40 bg-gremius-pink-5 text-gremius-pink" : "text-gremius-text-dim hover:text-gremius-text")}`,
            "svelte-1cjslh8"
          )}><p class="text-lg mb-1">${escape_html(rt === "one-to-one" ? "1↔1" : rt === "one-to-many" ? "1→N" : "M↔N")}</p> <p>${escape_html(rt === "one-to-one" ? "Has One" : rt === "one-to-many" ? "Has Many" : "Many-Many")}</p></button>`);
        }
        $$renderer2.push(`<!--]--></div></div> <div><label class="label mb-1.5 block">Display Field</label> `);
        if (selectedField().relation) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<input${attr("value", selectedField().relation.displayField)} type="text" placeholder="e.g. title, name" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-gray-100 placeholder-slate-400 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"/> <p class="text-[10px] text-gremius-subtle mt-1">Which field to show in the selector</p>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> <div class="pt-3 border-t border-gremius-border"><p class="label mb-3">Display</p> <div class="flex items-center justify-between py-2"><div><p class="text-sm text-gremius-text">Hidden in Grid</p> <p class="text-[10px] text-gremius-subtle">Only visible in form</p></div> <button${attr_class(`relative w-10 h-6 rounded-full transition-colors ${stringify(selectedField().hidden ? "bg-gremius-subtle" : "bg-gremius-border")}`)}><span${attr_class(`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${stringify(selectedField().hidden ? "translate-x-4.5" : "translate-x-0.5")}`)}></span></button></div> <div class="pt-2"><label class="label mb-1.5 block">Column Width (px)</label> <input${attr("value", selectedField().width)} type="number" placeholder="Auto" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-gray-100 placeholder-slate-400 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"/></div></div></div></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const initialDatasetData = {
      id: "",
      name: "",
      slug: "",
      icon: "📦",
      description: "",
      fields: [],
      customEndpoints: []
    };
    $$renderer2.push(`<div class="space-y-6 animate-fade-in pb-20"><div class="flex items-center gap-4"><button class="btn-icon p-2 hover:bg-gremius-surface rounded-lg transition-colors text-gremius-subtle">`);
    Arrow_left($$renderer2, { class: "w-5 h-5" });
    $$renderer2.push(`<!----></button> <div><h1 class="text-2xl font-bold text-gremius-text">Create Dataset</h1> <p class="text-sm text-gremius-text-dim mt-1">Define the schema and fields for your new data collection API.</p></div></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div class="card p-6 border-gremius-cyan/20">`);
    SchemaBuilder($$renderer2, {
      definition: initialDatasetData
    });
    $$renderer2.push(`<!----></div></div>`);
  });
}
export {
  _page as default
};
