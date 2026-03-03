import{z as l,F as d,n as p,f}from"./Bm0TaU-Y.js";import{c as m,a as y}from"./C-6n7b0Y.js";import"./QRZHqxvK.js";import{I as u,s as g}from"./C0VBvGkr.js";import{l as h,s as $}from"./IuiPc1mh.js";const P="http://localhost:3001",v=[{id:"default",name:"Gremius Dark",description:"Default dark theme with cyan accents",preview:"linear-gradient(135deg, #22d3ee, #e879f9)",primary:"#22d3ee",secondary:"#e879f9",accent:"#a78bfa"},{id:"ocean",name:"Ocean Blue",description:"Deep ocean inspired theme",preview:"linear-gradient(135deg, #0ea5e9, #3b82f6)",primary:"#0ea5e9",secondary:"#3b82f6",accent:"#60a5fa"},{id:"forest",name:"Forest Green",description:"Nature inspired green theme",preview:"linear-gradient(135deg, #22c55e, #10b981)",primary:"#22c55e",secondary:"#10b981",accent:"#34d399"},{id:"sunset",name:"Sunset Orange",description:"Warm sunset colors",preview:"linear-gradient(135deg, #f97316, #ef4444)",primary:"#f97316",secondary:"#ef4444",accent:"#fb923c"}],c=d("default");let w=p(!1);async function z(){try{const e=await fetch(`${P}/api/theme/active`,{credentials:"include"});if(e.ok){const r=await e.json();s(r),c.set(r.id||"default")}}catch{console.log("Using default theme")}finally{l(w,!0)}}function D(e){const r=v.find(t=>t.id===e);r&&(s(r),c.set(e))}function s(e){const r=document.documentElement;e.primary&&(r.style.setProperty("--gremius-color-primary",e.primary),r.style.setProperty("--gremius-color-cyan",e.primary)),e.secondary&&(r.style.setProperty("--gremius-color-secondary",e.secondary),r.style.setProperty("--gremius-color-pink",e.secondary)),e.accent&&(r.style.setProperty("--gremius-color-accent",e.accent),r.style.setProperty("--gremius-color-purple",e.accent))}function N(e,r){const t=h(r,["children","$$slots","$$events","$$legacy"]);/**
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
 */const n=[["path",{d:"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"}],["circle",{cx:"13.5",cy:"6.5",r:".5",fill:"currentColor"}],["circle",{cx:"17.5",cy:"10.5",r:".5",fill:"currentColor"}],["circle",{cx:"6.5",cy:"12.5",r:".5",fill:"currentColor"}],["circle",{cx:"8.5",cy:"7.5",r:".5",fill:"currentColor"}]];u(e,$({name:"palette"},()=>t,{get iconNode(){return n},children:(o,b)=>{var a=m(),i=f(a);g(i,r,"default",{},null),y(o,a)},$$slots:{default:!0}}))}export{N as P,c,z as l,D as s,v as t};
