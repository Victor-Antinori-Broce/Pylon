import{c as P,a as m,f as $}from"./czsp-qam.js";import"./CCgvjjDA.js";import{e as n,g as s,b as g,f as L,p as Z,s as c,c as v,r as p,n as ee,t as D,a as te,u as Q}from"./DLU54kKC.js";import{I as z,s as N,r as E}from"./C32VXhnW.js";import{l as A,b as M}from"./DKSnlQjq.js";import{e as se,s as ae}from"./DgCnb9Ef.js";import{i as J}from"./BvOCBAo5.js";import{b as B}from"./B08h_jkm.js";import{g as pe}from"./DFML2l4h.js";import{_ as me}from"./Dp1pzeXC.js";const q="http://localhost:3001";let y=g(null),V=g(!1),U=g(null),ie=g(!1),W=g(!0);function fe(){return s(y)}function ne(){return s(V)}function le(){return s(U)}function ge(){return s(ie)}function re(){return!!s(y)}function X(){var l;return((l=s(y))==null?void 0:l.role)==="admin"}function he(){return s(W)}async function oe(){try{const i=await(await fetch(`${q}/api/system/init-check`)).json();i.initialized!==void 0&&n(W,i.initialized,!0)}catch{n(W,!0)}}async function Y(){var l,i;n(V,!0),n(U,null);try{console.log(`[auth] checkSession → GET ${q}/api/auth/get-session`);const t=await fetch(`${q}/api/auth/get-session`,{credentials:"include"});if(console.log(`[auth] checkSession response: ${t.status} ${t.statusText}`),!t.ok){console.warn(`[auth] checkSession failed with status ${t.status}, clearing user`),n(y,null);return}const e=await t.json();console.log("[auth] checkSession data:",JSON.stringify(e!=null&&e.user?{id:e.user.id,role:e.user.role,name:e.user.name}:null)),n(y,(e==null?void 0:e.user)||null,!0)}catch(t){console.error("[auth] checkSession error:",t),n(y,null)}finally{n(V,!1),n(ie,!0),console.log(`[auth] checkSession done → user=${((l=s(y))==null?void 0:l.name)||"null"}, role=${((i=s(y))==null?void 0:i.role)||"null"}, loggedIn=${!!s(y)}`)}}async function de(l,i){n(V,!0),n(U,null);try{const t=await fetch(`${q}/api/auth/sign-in/email`,{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({email:l,password:i})});if(!t.ok){const o=await t.json().catch(()=>({}));throw new Error(o.message||o.error||"Invalid credentials")}const e=await t.json();return e!=null&&e.user&&n(y,e.user,!0),e}catch(t){throw n(U,t.message,!0),t}finally{n(V,!1)}}async function ce(){try{await fetch(`${q}/api/auth/sign-out`,{method:"POST",credentials:"include"})}catch{}n(y,null)}const _e=Object.freeze(Object.defineProperty({__proto__:null,checkInit:oe,checkSession:Y,getChecked:ge,getError:le,getLoading:ne,getUser:fe,isAdmin:X,isInitialized:he,isLoggedIn:re,signIn:de,signOut:ce},Symbol.toStringTag,{value:"Module"}));function qe(l,i){const t=A(i,["children","$$slots","$$events","$$legacy"]);/**
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
 */const e=[["path",{d:"M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"}],["rect",{width:"20",height:"14",x:"2",y:"6",rx:"2"}]];z(l,M({name:"briefcase"},()=>t,{get iconNode(){return e},children:(o,f)=>{var r=P(),u=L(r);N(u,i,"default",{}),m(o,r)},$$slots:{default:!0}}))}function Ve(l,i){const t=A(i,["children","$$slots","$$events","$$legacy"]);/**
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
 */const e=[["path",{d:"M11 21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1"}],["path",{d:"M16 16a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1"}],["path",{d:"M21 6a2 2 0 0 0-.586-1.414l-2-2A2 2 0 0 0 17 2h-3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1z"}]];z(l,M({name:"file-stack"},()=>t,{get iconNode(){return e},children:(o,f)=>{var r=P(),u=L(r);N(u,i,"default",{}),m(o,r)},$$slots:{default:!0}}))}function Ge(l,i){const t=A(i,["children","$$slots","$$events","$$legacy"]);/**
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
 */const e=[["line",{x1:"6",x2:"10",y1:"11",y2:"11"}],["line",{x1:"8",x2:"8",y1:"9",y2:"13"}],["line",{x1:"15",x2:"15.01",y1:"12",y2:"12"}],["line",{x1:"18",x2:"18.01",y1:"10",y2:"10"}],["path",{d:"M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"}]];z(l,M({name:"gamepad-2"},()=>t,{get iconNode(){return e},children:(o,f)=>{var r=P(),u=L(r);N(u,i,"default",{}),m(o,r)},$$slots:{default:!0}}))}function De(l,i){const t=A(i,["children","$$slots","$$events","$$legacy"]);/**
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
 */const e=[["path",{d:"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"}],["path",{d:"M22 10v6"}],["path",{d:"M6 12.5V16a6 3 0 0 0 12 0v-3.5"}]];z(l,M({name:"graduation-cap"},()=>t,{get iconNode(){return e},children:(o,f)=>{var r=P(),u=L(r);N(u,i,"default",{}),m(o,r)},$$slots:{default:!0}}))}function Je(l,i){const t=A(i,["children","$$slots","$$events","$$legacy"]);/**
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
 */const e=[["path",{d:"M12 22v-9"}],["path",{d:"M15.17 2.21a1.67 1.67 0 0 1 1.63 0L21 4.57a1.93 1.93 0 0 1 0 3.36L8.82 14.79a1.655 1.655 0 0 1-1.64 0L3 12.43a1.93 1.93 0 0 1 0-3.36z"}],["path",{d:"M20 13v3.87a2.06 2.06 0 0 1-1.11 1.83l-6 3.08a1.93 1.93 0 0 1-1.78 0l-6-3.08A2.06 2.06 0 0 1 4 16.87V13"}],["path",{d:"M21 12.43a1.93 1.93 0 0 0 0-3.36L8.83 2.2a1.64 1.64 0 0 0-1.63 0L3 4.57a1.93 1.93 0 0 0 0 3.36l12.18 6.86a1.636 1.636 0 0 0 1.63 0z"}]];z(l,M({name:"package-open"},()=>t,{get iconNode(){return e},children:(o,f)=>{var r=P(),u=L(r);N(u,i,"default",{}),m(o,r)},$$slots:{default:!0}}))}function Ue(l,i){const t=A(i,["children","$$slots","$$events","$$legacy"]);/**
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
 */const e=[["path",{d:"m17 2-5 5-5-5"}],["rect",{width:"20",height:"15",x:"2",y:"7",rx:"2"}]];z(l,M({name:"tv"},()=>t,{get iconNode(){return e},children:(o,f)=>{var r=P(),u=L(r);N(u,i,"default",{}),m(o,r)},$$slots:{default:!0}}))}var ye=$('<div class="error-banner svelte-twi6kd"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg> </div>'),$e=$('<span class="spinner svelte-twi6kd"></span>'),we=$("<span>Sign In</span>"),be=$('<div class="login-bg svelte-twi6kd"><div class="grid-overlay svelte-twi6kd"></div> <div class="login-card svelte-twi6kd"><div class="brand svelte-twi6kd"><div class="brand-icon svelte-twi6kd"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg></div> <h1 class="brand-name svelte-twi6kd">Gremius</h1> <p class="brand-sub svelte-twi6kd">Admin Console</p></div> <!> <form class="login-form svelte-twi6kd"><div class="field svelte-twi6kd"><label class="field-label svelte-twi6kd" for="email">Email</label> <input type="email" id="email" placeholder="admin@gremius.gg" class="field-input svelte-twi6kd" autocomplete="email" required=""/></div> <div class="field svelte-twi6kd"><label class="field-label svelte-twi6kd" for="password">Password</label> <input type="password" id="password" placeholder="••••••••" class="field-input svelte-twi6kd" autocomplete="current-password" required=""/></div> <button type="submit" class="login-btn svelte-twi6kd"><!></button></form> <p class="login-hint svelte-twi6kd">Built with Better-Auth 🔐</p></div></div>');function ke(l,i){Z(i,!0);let t=g(""),e=g(""),o=g(null);const f=Q(ne),r=Q(le),u=Q(()=>s(o)||s(r));async function F(d){var h;d.preventDefault(),n(o,null);try{console.log("[login] Starting sign-in...");const a=await de(s(t),s(e));if(console.log("[login] signIn result:",JSON.stringify(a!=null&&a.user?{id:a.user.id,role:a.user.role}:"no user")),console.log("[login] Fetching full session..."),await Y(),console.log("[login] After checkSession: isLoggedIn="+re()+", isAdmin="+X()),!X()){console.warn("[login] User is NOT admin, signing out. Role:",(h=a==null?void 0:a.user)==null?void 0:h.role),n(o,"Access denied — admin role required"),await ce();return}console.log("[login] Login successful, navigating to /"),pe("/")}catch(a){console.error("[login] Login error:",a)}}var w=be(),O=c(v(w),2),j=c(v(O),2);{var H=d=>{var h=ye(),a=c(v(h));p(h),D(()=>ae(a,` ${s(u)??""}`)),m(d,h)};J(j,d=>{s(u)&&d(H)})}var b=c(j,2),k=v(b),I=c(v(k),2);E(I),p(k);var x=c(k,2),T=c(v(x),2);E(T),p(x);var S=c(x,2),G=v(S);{var C=d=>{var h=$e();m(d,h)},R=d=>{var h=we();m(d,h)};J(G,d=>{s(f)?d(C):d(R,!1)})}p(S),p(b),ee(2),p(O),p(w),D(()=>S.disabled=s(f)),se("submit",b,F),B(I,()=>s(t),d=>n(t,d)),B(T,()=>s(e),d=>n(e,d)),m(l,w),te()}const Fe=Object.freeze(Object.defineProperty({__proto__:null,default:ke},Symbol.toStringTag,{value:"Module"}));var xe=$('<div class="error-banner svelte-1p6m1m5"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg> </div>'),Se=$('<span class="spinner svelte-1p6m1m5"></span>'),Pe=$("<span>Initialize Registry</span>"),Le=$('<div class="login-bg svelte-1p6m1m5"><div class="grid-overlay svelte-1p6m1m5"></div> <div class="login-card svelte-1p6m1m5"><div class="brand svelte-1p6m1m5"><div class="brand-icon svelte-1p6m1m5"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg></div> <h1 class="brand-name svelte-1p6m1m5">System Init</h1> <p class="brand-sub svelte-1p6m1m5">Create master admin</p></div> <!> <form class="login-form svelte-1p6m1m5"><div class="field svelte-1p6m1m5"><label class="field-label svelte-1p6m1m5" for="name">Display Name</label> <input type="text" id="name" placeholder="System Admin" class="field-input svelte-1p6m1m5" required=""/></div> <div class="field svelte-1p6m1m5"><label class="field-label svelte-1p6m1m5" for="email">Admin Email</label> <input type="email" id="email" placeholder="admin@gremius.gg" class="field-input svelte-1p6m1m5" required=""/></div> <div class="field svelte-1p6m1m5"><label class="field-label svelte-1p6m1m5" for="password">Master Password</label> <input type="password" id="password" placeholder="••••••••" class="field-input svelte-1p6m1m5" minlength="8" required=""/></div> <button type="submit" class="login-btn mt-2 svelte-1p6m1m5"><!></button></form> <p class="login-hint svelte-1p6m1m5">This action seals the installation.</p></div></div>');function ze(l,i){Z(i,!0);let t=g(""),e=g(""),o=g(""),f=g(null),r=g(!1);const u="http://localhost:3001";async function F(a){a.preventDefault(),n(r,!0),n(f,null);try{const _=await fetch(`${u}/api/system/setup`,{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({name:s(t),email:s(e),password:s(o)})}),K=await _.json();if(!_.ok)throw new Error(K.error||"Launch sequence failed.");const{signIn:ue}=await me(async()=>{const{signIn:ve}=await Promise.resolve().then(()=>_e);return{signIn:ve}},void 0,import.meta.url);await ue(s(e),s(o)),await oe(),await Y()}catch(_){n(f,_.message||"An unexpected error occurred.",!0)}finally{n(r,!1)}}var w=Le(),O=c(v(w),2),j=c(v(O),2);{var H=a=>{var _=xe(),K=c(v(_));p(_),D(()=>ae(K,` ${s(f)??""}`)),m(a,_)};J(j,a=>{s(f)&&a(H)})}var b=c(j,2),k=v(b),I=c(v(k),2);E(I),p(k);var x=c(k,2),T=c(v(x),2);E(T),p(x);var S=c(x,2),G=c(v(S),2);E(G),p(S);var C=c(S,2),R=v(C);{var d=a=>{var _=Se();m(a,_)},h=a=>{var _=Pe();m(a,_)};J(R,a=>{s(r)?a(d):a(h,!1)})}p(C),p(b),ee(2),p(O),p(w),D(()=>C.disabled=s(r)),se("submit",b,F),B(I,()=>s(t),a=>n(t,a)),B(T,()=>s(e),a=>n(e,a)),B(G,()=>s(o),a=>n(o,a)),m(l,w),te()}const He=Object.freeze(Object.defineProperty({__proto__:null,default:ze},Symbol.toStringTag,{value:"Module"}));export{qe as B,Ve as F,De as G,ke as L,Je as P,ze as S,Ue as T,He as _,Ge as a,Y as b,oe as c,re as d,ge as e,Fe as f,fe as g,he as i,ce as s};
