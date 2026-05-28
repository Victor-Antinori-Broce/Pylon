import{c as rt,a as c,f as x}from"./czsp-qam.js";import{f as it,p as ot,o as nt,a as dt,c as e,s as o,r as t,n as f,t as V,g as n}from"./DLU54kKC.js";import{d as lt,s as b,a as w}from"./DgCnb9Ef.js";import{i as X}from"./BvOCBAo5.js";import{I as ct,s as mt,e as ut,i as pt}from"./C32VXhnW.js";import{t as vt,s as xt}from"./Be8xa8hp.js";import{d}from"./CewLz0Ev.js";import{Z as Y}from"./RGP-LwrY.js";import{P as q}from"./BGCEvteI.js";import{X as gt}from"./BfubmfqA.js";import{L as ft}from"./CT-uGUfx.js";import"./CCgvjjDA.js";import{l as bt,b as ht}from"./DKSnlQjq.js";import{T as _t}from"./v1jipPMu.js";function yt(k,h){const D=bt(h,["children","$$slots","$$events","$$legacy"]);/**
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
 */const $=[["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"}],["path",{d:"m15 5 4 4"}]];ct(k,ht({name:"pencil"},()=>D,{get iconNode(){return $},children:(S,_)=>{var m=rt(),g=it(m);mt(g,h,"default",{}),c(S,m)},$$slots:{default:!0}}))}var wt=x('<div class="card p-4 border-l-4 border-l-gremius-pink bg-gremius-pink/5"><div class="flex items-center justify-between"><p class="text-gremius-pink"> </p> <button class="text-gremius-text-dim hover:text-gremius-text"><!></button></div></div>'),kt=x('<div class="card p-12 text-center"><!> <p class="text-gremius-subtle">Loading datasets...</p></div>'),Dt=x('<div class="card p-12 text-center"><div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gremius-cyan/10 flex items-center justify-center"><!></div> <h3 class="text-lg font-medium text-gremius-text mb-2">No Data Sets Yet</h3> <p class="text-sm text-gremius-subtle max-w-md mx-auto mb-6">Create your first dataset to start collecting and managing data.</p> <a href="/datasets/new" class="btn-primary inline-flex items-center gap-2"><!> Create First Data Set</a></div>'),$t=x('<tr class="border-b border-gremius-border/50 hover:bg-gremius-surface/30 transition-colors cursor-pointer group"><td class="px-4 py-3"><span class="font-medium text-gremius-text group-hover:text-gremius-cyan transition-colors"> </span></td><td class="px-4 py-3"><code class="text-xs text-gremius-subtle bg-gremius-surface px-2 py-0.5 rounded"> </code></td><td class="px-4 py-3 text-sm text-gremius-text-dim"> </td><td class="px-4 py-3 text-sm text-gremius-text-dim truncate max-w-[200px]"> </td><td class="px-4 py-3 text-right"><div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button class="p-1.5 rounded-lg hover:bg-gremius-cyan/10 text-gremius-text-dim hover:text-gremius-cyan transition-colors" title="Edit schema"><!></button> <button class="p-1.5 rounded-lg hover:bg-gremius-pink/10 text-gremius-text-dim hover:text-gremius-pink transition-colors" title="Delete"><!></button></div></td></tr>'),St=x('<div class="card overflow-hidden"><table class="w-full text-left"><thead><tr class="border-b border-gremius-border bg-gremius-surface/50"><th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gremius-subtle">Name</th><th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gremius-subtle">Slug</th><th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gremius-subtle">Fields</th><th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gremius-subtle">Description</th><th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gremius-subtle text-right">Actions</th></tr></thead><tbody></tbody></table></div>'),Pt=x('<div class="space-y-6 animate-fade-in"><div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-cyan/20 to-gremius-purple/20 border border-gremius-cyan/20 flex items-center justify-center"><!></div> Data Sets</h1> <p class="text-sm text-gremius-subtle mt-1">Manage your data collections and schemas.</p></div> <a href="/datasets/new" class="btn-primary inline-flex items-center gap-2"><!> New Data Set</a></div> <!> <!></div>');function jt(k,h){ot(h,!0),nt(()=>{d.fetchDatasets()});function D(s){window.location.href=`/datasets/${s}/edit`}function $(s){window.location.href=`/datasets/${s}/entries`}async function S(s,a){confirm(`Are you sure you want to delete "${a}"?`)&&await d.deleteDataset(s)}var _=Pt(),m=e(_),g=e(m),M=e(g),z=e(M),B=e(z);Y(B,{class:"w-5 h-5 text-gremius-cyan"}),t(z),f(),t(M),f(2),t(g);var T=o(g,2),G=e(T);q(G,{class:"w-4 h-4"}),f(),t(T),t(m);var A=o(m,2);{var H=s=>{var a=wt(),i=e(a),l=e(i),u=e(l,!0);t(l);var r=o(l,2),p=e(r);gt(p,{class:"w-4 h-4"}),t(r),t(i),t(a),V(()=>b(u,d.error)),w("click",r,()=>d.clearError()),vt(3,a,()=>xt),c(s,a)};X(A,s=>{d.error&&s(H)})}var J=o(A,2);{var K=s=>{var a=kt(),i=e(a);ft(i,{class:"w-8 h-8 text-gremius-cyan animate-spin mx-auto mb-4"}),f(2),t(a),c(s,a)},Q=s=>{var a=Dt(),i=e(a),l=e(i);Y(l,{class:"w-8 h-8 text-gremius-cyan/50"}),t(i);var u=o(i,6),r=e(u);q(r,{class:"w-4 h-4"}),f(),t(u),t(a),c(s,a)},R=s=>{var a=St(),i=e(a),l=o(e(i));ut(l,21,()=>d.datasets,pt,(u,r)=>{var p=$t(),P=e(p),C=e(P),U=e(C);t(C),t(P);var j=o(P),F=e(j),W=e(F,!0);t(F),t(j);var L=o(j),tt=e(L);t(L);var N=o(L),et=e(N,!0);t(N);var I=o(N),O=e(I),y=e(O),st=e(y);yt(st,{class:"w-4 h-4"}),t(y);var E=o(y,2),at=e(E);_t(at,{class:"w-4 h-4"}),t(E),t(O),t(I),t(p),V(()=>{var v,Z;b(U,`${(n(r).icon||"📦")??""} ${n(r).name??""}`),b(W,n(r).slug),b(tt,`${(((v=n(r).fields)==null?void 0:v.length)||0)??""} field${(((Z=n(r).fields)==null?void 0:Z.length)||0)!==1?"s":""}`),b(et,n(r).description||"—")}),w("click",p,()=>$(n(r).id)),w("click",y,v=>{v.stopPropagation(),D(n(r).id)}),w("click",E,v=>{v.stopPropagation(),S(n(r).id,n(r).name)}),c(u,p)}),t(l),t(i),t(a),c(s,a)};X(J,s=>{d.isLoading&&d.datasets.length===0?s(K):d.datasets.length===0?s(Q,1):s(R,!1)})}t(_),c(k,_),dt()}lt(["click"]);const Yt=Object.freeze(Object.defineProperty({__proto__:null,default:jt},Symbol.toStringTag,{value:"Module"}));export{jt as D,yt as P,Yt as _};
