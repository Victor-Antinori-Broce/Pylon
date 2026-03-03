import{c as G,a as v,d as Ve,s as E,b as Ie,f as _,g as Re}from"../chunks/C-6n7b0Y.js";import{o as ze}from"../chunks/CwQiR1ah.js";import{z as p,n as I,v as e,f as L,m as ue,x as r,A as a,y as o,C as A,D as $,B as ce,w as ve,_ as Ze}from"../chunks/Bm0TaU-Y.js";import{i as C}from"../chunks/RHSDymrL.js";import{I as X,s as U,e as je,a as ae,b as P,i as Se,r as Ae}from"../chunks/C0VBvGkr.js";import{P as Je,l as Ke}from"../chunks/X4sUii19.js";import{s as Qe}from"../chunks/CKNZf63S.js";import{c as Ce}from"../chunks/BL97dVxi.js";import{l as Y,s as ee,b as Le,a as Xe}from"../chunks/IuiPc1mh.js";import{D as Ye,p as et}from"../chunks/DyIE8UIn.js";import{Z as Me}from"../chunks/Cr_PjA-T.js";import{L as tt}from"../chunks/YUAmgTZv.js";import"../chunks/QRZHqxvK.js";import{F as at}from"../chunks/CvXqV1BZ.js";import{I as rt}from"../chunks/CZP-Ru6N.js";import{T as st,a as it}from"../chunks/Bhr7e5nl.js";import{C as nt}from"../chunks/CRXmZs2P.js";import{W as ot}from"../chunks/BDG74Ad3.js";import{P as lt}from"../chunks/DPv59IMb.js";import{S as dt}from"../chunks/CROCV8Ue.js";import{b as Ne}from"../chunks/CBIgpbnC.js";import{g as ct}from"../chunks/CQr59hUh.js";const ut=!1,vt=!1,ua=Object.freeze(Object.defineProperty({__proto__:null,prerender:vt,ssr:ut},Symbol.toStringTag,{value:"Module"})),pe="http://localhost:3001";let z=I(null),Q=I(!1),re=I(null),Te=I(!1);function pt(){return e(z)}function mt(){return e(Q)}function ft(){return e(re)}function gt(){return e(Te)}function ht(){return!!e(z)}function bt(){var l;return((l=e(z))==null?void 0:l.role)==="admin"}async function xt(){p(Q,!0),p(re,null);try{const l=await fetch(`${pe}/api/auth/get-session`,{credentials:"include"});if(!l.ok){p(z,null);return}const s=await l.json();p(z,(s==null?void 0:s.user)||null,!0)}catch{p(z,null)}finally{p(Q,!1),p(Te,!0)}}async function _t(l,s){p(Q,!0),p(re,null);try{const n=await fetch(`${pe}/api/auth/sign-in/email`,{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({email:l,password:s})});if(!n.ok){const c=await n.json().catch(()=>({}));throw new Error(c.message||c.error||"Invalid credentials")}const i=await n.json();return p(z,(i==null?void 0:i.user)||null,!0),i}catch(n){throw p(re,n.message,!0),n}finally{p(Q,!1)}}async function Oe(){try{await fetch(`${pe}/api/auth/sign-out`,{method:"POST",credentials:"include"})}catch{}p(z,null)}function yt(l,s){const n=Y(s,["children","$$slots","$$events","$$legacy"]);/**
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
 */const i=[["path",{d:"M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"}],["rect",{width:"20",height:"14",x:"2",y:"6",rx:"2"}]];X(l,ee({name:"briefcase"},()=>n,{get iconNode(){return i},children:(c,y)=>{var t=G(),m=L(t);U(m,s,"default",{},null),v(c,t)},$$slots:{default:!0}}))}function wt(l,s){const n=Y(s,["children","$$slots","$$events","$$legacy"]);/**
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
 */const i=[["line",{x1:"6",x2:"10",y1:"11",y2:"11"}],["line",{x1:"8",x2:"8",y1:"9",y2:"13"}],["line",{x1:"15",x2:"15.01",y1:"12",y2:"12"}],["line",{x1:"18",x2:"18.01",y1:"10",y2:"10"}],["path",{d:"M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"}]];X(l,ee({name:"gamepad-2"},()=>n,{get iconNode(){return i},children:(c,y)=>{var t=G(),m=L(t);U(m,s,"default",{},null),v(c,t)},$$slots:{default:!0}}))}function $t(l,s){const n=Y(s,["children","$$slots","$$events","$$legacy"]);/**
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
 */const i=[["path",{d:"m16 17 5-5-5-5"}],["path",{d:"M21 12H9"}],["path",{d:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"}]];X(l,ee({name:"log-out"},()=>n,{get iconNode(){return i},children:(c,y)=>{var t=G(),m=L(t);U(m,s,"default",{},null),v(c,t)},$$slots:{default:!0}}))}function kt(l,s){const n=Y(s,["children","$$slots","$$events","$$legacy"]);/**
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
 */const i=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["path",{d:"M9 3v18"}],["path",{d:"m16 15-3-3 3-3"}]];X(l,ee({name:"panel-left-close"},()=>n,{get iconNode(){return i},children:(c,y)=>{var t=G(),m=L(t);U(m,s,"default",{},null),v(c,t)},$$slots:{default:!0}}))}function Pt(l,s){const n=Y(s,["children","$$slots","$$events","$$legacy"]);/**
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
 */const i=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["path",{d:"M9 3v18"}],["path",{d:"m14 9 3 3-3 3"}]];X(l,ee({name:"panel-left-open"},()=>n,{get iconNode(){return i},children:(c,y)=>{var t=G(),m=L(t);U(m,s,"default",{},null),v(c,t)},$$slots:{default:!0}}))}var It=_('<span class="font-semibold text-sm tracking-tight whitespace-nowrap">Gremius<span class="text-gremius-cyan">CMS</span></span>'),jt=_('<span class="whitespace-nowrap"> </span>'),St=_("<a><!> <!></a>"),At=_('<span class="whitespace-nowrap"> </span>'),Ct=_("<a><!> <!></a>"),Lt=_('<div class="flex-1 min-w-0"><p class="text-xs font-medium text-gremius-text truncate"> </p> <p class="text-[10px] text-gremius-subtle truncate"> </p></div> <button class="p-1.5 rounded-lg text-gremius-text-dim hover:bg-gremius-pink/10 hover:text-gremius-pink transition-colors" title="Sign out"><!></button>',1),Mt=_('<div><div><div class="w-8 h-8 rounded-full bg-gradient-to-br from-gremius-cyan/30 to-gremius-pink/30 flex items-center justify-center text-xs font-bold text-white shrink-0"> </div> <!></div></div>'),Nt=_('<!> <span class="whitespace-nowrap">Collapse</span>',1),zt=_('<div class="flex h-screen overflow-hidden"><aside><div class="flex items-center h-14 px-4 border-b border-gremius-border shrink-0"><div class="flex items-center gap-3 overflow-hidden"><div class="w-8 h-8 rounded-lg bg-gremius-cyan/10 flex items-center justify-center shrink-0"><!></div> <!></div></div> <nav class="flex-1 overflow-y-auto py-3 px-2"><div class="space-y-0.5"></div> <div><p class="text-[9px] font-semibold uppercase tracking-[0.15em] text-gremius-subtle">System</p></div> <div></div> <div class="space-y-0.5"></div></nav> <div class="border-t border-gremius-border shrink-0"><!> <button><!></button></div></aside> <main class="flex-1 overflow-y-auto bg-gremius-bg"><header class="sticky top-0 z-30 flex items-center justify-between h-14 px-6 border-b border-gremius-border bg-gremius-bg/80 backdrop-blur-xl"><div class="flex items-center gap-3"><h1 class="text-sm font-semibold text-gremius-text">Admin</h1></div> <div class="flex items-center gap-3"><div><span></span> </div> <div class="w-8 h-8 rounded-full bg-gremius-cyan/10 border border-gremius-cyan/20 flex items-center justify-center text-xs font-bold text-gremius-cyan">A</div></div></header> <div class="p-6"><!></div></main></div>');function Tt(l,s){ue(s,!0);const n=()=>Le(et,"$page",c),i=()=>Le(e(V),"$user",c),[c,y]=Xe();let t=I(!1),m=I(!1);const V=$(pt);let M=$(()=>n().url.pathname);const W=[{path:"/",label:"Dashboard",icon:tt},{path:"/games",label:"Games",icon:wt},{path:"/posts",label:"Blog Posts",icon:at},{path:"/media",label:"Media Library",icon:rt},{path:"/datasets",label:"Data Sets",icon:Ye},{path:"/streamers",label:"Streamers",icon:st},{path:"/data/games",label:"Data Explorer",icon:it},{path:"/formulas",label:"Fórmulas KPI",icon:nt},{path:"/gremius-crm",label:"Gremius CRM",icon:yt}],h=[{path:"/workers",label:"Workers",icon:Me},{path:"/webhooks",label:"Webhooks",icon:ot},{path:"/modules",label:"Modules",icon:lt},{path:"/themes",label:"Themes",icon:Je},{path:"/settings",label:"Settings",icon:dt}];function j(){Oe(),window.location.href="/login"}function T(u){return u==="/"?e(M)==="/":e(M).startsWith(u)}ze(async()=>{try{const d=await fetch("http://localhost:3001/api/health");p(m,d.ok,!0)}catch{p(m,!1)}});var k=zt(),S=r(k);let q;var F=r(S),H=r(F),R=r(H),se=r(R);Me(se,{class:"w-4 h-4 text-gremius-cyan"}),a(R);var ie=o(R,2);{var g=u=>{var d=It();v(u,d)};C(ie,u=>{e(t)||u(g)})}a(H),a(F);var w=o(F,2),Z=r(w);je(Z,21,()=>W,Se,(u,d)=>{const N=$(()=>T(e(d).path)),O=$(()=>e(d).icon);var b=St(),B=r(b);Ce(B,()=>e(O),(f,x)=>{x(f,{class:"w-[18px] h-[18px] shrink-0"})});var J=o(B,2);{var K=f=>{var x=jt(),D=r(x,!0);a(x),A(()=>E(D,e(d).label)),v(f,x)};C(J,f=>{e(t)||f(K)})}a(b),A(()=>{ae(b,"href",e(d).path),P(b,1,`flex items-center gap-3 rounded-lg text-sm transition-all duration-150 ${e(t)?"justify-center px-2 py-2.5":"px-3 py-2.5"} ${e(N)?"bg-gremius-cyan/10 text-gremius-cyan border border-gremius-cyan/20":"text-gremius-text-dim hover:bg-gremius-border/30 hover:text-gremius-text border border-transparent"}`),ae(b,"title",e(t)?e(d).label:void 0)}),v(u,b)}),a(Z);var me=o(Z,2);let fe;var ge=o(me,2);let he;var be=o(ge,2);je(be,21,()=>h,Se,(u,d)=>{const N=$(()=>T(e(d).path)),O=$(()=>e(d).icon);var b=Ct(),B=r(b);Ce(B,()=>e(O),(f,x)=>{x(f,{class:"w-[18px] h-[18px] shrink-0"})});var J=o(B,2);{var K=f=>{var x=At(),D=r(x,!0);a(x),A(()=>E(D,e(d).label)),v(f,x)};C(J,f=>{e(t)||f(K)})}a(b),A(()=>{ae(b,"href",e(d).path),P(b,1,`flex items-center gap-3 rounded-lg text-sm transition-all duration-150 ${e(t)?"justify-center px-2 py-2.5":"px-3 py-2.5"} ${e(N)?"bg-gremius-cyan/10 text-gremius-cyan border border-gremius-cyan/20":"text-gremius-text-dim hover:bg-gremius-border/30 hover:text-gremius-text border border-transparent"}`),ae(b,"title",e(t)?e(d).label:void 0)}),v(u,b)}),a(be),a(w);var xe=o(w,2),_e=r(xe);{var Be=u=>{var d=Mt();let N;var O=r(d),b=r(O),B=r(b,!0);a(b);var J=o(b,2);{var K=f=>{var x=Lt(),D=L(x),le=r(D),Fe=r(le,!0);a(le);var Pe=o(le,2),He=r(Pe,!0);a(Pe),a(D);var de=o(D,2),Ue=r(de);$t(Ue,{class:"w-3.5 h-3.5"}),a(de),A(()=>{E(Fe,i().name),E(He,i().email)}),Ie("click",de,j),v(f,x)};C(J,f=>{e(t)||f(K)})}a(O),a(d),A(f=>{N=P(d,1,"px-2 pt-3",null,N,{"pb-1":e(t),"pb-2":!e(t)}),P(O,1,`flex items-center rounded-lg ${e(t)?"justify-center px-2 py-2":"gap-3 px-3 py-2"}`),E(B,f)},[()=>{var f,x;return((x=(f=i().name)==null?void 0:f[0])==null?void 0:x.toUpperCase())||"?"}]),v(u,d)};C(_e,u=>{i()&&u(Be)})}var te=o(_e,2),De=r(te);{var Ee=u=>{var d=Nt(),N=L(d);kt(N,{class:"w-[18px] h-[18px] shrink-0"}),ce(2),v(u,d)},Ge=u=>{Pt(u,{class:"w-[18px] h-[18px] shrink-0"})};C(De,u=>{e(t)?u(Ge,!1):u(Ee)})}a(te),a(xe),a(S);var ye=o(S,2),ne=r(ye),we=o(r(ne),2),oe=r(we),$e=r(oe),We=o($e);a(oe),ce(2),a(we),a(ne);var ke=o(ne,2),qe=r(ke);Qe(qe,()=>s.children??Ze),a(ke),a(ye),a(k),A(()=>{q=P(S,1,"flex flex-col border-r border-gremius-border bg-gremius-card transition-all duration-300 ease-out shrink-0",null,q,{"w-16":e(t),"w-60":!e(t)}),fe=P(me,1,"mt-5 mb-2 px-3",null,fe,{hidden:e(t)}),he=P(ge,1,"my-3 mx-3 h-px bg-gremius-border",null,he,{hidden:!e(t)}),P(te,1,`flex items-center gap-3 w-full rounded-lg text-sm text-gremius-text-dim hover:bg-gremius-border/30 hover:text-gremius-text transition-all px-2 py-2 mx-2 mb-2 ${e(t)?"justify-center":"px-3"}`),P(oe,1,`flex items-center gap-2 text-xs ${e(m)?"text-gremius-green":"text-gremius-pink"}`),P($e,1,`w-2 h-2 rounded-full ${e(m)?"bg-gremius-green animate-pulse":"bg-gremius-subtle"}`),E(We,` ${e(m)?"API Connected":"API Offline"}`)}),Ie("click",te,()=>p(t,!e(t))),v(l,k),ve(),y()}Ve(["click"]);var Ot=_('<div class="error-banner svelte-twi6kd"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg> </div>'),Bt=_('<span class="spinner svelte-twi6kd"></span>'),Dt=_("<span>Sign In</span>"),Et=_('<div class="login-bg svelte-twi6kd"><div class="grid-overlay svelte-twi6kd"></div> <div class="login-card svelte-twi6kd"><div class="brand svelte-twi6kd"><div class="brand-icon svelte-twi6kd"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg></div> <h1 class="brand-name svelte-twi6kd">GremiusCMS</h1> <p class="brand-sub svelte-twi6kd">Admin Console</p></div> <!> <form class="login-form svelte-twi6kd"><div class="field svelte-twi6kd"><label class="field-label svelte-twi6kd" for="email">Email</label> <input type="email" id="email" placeholder="admin@gremius.gg" class="field-input svelte-twi6kd" autocomplete="email" required=""/></div> <div class="field svelte-twi6kd"><label class="field-label svelte-twi6kd" for="password">Password</label> <input type="password" id="password" placeholder="••••••••" class="field-input svelte-twi6kd" autocomplete="current-password" required=""/></div> <button type="submit" class="login-btn svelte-twi6kd"><!></button></form> <p class="login-hint svelte-twi6kd">Built with Better-Auth 🔐</p></div></div>');function Gt(l,s){ue(s,!0);let n=I(""),i=I(""),c=I(null);const y=$(mt),t=$(ft),m=$(()=>e(c)||e(t));async function V(g){g.preventDefault(),p(c,null);try{if(await _t(e(n),e(i)),!bt()){p(c,"Access denied — admin role required"),await Oe();return}ct("/")}catch{}}var M=Et(),W=o(r(M),2),h=o(r(W),2);{var j=g=>{var w=Ot(),Z=o(r(w));a(w),A(()=>E(Z,` ${e(m)??""}`)),v(g,w)};C(h,g=>{e(m)&&g(j)})}var T=o(h,2),k=r(T),S=o(r(k),2);Ae(S),a(k);var q=o(k,2),F=o(r(q),2);Ae(F),a(q);var H=o(q,2),R=r(H);{var se=g=>{var w=Bt();v(g,w)},ie=g=>{var w=Dt();v(g,w)};C(R,g=>{e(y)?g(se):g(ie,!1)})}a(H),a(T),ce(2),a(W),a(M),A(()=>H.disabled=e(y)),Re("submit",T,V),Ne(S,()=>e(n),g=>p(n,g)),Ne(F,()=>e(i),g=>p(i,g)),v(l,M),ve()}var Wt=_('<div class="min-h-screen flex items-center justify-center bg-gremius-bg"><div class="flex flex-col items-center gap-4"><div class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div> <p class="text-gremius-subtle text-sm">Loading...</p></div></div>'),qt=_('<div class="min-h-screen flex items-center justify-center bg-gremius-bg"><div class="flex flex-col items-center gap-4"><div class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div> <p class="text-gremius-subtle text-sm">Loading...</p></div></div>');function va(l,s){ue(s,!0);let n=$(gt),i=$(ht),c=I(!0);ze(async()=>{await Ke(),await xt(),p(c,!1),console.log("🚀 Gremius Admin initialized")});var y=G(),t=L(y);{var m=h=>{var j=Wt();v(h,j)},V=h=>{Tt(h,{children:(j,T)=>{var k=G(),S=L(k);U(S,s,"default",{},null),v(j,k)},$$slots:{default:!0}})},M=h=>{Gt(h,{})},W=h=>{var j=qt();v(h,j)};C(t,h=>{e(c)?h(m):e(i)?h(V,1):e(n)?h(M,2):h(W,!1)})}v(l,y),ve()}export{va as component,ua as universal};
