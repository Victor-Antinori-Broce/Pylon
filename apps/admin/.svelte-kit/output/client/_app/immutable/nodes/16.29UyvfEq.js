import{c as J,a as d,d as K,f as l,s as M,b as N}from"../chunks/C-6n7b0Y.js";import{i as O}from"../chunks/QRZHqxvK.js";import{f as Q,m as S,w as W,x as s,y as o,A as a,B as V,v as i,C as X}from"../chunks/Bm0TaU-Y.js";import{i as y}from"../chunks/RHSDymrL.js";import{I as Y,s as Z,e as ee,i as te,b as se,c as ae}from"../chunks/C0VBvGkr.js";import{l as re,s as ie,a as oe,b as de}from"../chunks/IuiPc1mh.js";import{t as ne,P as le,s as ce,c as ve}from"../chunks/X4sUii19.js";import{C as me}from"../chunks/l-D0vm5B.js";import{T as ue}from"../chunks/CXn3MSet.js";function pe(c,m){const v=re(m,["children","$$slots","$$events","$$legacy"]);/**
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
 */const g=[["path",{d:"M12 15V3"}],["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}],["path",{d:"m7 10 5 5 5-5"}]];Y(c,ie({name:"download"},()=>v,{get iconNode(){return g},children:(x,B)=>{var n=J(),u=Q(n);Z(u,m,"default",{},null),d(x,n)},$$slots:{default:!0}}))}var fe=l('<div class="absolute top-2 right-2"><span class="px-2 py-1 text-[10px] font-medium bg-gremius-cyan/10 text-gremius-cyan rounded-full">Active</span></div>'),ge=l('<button class="btn-secondary flex-1" disabled=""><!> Active</button>'),xe=l('<button class="btn-primary flex-1">Activate</button>'),_e=l('<button class="p-2 rounded-lg text-gremius-text-dim hover:bg-gremius-pink/10 hover:text-gremius-pink transition-colors"><!></button>'),be=l('<div><!> <div class="flex items-center gap-3 mb-3"><div class="w-10 h-10 rounded-lg flex items-center justify-center"><!></div> <div><h3 class="font-semibold text-gremius-text"> </h3> <p class="text-xs text-gremius-subtle"> </p></div></div> <div class="flex items-center gap-2 mt-4"><!> <!></div></div>'),he=l('<div class="space-y-4"><div class="flex items-center justify-between"><div><h2 class="text-xl font-bold text-gremius-text">Themes</h2> <p class="text-sm text-gremius-text-dim mt-0.5">Customize the appearance</p></div></div> <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"><!> <button class="card p-4 border-dashed border-2 border-gremius-border hover:border-gremius-cyan/50 transition-colors flex flex-col items-center justify-center min-h-[160px] gap-3"><div class="w-10 h-10 rounded-lg bg-gremius-surface flex items-center justify-center"><!></div> <div class="text-center"><h3 class="font-semibold text-gremius-text">Install Theme</h3> <p class="text-xs text-gremius-subtle mt-0.5">Import from file or URL</p></div></button></div></div>');function ye(c,m){S(m,!1);const v=()=>de(ve,"$currentTheme",g),[g,x]=oe();function B(k){}O();var n=he(),u=o(s(n),2),$=s(u);ee($,1,()=>ne,te,(k,r)=>{var p=be();let j;var A=s(p);{var H=e=>{var t=fe();d(e,t)};y(A,e=>{v()===i(r).id&&e(H)})}var _=o(A,2),f=s(_),L=s(f);le(L,{class:"w-5 h-5 text-white"}),a(f);var C=o(f,2),b=s(C),R=s(b,!0);a(b);var I=o(b,2),U=s(I,!0);a(I),a(C),a(_);var P=o(_,2),z=s(P);{var q=e=>{var t=ge(),h=s(t);me(h,{class:"w-4 h-4"}),V(),a(t),d(e,t)},E=e=>{var t=xe();N("click",t,()=>ce(i(r).id)),d(e,t)};y(z,e=>{v()===i(r).id?e(q):e(E,!1)})}var F=o(z,2);{var G=e=>{var t=_e(),h=s(t);ue(h,{class:"w-4 h-4"}),a(t),N("click",t,()=>(i(r).id,void 0)),d(e,t)};y(F,e=>{i(r).id!=="default"&&e(G)})}a(P),a(p),X(()=>{j=se(p,1,"card p-4 relative group",null,j,{"border-gremius-cyan":v()===i(r).id}),ae(f,`background: ${i(r).preview??""}`),M(R,i(r).name),M(U,i(r).description)}),d(k,p)});var w=o($,2),T=s(w),D=s(T);pe(D,{class:"w-5 h-5 text-gremius-cyan"}),a(T),V(2),a(w),a(u),a(n),d(c,n),W(),x()}K(["click"]);function ze(c){ye(c,{})}export{ze as component};
