import "clsx";
import { j as sanitize_props, k as spread_props, h as slot, l as derived, e as escape_html, a as ensure_array_like, b as attr, c as attr_class, o as stringify } from "../../../chunks/index.js";
/* empty css                                                      */
import { I as Icon } from "../../../chunks/Icon.js";
import { D as Database } from "../../../chunks/database.js";
import { T as Trash_2 } from "../../../chunks/trash-2.js";
import { L as Loader_circle } from "../../../chunks/loader-circle.js";
function Archive($$renderer, $$props) {
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
      { "width": "20", "height": "5", "x": "2", "y": "3", "rx": "1" }
    ],
    ["path", { "d": "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" }],
    ["path", { "d": "M10 12h4" }]
  ];
  Icon($$renderer, spread_props([
    { name: "archive" },
    $$sanitized_props,
    {
      /**
       * @component @name Archive
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cmVjdCB3aWR0aD0iMjAiIGhlaWdodD0iNSIgeD0iMiIgeT0iMyIgcng9IjEiIC8+CiAgPHBhdGggZD0iTTQgOHYxMWEyIDIgMCAwIDAgMiAyaDEyYTIgMiAwIDAgMCAyLTJWOCIgLz4KICA8cGF0aCBkPSJNMTAgMTJoNCIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/archive
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
function Circle_check_big($$renderer, $$props) {
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
    ["path", { "d": "M21.801 10A10 10 0 1 1 17 3.335" }],
    ["path", { "d": "m9 11 3 3L22 4" }]
  ];
  Icon($$renderer, spread_props([
    { name: "circle-check-big" },
    $$sanitized_props,
    {
      /**
       * @component @name CircleCheckBig
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMjEuODAxIDEwQTEwIDEwIDAgMSAxIDE3IDMuMzM1IiAvPgogIDxwYXRoIGQ9Im05IDExIDMgM0wyMiA0IiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/circle-check-big
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
function Circle_x($$renderer, $$props) {
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
    ["circle", { "cx": "12", "cy": "12", "r": "10" }],
    ["path", { "d": "m15 9-6 6" }],
    ["path", { "d": "m9 9 6 6" }]
  ];
  Icon($$renderer, spread_props([
    { name: "circle-x" },
    $$sanitized_props,
    {
      /**
       * @component @name CircleX
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgLz4KICA8cGF0aCBkPSJtMTUgOS02IDYiIC8+CiAgPHBhdGggZD0ibTkgOSA2IDYiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/circle-x
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
function Puzzle($$renderer, $$props) {
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
        "d": "M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"
      }
    ]
  ];
  Icon($$renderer, spread_props([
    { name: "puzzle" },
    $$sanitized_props,
    {
      /**
       * @component @name Puzzle
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTUuMzkgNC4zOWExIDEgMCAwIDAgMS42OC0uNDc0IDIuNSAyLjUgMCAxIDEgMy4wMTQgMy4wMTUgMSAxIDAgMCAwLS40NzQgMS42OGwxLjY4MyAxLjY4MmEyLjQxNCAyLjQxNCAwIDAgMSAwIDMuNDE0TDE5LjYxIDE1LjM5YTEgMSAwIDAgMS0xLjY4LS40NzQgMi41IDIuNSAwIDEgMC0zLjAxNCAzLjAxNSAxIDEgMCAwIDEgLjQ3NCAxLjY4bC0xLjY4MyAxLjY4MmEyLjQxNCAyLjQxNCAwIDAgMS0zLjQxNCAwTDguNjEgMTkuNjFhMSAxIDAgMCAwLTEuNjguNDc0IDIuNSAyLjUgMCAxIDEtMy4wMTQtMy4wMTUgMSAxIDAgMCAwIC40NzQtMS42OGwtMS42ODMtMS42ODJhMi40MTQgMi40MTQgMCAwIDEgMC0zLjQxNEw0LjM5IDguNjFhMSAxIDAgMCAxIDEuNjguNDc0IDIuNSAyLjUgMCAxIDAgMy4wMTQtMy4wMTUgMSAxIDAgMCAxLS40NzQtMS42OGwxLjY4My0xLjY4MmEyLjQxNCAyLjQxNCAwIDAgMSAzLjQxNCAweiIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/puzzle
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
function Rotate_ccw($$renderer, $$props) {
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
      { "d": "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }
    ],
    ["path", { "d": "M3 3v5h5" }]
  ];
  Icon($$renderer, spread_props([
    { name: "rotate-ccw" },
    $$sanitized_props,
    {
      /**
       * @component @name RotateCcw
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMyAxMmE5IDkgMCAxIDAgOS05IDkuNzUgOS43NSAwIDAgMC02Ljc0IDIuNzRMMyA4IiAvPgogIDxwYXRoIGQ9Ik0zIDN2NWg1IiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/rotate-ccw
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
const API_URL = "http://localhost:3001";
class ModuleStore {
  modules = [];
  uninstalled = [];
  loading = true;
  error = null;
  activeTheme = null;
  #enabledKeys = derived(() => new Set(this.modules.filter((m) => m.enabled).map((m) => m.key)));
  get enabledKeys() {
    return this.#enabledKeys();
  }
  set enabledKeys($$value) {
    return this.#enabledKeys($$value);
  }
  async fetchModules() {
    this.loading = true;
    this.error = null;
    try {
      const res = await fetch(`${API_URL}/api/modules`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        this.activeTheme = data.activeTheme || null;
        this.modules = data.docs || [];
        this.uninstalled = data.categories?.uninstalled?.modules || [];
      } else {
        this.error = "Failed to fetch modules";
      }
    } catch (e) {
      this.error = "Network error";
    } finally {
      this.loading = false;
    }
  }
  /**
   * Toggle a module's enabled state and update the API.
   * Returns true if successful.
   */
  async toggleModule(key) {
    const mod = this.modules.find((m) => m.key === key);
    if (!mod || mod.canToggle === false) return false;
    const newEnabled = !mod.enabled;
    try {
      const res = await fetch(`${API_URL}/api/modules/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: newEnabled })
      });
      if (res.ok) {
        this.modules = this.modules.map((m) => m.key === key ? { ...m, enabled: newEnabled } : m);
        return true;
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || err.message || "Failed to toggle grimoire");
        return false;
      }
    } catch {
      alert("Network error toggling grimoire");
      return false;
    }
  }
  /**
   * Uninstall a grimoire but preserve its data.
   * The grimoire will move to "Uninstalled (Data Preserved)" section.
   */
  async uninstallModule(key) {
    try {
      const res = await fetch(`${API_URL}/api/modules/${key}/uninstall`, { method: "POST", credentials: "include" });
      if (res.ok) {
        const result = await res.json();
        await this.fetchModules();
        return {
          success: true,
          dataPreserved: result.dataPreserved,
          message: result.message
        };
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || err.message || "Failed to uninstall grimoire");
        return { success: false };
      }
    } catch {
      alert("Network error uninstalling grimoire");
      return { success: false };
    }
  }
  /**
   * Recover/Reinstall an uninstalled grimoire with its data.
   */
  async recoverModule(key) {
    try {
      const res = await fetch(`${API_URL}/api/modules/${key}/recover`, { method: "POST", credentials: "include" });
      if (res.ok) {
        const result = await res.json();
        await this.fetchModules();
        return {
          success: true,
          dataRestored: result.dataRestored,
          message: result.message
        };
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || err.message || "Failed to recover grimoire");
        return { success: false };
      }
    } catch {
      alert("Network error recovering grimoire");
      return { success: false };
    }
  }
  /**
   * Permanently delete a grimoire and optionally its data.
   * @param purge - If true, also drops the tables and data
   */
  async deleteModule(key, purge = false) {
    try {
      const res = await fetch(`${API_URL}/api/modules/${key}?purge=${purge}&force=true`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        const result = await res.json();
        await this.fetchModules();
        return {
          success: true,
          dataDeleted: result.dataDeleted,
          message: result.message
        };
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || err.message || "Failed to delete grimoire");
        return { success: false };
      }
    } catch {
      alert("Network error deleting grimoire");
      return { success: false };
    }
  }
  /**
   * Check if a module is enabled by key.
   */
  isEnabled(key) {
    return this.enabledKeys.has(key);
  }
}
const moduleStore = new ModuleStore();
function UninstalledGrimoireCard($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      grimoire,
      recovering = false,
      deleting = false
    } = $$props;
    function formatNumber(num) {
      if (num >= 1e3) return (num / 1e3).toFixed(1) + "k";
      return num.toString();
    }
    $$renderer2.push(`<div class="card p-5 relative overflow-hidden border-dashed border-gremius-border/50 bg-gremius-surface/30 svelte-3w8cah"><div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-gremius-subtle/40 via-gremius-subtle/20 to-transparent"></div> <div class="flex items-start gap-3"><div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 bg-gremius-surface/50 border border-gremius-border/50 grayscale opacity-70">📦</div> <div class="flex-1 min-w-0"><div class="flex items-center gap-2 flex-wrap"><p class="font-semibold text-gremius-text text-sm opacity-80">${escape_html(grimoire.name)}</p> <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gremius-subtle/20 text-gremius-subtle border border-gremius-border/50 flex items-center gap-1">`);
    Archive($$renderer2, { class: "w-2.5 h-2.5" });
    $$renderer2.push(`<!----> UNINSTALLED</span></div> `);
    if (grimoire.hasPreservedData) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="mt-2 flex items-center gap-1.5 text-xs text-gremius-cyan/80">`);
      Database($$renderer2, { class: "w-3.5 h-3.5" });
      $$renderer2.push(`<!----> <span>Data preserved: ${escape_html(formatNumber(grimoire.dataSummary.totalRows))} rows</span></div> `);
      if (grimoire.dataSummary.tables.length > 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="mt-1.5 flex flex-wrap gap-1"><!--[-->`);
        const each_array = ensure_array_like(grimoire.dataSummary.tables.slice(0, 3));
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let table = each_array[$$index];
          $$renderer2.push(`<span class="text-[10px] px-1.5 py-0.5 rounded bg-gremius-bg border border-gremius-border/50 text-gremius-subtle font-mono">${escape_html(table.name)}: ${escape_html(formatNumber(table.rows))}</span>`);
        }
        $$renderer2.push(`<!--]--> `);
        if (grimoire.dataSummary.tables.length > 3) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="text-[10px] px-1.5 py-0.5 rounded bg-gremius-bg border border-gremius-border/50 text-gremius-subtle">+${escape_html(grimoire.dataSummary.tables.length - 3)} more</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]-->`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<p class="text-xs text-gremius-subtle mt-1">No data preserved</p>`);
    }
    $$renderer2.push(`<!--]--></div></div> <div class="mt-4 pt-3 border-t border-gremius-border/30 flex gap-2">`);
    if (grimoire.canRecover) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<button${attr("disabled", recovering, true)} class="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-colors bg-gremius-cyan/10 text-gremius-cyan hover:bg-gremius-cyan/20 border border-gremius-cyan/20 disabled:opacity-50">`);
      if (recovering) {
        $$renderer2.push("<!--[-->");
        Rotate_ccw($$renderer2, { class: "w-3.5 h-3.5 animate-spin" });
        $$renderer2.push(`<!----> Recovering...`);
      } else {
        $$renderer2.push("<!--[!-->");
        Rotate_ccw($$renderer2, { class: "w-3.5 h-3.5" });
        $$renderer2.push(`<!----> Recover`);
      }
      $$renderer2.push(`<!--]--></button>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (grimoire.canDelete) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<button${attr("disabled", deleting, true)} class="flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-colors bg-gremius-pink/10 text-gremius-pink hover:bg-gremius-pink/20 border border-gremius-pink/20 disabled:opacity-50" title="Permanently delete data">`);
      if (deleting) {
        $$renderer2.push("<!--[-->");
        Trash_2($$renderer2, { class: "w-3.5 h-3.5 animate-pulse" });
      } else {
        $$renderer2.push("<!--[!-->");
        Trash_2($$renderer2, { class: "w-3.5 h-3.5" });
      }
      $$renderer2.push(`<!--]--></button>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
function Grimoires($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let toggling = null;
    let uninstalling = null;
    let recovering = null;
    let deleting = null;
    const INFRASTRUCTURE_MODULES = ["media-library"];
    const CATEGORY_LABELS = { "core": "Core Grimoires", "optional": "Optional Features" };
    let visibleModules = derived(() => moduleStore.modules.filter((m) => !INFRASTRUCTURE_MODULES.includes(m.key)));
    let realmNames = derived(() => {
      const names = {};
      for (const mod of visibleModules()) {
        if (mod.realmId && !names[mod.realmId]) {
          const name = mod.realmId.replace(/^realm-/, "").split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
          names[mod.realmId] = name;
        }
      }
      return names;
    });
    let groupedModules = derived(() => {
      const groups = {};
      for (const mod of visibleModules()) {
        let cat;
        if (mod.category === "realm" && mod.realmId) {
          cat = `realm:${mod.realmId}`;
        } else {
          cat = mod.category || "optional";
        }
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(mod);
      }
      return groups;
    });
    function getCategoryLabel(category) {
      if (category.startsWith("realm:")) {
        const realmId = category.replace("realm:", "");
        const names = realmNames();
        return names[realmId] || realmId.replace(/^realm-/, "").replace(/-/g, " ");
      }
      return CATEGORY_LABELS[category] || category;
    }
    $$renderer2.push(`<div class="space-y-6 animate-fade-in svelte-udwjdl"><div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-amber/20 to-gremius-pink/20 border border-gremius-amber/20 flex items-center justify-center">`);
    Puzzle($$renderer2, { class: "w-5 h-5 text-gremius-amber" });
    $$renderer2.push(`<!----></div> Grimoires</h1> <p class="text-sm text-gremius-subtle mt-1">Manage system grimoires. Uninstall to preserve data, or delete permanently.</p></div></div> `);
    if (moduleStore.loading) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="card p-12 text-center svelte-udwjdl"><div class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin mx-auto mb-4"></div> <p class="text-gremius-subtle">Summoning grimoires...</p></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      const groups = groupedModules();
      $$renderer2.push(`<!--[-->`);
      const each_array = ensure_array_like(Object.entries(groups));
      for (let $$index_1 = 0, $$length = each_array.length; $$index_1 < $$length; $$index_1++) {
        let [category, mods] = each_array[$$index_1];
        $$renderer2.push(`<div><div class="flex items-center gap-2 mb-3"><h2 class="text-sm font-semibold uppercase tracking-wider text-gremius-subtle">${escape_html(getCategoryLabel(category))}</h2> <span class="text-[10px] px-2 py-0.5 rounded-full bg-gremius-surface text-gremius-text-dim">${escape_html(mods.length)}</span></div> <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6"><!--[-->`);
        const each_array_1 = ensure_array_like(mods);
        for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
          let mod = each_array_1[$$index];
          $$renderer2.push(`<div${attr_class("card p-5 relative svelte-udwjdl", void 0, { "border-gremius-cyan": mod.enabled, "border": mod.enabled })}><div class="flex items-start justify-between mb-4"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-lg bg-gremius-surface flex items-center justify-center text-xl">${escape_html(mod.icon || "📦")}</div> <div><h3 class="font-semibold text-gremius-text">${escape_html(mod.name)}</h3> <p class="text-[10px] font-medium uppercase tracking-wider text-gremius-subtle">${escape_html(getCategoryLabel(mod.category))}</p> `);
          if (mod.enabledByRealm) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span class="text-[9px] px-1.5 py-0.5 rounded-full bg-gremius-cyan/10 text-gremius-cyan border border-gremius-cyan/20 mt-1 inline-block">Active by Realm</span>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--></div></div> `);
          if (mod.enabled) {
            $$renderer2.push("<!--[-->");
            Circle_check_big($$renderer2, { class: "w-5 h-5 text-gremius-cyan" });
          } else {
            $$renderer2.push("<!--[!-->");
            Circle_x($$renderer2, { class: "w-5 h-5 text-gremius-subtle" });
          }
          $$renderer2.push(`<!--]--></div> <p class="text-sm text-gremius-text-dim mb-4">${escape_html(mod.description)}</p> <div class="pt-3 border-t border-gremius-border space-y-2">`);
          if (mod.canToggle !== false) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<button${attr_class(`w-full text-sm font-medium px-3 py-2 rounded-lg transition-colors ${stringify(mod.enabled ? "bg-gremius-pink/10 text-gremius-pink hover:bg-gremius-pink/20 border border-gremius-pink/20" : "bg-gremius-cyan/10 text-gremius-cyan hover:bg-gremius-cyan/20 border border-gremius-cyan/20")}`)}${attr("disabled", toggling === mod.key, true)}>`);
            if (toggling === mod.key) {
              $$renderer2.push("<!--[-->");
              Loader_circle($$renderer2, { class: "w-4 h-4 animate-spin inline mr-1" });
              $$renderer2.push(`<!----> Toggling...`);
            } else {
              $$renderer2.push("<!--[!-->");
              $$renderer2.push(`${escape_html(mod.enabled ? "Disable" : "Enable")}`);
            }
            $$renderer2.push(`<!--]--></button>`);
          } else {
            $$renderer2.push("<!--[!-->");
            $$renderer2.push(`<p class="text-xs text-gremius-subtle text-center py-2">${escape_html(mod.isRealmActive ? "Controlled by active realm" : "Cannot be toggled")}</p>`);
          }
          $$renderer2.push(`<!--]--> <button class="w-full text-xs font-medium px-3 py-2 rounded-lg transition-colors bg-gremius-subtle/10 text-gremius-subtle hover:bg-gremius-subtle/20 border border-gremius-border/50 flex items-center justify-center gap-1.5"${attr("disabled", uninstalling === mod.key, true)}>`);
          if (uninstalling === mod.key) {
            $$renderer2.push("<!--[-->");
            Loader_circle($$renderer2, { class: "w-3.5 h-3.5 animate-spin" });
            $$renderer2.push(`<!----> Uninstalling...`);
          } else {
            $$renderer2.push("<!--[!-->");
            Archive($$renderer2, { class: "w-3.5 h-3.5" });
            $$renderer2.push(`<!----> Uninstall (Preserve Data)`);
          }
          $$renderer2.push(`<!--]--></button></div></div>`);
        }
        $$renderer2.push(`<!--]--></div></div>`);
      }
      $$renderer2.push(`<!--]--> `);
      if (moduleStore.uninstalled.length > 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="pt-6 border-t border-gremius-border"><div class="flex items-center gap-2 mb-3">`);
        Archive($$renderer2, { class: "w-4 h-4 text-gremius-subtle" });
        $$renderer2.push(`<!----> <h2 class="text-sm font-semibold uppercase tracking-wider text-gremius-subtle">Uninstalled (Data Preserved)</h2> <span class="text-[10px] px-2 py-0.5 rounded-full bg-gremius-surface text-gremius-text-dim">${escape_html(moduleStore.uninstalled.length)}</span></div> <p class="text-xs text-gremius-subtle mb-4">These grimoires have been uninstalled but their data is preserved. You can recover them or permanently delete their data.</p> <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"><!--[-->`);
        const each_array_2 = ensure_array_like(moduleStore.uninstalled);
        for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
          let grimoire = each_array_2[$$index_2];
          UninstalledGrimoireCard($$renderer2, {
            grimoire,
            recovering: recovering === grimoire.key,
            deleting: deleting === grimoire.key
          });
        }
        $$renderer2.push(`<!--]--></div></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></div> `);
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
function _page($$renderer) {
  Grimoires($$renderer);
}
export {
  _page as default
};
