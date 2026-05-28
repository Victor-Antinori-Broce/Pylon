import { j as sanitize_props, k as spread_props, h as slot, c as attr_class, o as stringify, b as attr, a as ensure_array_like, e as escape_html } from "./index.js";
/* empty css                                        */
import "@sveltejs/kit/internal";
import "./exports.js";
import "./utils2.js";
import "@sveltejs/kit/internal/server";
import "./root.js";
import "./state.svelte.js";
import { I as Icon } from "./Icon.js";
import { A as Activity } from "./activity.js";
import { C as Chevron_right } from "./chevron-right.js";
import { Z as Zap } from "./zap.js";
import { D as Database } from "./database.js";
import { I as Image, L as Layers, F as File_text } from "./layers.js";
function Arrow_right($$renderer, $$props) {
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
    ["path", { "d": "M5 12h14" }],
    ["path", { "d": "m12 5 7 7-7 7" }]
  ];
  Icon($$renderer, spread_props([
    { name: "arrow-right" },
    $$sanitized_props,
    {
      /**
       * @component @name ArrowRight
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNNSAxMmgxNCIgLz4KICA8cGF0aCBkPSJtMTIgNSA3IDctNyA3IiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/arrow-right
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
function Blocks($$renderer, $$props) {
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
        "d": "M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2"
      }
    ],
    [
      "rect",
      { "x": "14", "y": "2", "width": "8", "height": "8", "rx": "1" }
    ]
  ];
  Icon($$renderer, spread_props([
    { name: "blocks" },
    $$sanitized_props,
    {
      /**
       * @component @name Blocks
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTAgMjJWN2ExIDEgMCAwIDAtMS0xSDRhMiAyIDAgMCAwLTIgMnYxMmEyIDIgMCAwIDAgMiAyaDEyYTIgMiAwIDAgMCAyLTJ2LTVhMSAxIDAgMCAwLTEtMUgyIiAvPgogIDxyZWN0IHg9IjE0IiB5PSIyIiB3aWR0aD0iOCIgaGVpZ2h0PSI4IiByeD0iMSIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/blocks
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
function Layout_dashboard($$renderer, $$props) {
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
      { "width": "7", "height": "9", "x": "3", "y": "3", "rx": "1" }
    ],
    [
      "rect",
      { "width": "7", "height": "5", "x": "14", "y": "3", "rx": "1" }
    ],
    [
      "rect",
      { "width": "7", "height": "9", "x": "14", "y": "12", "rx": "1" }
    ],
    [
      "rect",
      { "width": "7", "height": "5", "x": "3", "y": "16", "rx": "1" }
    ]
  ];
  Icon($$renderer, spread_props([
    { name: "layout-dashboard" },
    $$sanitized_props,
    {
      /**
       * @component @name LayoutDashboard
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cmVjdCB3aWR0aD0iNyIgaGVpZ2h0PSI5IiB4PSIzIiB5PSIzIiByeD0iMSIgLz4KICA8cmVjdCB3aWR0aD0iNyIgaGVpZ2h0PSI1IiB4PSIxNCIgeT0iMyIgcng9IjEiIC8+CiAgPHJlY3Qgd2lkdGg9IjciIGhlaWdodD0iOSIgeD0iMTQiIHk9IjEyIiByeD0iMSIgLz4KICA8cmVjdCB3aWR0aD0iNyIgaGVpZ2h0PSI1IiB4PSIzIiB5PSIxNiIgcng9IjEiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/layout-dashboard
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
function Pen_tool($$renderer, $$props) {
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
        "d": "M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z"
      }
    ],
    [
      "path",
      {
        "d": "m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18"
      }
    ],
    ["path", { "d": "m2.3 2.3 7.286 7.286" }],
    ["circle", { "cx": "11", "cy": "11", "r": "2" }]
  ];
  Icon($$renderer, spread_props([
    { name: "pen-tool" },
    $$sanitized_props,
    {
      /**
       * @component @name PenTool
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTUuNzA3IDIxLjI5M2ExIDEgMCAwIDEtMS40MTQgMGwtMS41ODYtMS41ODZhMSAxIDAgMCAxIDAtMS40MTRsNS41ODYtNS41ODZhMSAxIDAgMCAxIDEuNDE0IDBsMS41ODYgMS41ODZhMSAxIDAgMCAxIDAgMS40MTR6IiAvPgogIDxwYXRoIGQ9Im0xOCAxMy0xLjM3NS02Ljg3NGExIDEgMCAwIDAtLjc0Ni0uNzc2TDMuMjM1IDIuMDI4YTEgMSAwIDAgMC0xLjIwNyAxLjIwN0w1LjM1IDE1Ljg3OWExIDEgMCAwIDAgLjc3Ni43NDZMMTMgMTgiIC8+CiAgPHBhdGggZD0ibTIuMyAyLjMgNy4yODYgNy4yODYiIC8+CiAgPGNpcmNsZSBjeD0iMTEiIGN5PSIxMSIgcj0iMiIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/pen-tool
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
function Sparkles($$renderer, $$props) {
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
        "d": "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"
      }
    ],
    ["path", { "d": "M20 2v4" }],
    ["path", { "d": "M22 4h-4" }],
    ["circle", { "cx": "4", "cy": "20", "r": "2" }]
  ];
  Icon($$renderer, spread_props([
    { name: "sparkles" },
    $$sanitized_props,
    {
      /**
       * @component @name Sparkles
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTEuMDE3IDIuODE0YTEgMSAwIDAgMSAxLjk2NiAwbDEuMDUxIDUuNTU4YTIgMiAwIDAgMCAxLjU5NCAxLjU5NGw1LjU1OCAxLjA1MWExIDEgMCAwIDEgMCAxLjk2NmwtNS41NTggMS4wNTFhMiAyIDAgMCAwLTEuNTk0IDEuNTk0bC0xLjA1MSA1LjU1OGExIDEgMCAwIDEtMS45NjYgMGwtMS4wNTEtNS41NThhMiAyIDAgMCAwLTEuNTk0LTEuNTk0bC01LjU1OC0xLjA1MWExIDEgMCAwIDEgMC0xLjk2Nmw1LjU1OC0xLjA1MWEyIDIgMCAwIDAgMS41OTQtMS41OTR6IiAvPgogIDxwYXRoIGQ9Ik0yMCAydjQiIC8+CiAgPHBhdGggZD0iTTIyIDRoLTQiIC8+CiAgPGNpcmNsZSBjeD0iNCIgY3k9IjIwIiByPSIyIiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/sparkles
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
function DynamicComponent($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { component, props = {}, class: className = "", onMount } = $$props;
    $$renderer2.push(`<div${attr_class(
      `dynamic-component ${stringify(
        // Ejecutar callback cuando se monta
        className
      )}`,
      "svelte-vvtghr"
    )} data-testid="dynamic-component">`);
    if (component) {
      $$renderer2.push("<!--[-->");
      component($$renderer2, spread_props([props]));
      $$renderer2.push("<!--]-->");
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push("<!--]-->");
    }
    $$renderer2.push(`</div>`);
  });
}
function WidgetSlot($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      name,
      class: className = "",
      animated = true,
      wrapper = "none",
      empty
    } = $$props;
    let widgets = [];
    const wrapperClasses = {
      none: "",
      card: "bg-gremius-card border border-gremius-border rounded-xl p-4",
      border: "border-b border-gremius-border last:border-b-0 py-4"
    };
    $$renderer2.push(`<div${attr_class(`widget-slot widget-slot--${stringify(name.replace(/:/g, "-"))} ${stringify(className)}`, "svelte-8ae24v")}${attr("data-slot", name)}>`);
    if (widgets.length === 0) {
      $$renderer2.push("<!--[-->");
      if (empty) {
        $$renderer2.push("<!--[-->");
        empty($$renderer2);
        $$renderer2.push(`<!---->`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]-->`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<!--[-->`);
      const each_array = ensure_array_like(widgets);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let widget = each_array[$$index];
        const Component = widget.component;
        $$renderer2.push(`<div${attr_class(`widget-slot__item ${stringify(wrapperClasses[wrapper])}`, "svelte-8ae24v")}${attr("data-widget-id", widget.id)}${attr("data-widget-module", widget.module)}>`);
        if (animated) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div>`);
          DynamicComponent($$renderer2, { component: Component, props: widget.props });
          $$renderer2.push(`<!----></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
          DynamicComponent($$renderer2, { component: Component, props: widget.props });
        }
        $$renderer2.push(`<!--]--></div>`);
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
function Dashboard($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let recentActivity = [];
    const quickActions = [
      {
        label: "New Post",
        href: "/posts/new",
        icon: Pen_tool,
        color: "green",
        description: "Create a blog post"
      },
      {
        label: "New Dataset",
        href: "/datasets/new",
        icon: Database,
        color: "amber",
        description: "Create data collection"
      },
      {
        label: "New Page",
        href: "/blocks/new",
        icon: Blocks,
        color: "pink",
        description: "Build a page"
      },
      {
        label: "Upload Media",
        href: "/media",
        icon: Image,
        color: "purple",
        description: "Add files"
      }
    ];
    const coreGrimoires = [
      {
        id: "datasets",
        label: "Datasets",
        description: "Data collections",
        icon: Database,
        color: "amber",
        href: "/datasets"
      },
      {
        id: "blog",
        label: "Blog",
        description: "Posts & articles",
        icon: File_text,
        color: "green",
        href: "/posts"
      },
      {
        id: "pages",
        label: "Pages",
        description: "Page builder",
        icon: Blocks,
        color: "pink",
        href: "/blocks"
      },
      {
        id: "media",
        label: "Media",
        description: "File library",
        icon: Image,
        color: "purple",
        href: "/media"
      },
      {
        id: "actions",
        label: "Actions",
        description: "Automations",
        icon: Zap,
        color: "cyan",
        href: "/actions"
      }
    ];
    function getBorderHoverClass(color) {
      const map = {
        cyan: "hover:border-cyan-500/30",
        green: "hover:border-green-500/30",
        amber: "hover:border-amber-500/30",
        purple: "hover:border-purple-500/30",
        pink: "hover:border-pink-500/30"
      };
      return map[color] || "";
    }
    function getTextHoverClass(color) {
      const map = {
        cyan: "group-hover:text-gremius-cyan",
        green: "group-hover:text-gremius-green",
        amber: "group-hover:text-gremius-amber",
        purple: "group-hover:text-gremius-purple",
        pink: "group-hover:text-gremius-pink",
        subtle: "group-hover:text-gremius-subtle"
      };
      return map[color] || "";
    }
    function getBgClass(color) {
      const map = {
        cyan: "bg-gremius-cyan/10",
        green: "bg-gremius-green/10",
        amber: "bg-gremius-amber/10",
        purple: "bg-gremius-purple/10",
        pink: "bg-gremius-pink/10",
        subtle: "bg-gremius-subtle/10"
      };
      return map[color] || "";
    }
    function getTextClass(color) {
      const map = {
        cyan: "text-gremius-cyan",
        green: "text-gremius-green",
        amber: "text-gremius-amber",
        purple: "text-gremius-purple",
        pink: "text-gremius-pink",
        subtle: "text-gremius-subtle"
      };
      return map[color] || "";
    }
    $$renderer2.push(`<div class="space-y-6 animate-fade-in"><div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"><div><h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-cyan/20 to-gremius-purple/20 border border-gremius-cyan/20 flex items-center justify-center">`);
    Layout_dashboard($$renderer2, { class: "w-5 h-5 text-gremius-cyan" });
    $$renderer2.push(`<!----></div> Dashboard</h1> <p class="text-sm text-gremius-subtle mt-1">Overview of your Gremius CMS instance</p></div> <div class="flex items-center gap-2"><span class="text-xs text-gremius-subtle px-2 py-1 bg-gremius-surface rounded-full">${escape_html((/* @__PURE__ */ new Date()).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }))}</span></div></div> <section><div class="flex items-center justify-between mb-3"><h2 class="text-sm font-medium text-gremius-subtle uppercase tracking-wider">Overview</h2> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="grid grid-cols-2 lg:grid-cols-4 gap-4"><!--[-->`);
      const each_array = ensure_array_like([1, 2, 3, 4]);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        each_array[$$index];
        $$renderer2.push(`<div class="card p-4 animate-pulse svelte-g5zs70"><div class="flex items-start justify-between"><div class="space-y-2"><div class="h-3 w-16 bg-gremius-bg rounded"></div> <div class="h-8 w-12 bg-gremius-bg rounded"></div></div> <div class="w-10 h-10 rounded-lg bg-gremius-bg"></div></div></div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--></section> <div class="grid grid-cols-1 lg:grid-cols-3 gap-6"><div class="lg:col-span-2 space-y-6"><section class="card svelte-g5zs70"><div class="p-4 border-b border-gremius-border flex items-center justify-between"><h3 class="font-semibold text-gremius-text flex items-center gap-2">`);
    Activity($$renderer2, { class: "w-4 h-4 text-gremius-cyan" });
    $$renderer2.push(`<!----> Recent Activity</h3> `);
    if (recentActivity.length > 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<a href="/actions" class="text-xs text-gremius-cyan hover:underline flex items-center gap-1">View all `);
      Chevron_right($$renderer2, { class: "w-3 h-3" });
      $$renderer2.push(`<!----></a>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div> <div class="p-4">`);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="space-y-4"><!--[-->`);
      const each_array_2 = ensure_array_like([1, 2, 3]);
      for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
        each_array_2[$$index_2];
        $$renderer2.push(`<div class="flex items-center gap-3 animate-pulse"><div class="w-8 h-8 rounded-full bg-gremius-bg"></div> <div class="flex-1 space-y-2"><div class="h-4 bg-gremius-bg rounded w-3/4"></div> <div class="h-3 bg-gremius-bg rounded w-1/4"></div></div></div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--></div></section> `);
    WidgetSlot($$renderer2, {
      name: "dashboard:content",
      wrapper: "card",
      class: "space-y-4"
    });
    $$renderer2.push(`<!----></div> <div class="space-y-6"><section class="card p-4 svelte-g5zs70"><h3 class="font-semibold text-gremius-text mb-4 flex items-center gap-2">`);
    Zap($$renderer2, { class: "w-4 h-4 text-gremius-cyan" });
    $$renderer2.push(`<!----> Quick Actions</h3> <div class="space-y-2"><!--[-->`);
    const each_array_4 = ensure_array_like(quickActions);
    for (let $$index_4 = 0, $$length = each_array_4.length; $$index_4 < $$length; $$index_4++) {
      let action = each_array_4[$$index_4];
      $$renderer2.push(`<a${attr("href", action.href)}${attr_class(`group flex items-center gap-3 p-3 rounded-lg hover:bg-gremius-bg transition-all border border-transparent ${stringify(getBorderHoverClass(action.color))}`, "svelte-g5zs70")}><div${attr_class(`w-10 h-10 rounded-lg ${stringify(getBgClass(action.color))} flex items-center justify-center group-hover:scale-110 transition-transform`, "svelte-g5zs70")}>`);
      if (action.icon) {
        $$renderer2.push("<!--[-->");
        action.icon($$renderer2, { class: `w-5 h-5 ${stringify(getTextClass(action.color))}` });
        $$renderer2.push("<!--]-->");
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push("<!--]-->");
      }
      $$renderer2.push(`</div> <div class="flex-1"><p${attr_class(`text-sm font-medium text-gremius-text ${stringify(getTextHoverClass(action.color))}`, "svelte-g5zs70")}>${escape_html(action.label)}</p> <p class="text-xs text-gremius-subtle">${escape_html(action.description)}</p></div> `);
      Arrow_right($$renderer2, {
        class: "w-4 h-4 text-gremius-subtle opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1"
      });
      $$renderer2.push(`<!----></a>`);
    }
    $$renderer2.push(`<!--]--></div></section> <section class="card p-4 svelte-g5zs70"><h3 class="font-semibold text-gremius-text mb-4 flex items-center gap-2">`);
    Layers($$renderer2, { class: "w-4 h-4 text-gremius-cyan" });
    $$renderer2.push(`<!----> Core Grimoires</h3> <div class="space-y-1"><!--[-->`);
    const each_array_5 = ensure_array_like(coreGrimoires);
    for (let $$index_5 = 0, $$length = each_array_5.length; $$index_5 < $$length; $$index_5++) {
      let grimoire = each_array_5[$$index_5];
      $$renderer2.push(`<a${attr("href", grimoire.href)} class="group flex items-center gap-3 p-2 rounded-lg hover:bg-gremius-bg transition-colors"><div${attr_class(`w-8 h-8 rounded-lg ${stringify(getBgClass(grimoire.color))} flex items-center justify-center`, "svelte-g5zs70")}>`);
      if (grimoire.icon) {
        $$renderer2.push("<!--[-->");
        grimoire.icon($$renderer2, {
          class: `w-4 h-4 ${stringify(getTextClass(grimoire.color))}`
        });
        $$renderer2.push("<!--]-->");
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push("<!--]-->");
      }
      $$renderer2.push(`</div> <div class="flex-1"><p${attr_class(`text-sm font-medium text-gremius-text ${stringify(getTextHoverClass(grimoire.color))}`, "svelte-g5zs70")}>${escape_html(grimoire.label)}</p> <p class="text-xs text-gremius-subtle">${escape_html(grimoire.description)}</p></div> `);
      Chevron_right($$renderer2, {
        class: "w-4 h-4 text-gremius-subtle opacity-0 group-hover:opacity-100 transition-opacity"
      });
      $$renderer2.push(`<!----></a>`);
    }
    $$renderer2.push(`<!--]--></div></section> <section class="card p-4 svelte-g5zs70"><h3 class="font-semibold text-gremius-text mb-3 flex items-center gap-2">`);
    Sparkles($$renderer2, { class: "w-4 h-4 text-gremius-cyan" });
    $$renderer2.push(`<!----> System Status</h3> <div class="space-y-2"><div class="flex items-center justify-between text-sm"><span class="text-gremius-subtle">API Status</span> <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> <span class="text-green-400 text-xs">Online</span></span></div> <div class="flex items-center justify-between text-sm"><span class="text-gremius-subtle">Database</span> <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> <span class="text-green-400 text-xs">Connected</span></span></div> <div class="flex items-center justify-between text-sm"><span class="text-gremius-subtle">Active Grimoires</span> <span class="text-gremius-text font-medium">`);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<span class="animate-pulse">—</span>`);
    }
    $$renderer2.push(`<!--]--></span></div></div></section> `);
    WidgetSlot($$renderer2, {
      name: "dashboard:sidebar",
      wrapper: "card",
      class: "space-y-4"
    });
    $$renderer2.push(`<!----></div></div> `);
    WidgetSlot($$renderer2, { name: "dashboard:bottom", wrapper: "none" });
    $$renderer2.push(`<!----></div>`);
  });
}
export {
  Dashboard as D
};
