import{i as qe,j as Be,k as Y,l as Fe,b as Ue,d as Ve,n as We,o as je,p as Ye,a as ve,q as $e,c as Ke}from"./C-6n7b0Y.js";import{i as Xe}from"./QRZHqxvK.js";import{U as $,b as we,a$ as Ce,h as E,c as G,aH as Ie,a as X,v as m,r as Qe,k as Ze,s as he,d as P,e as R,aO as Je,aV as xe,aB as _e,j as K,b0 as L,V as W,b1 as er,X as rr,ad as ir,b2 as Oe,aU as fe,b3 as ar,b4 as fr,$ as tr,a3 as ge,b5 as sr,Q as Le,T as Me,b6 as ee,q as Re,b7 as nr,b8 as ur,aS as lr,R as Q,aP as or,b9 as cr,E as dr,aG as vr,aY as hr,a2 as _r,Y as Pe,ba as ye,g as te,bb as gr,bc as br,l as pr,p as Ar,bd as Er,be as Sr,bf as Tr,bg as Nr,bh as kr,bi as j,bj as wr,bk as Cr,bl as Ir,bm as Or,m as Lr,w as Mr,N as D,u as be,x as Rr,y as Pr,A as yr,f as Hr,D as Dr,bn as zr}from"./Bm0TaU-Y.js";import{B as Gr,l as pe,p as z}from"./IuiPc1mh.js";function mr(e,r){return r}function qr(e,r,i){for(var a=[],f=r.length,t,s=r.length,n=0;n<f;n++){let _=r[n];Me(_,()=>{if(t){if(t.pending.delete(_),t.done.add(_),t.pending.size===0){var c=e.outrogroups;ae(fe(t.done)),c.delete(t),c.size===0&&(e.outrogroups=null)}}else s-=1},!1)}if(s===0){var o=a.length===0&&i!==null;if(o){var v=i,l=v.parentNode;lr(l),l.append(v),e.items.clear()}ae(r,!o)}else t={pending:new Set(r),done:new Set},(e.outrogroups??(e.outrogroups=new Set)).add(t)}function ae(e,r=!0){for(var i=0;i<e.length;i++)Q(e[i],r)}var Ae;function Br(e,r,i,a,f,t=null){var s=e,n=new Map,o=(r&Ce)!==0;if(o){var v=e;s=E?G(Ie(v)):v.appendChild($())}E&&X();var l=null,_=ir(()=>{var d=i();return Oe(d)?d:d==null?[]:fe(d)}),c,g=!0;function S(){u.fallback=l,Fr(u,c,s,r,a),l!==null&&(c.length===0?(l.f&L)===0?Le(l):(l.f^=L,U(l,null,s)):Me(l,()=>{l=null}))}var N=we(()=>{c=m(_);var d=c.length;let w=!1;if(E){var C=Qe(s)===Ze;C!==(d===0)&&(s=he(),G(s),P(!1),w=!0)}for(var p=new Set,I=K,b=rr(),h=0;h<d;h+=1){E&&R.nodeType===Je&&R.data===xe&&(s=R,w=!0,P(!1));var T=c[h],k=a(T,h),A=g?null:n.get(k);A?(A.v&&_e(A.v,T),A.i&&_e(A.i,h),b&&I.unskip_effect(A.e)):(A=Ur(n,g?s:Ae??(Ae=$()),T,k,h,f,r,i),g||(A.e.f|=L),n.set(k,A)),p.add(k)}if(d===0&&t&&!l&&(g?l=W(()=>t(s)):(l=W(()=>t(Ae??(Ae=$()))),l.f|=L)),d>p.size&&er(),E&&d>0&&G(he()),!g)if(b){for(const[y,H]of n)p.has(y)||I.skip_effect(H.e);I.oncommit(S),I.ondiscard(()=>{})}else S();w&&P(!0),m(_)}),u={effect:N,items:n,outrogroups:null,fallback:l};g=!1,E&&(s=R)}function q(e){for(;e!==null&&(e.f&nr)===0;)e=e.next;return e}function Fr(e,r,i,a,f){var A,y,H,se,ne,ue,le,oe,ce;var t=(a&ur)!==0,s=r.length,n=e.items,o=q(e.effect.first),v,l=null,_,c=[],g=[],S,N,u,d;if(t)for(d=0;d<s;d+=1)S=r[d],N=f(S,d),u=n.get(N).e,(u.f&L)===0&&((y=(A=u.nodes)==null?void 0:A.a)==null||y.measure(),(_??(_=new Set)).add(u));for(d=0;d<s;d+=1){if(S=r[d],N=f(S,d),u=n.get(N).e,e.outrogroups!==null)for(const O of e.outrogroups)O.pending.delete(u),O.done.delete(u);if((u.f&L)!==0)if(u.f^=L,u===o)U(u,null,i);else{var w=l?l.next:o;u===e.effect.last&&(e.effect.last=u.prev),u.prev&&(u.prev.next=u.next),u.next&&(u.next.prev=u.prev),M(e,l,u),M(e,u,w),U(u,w,i),l=u,c=[],g=[],o=q(l.next);continue}if((u.f&ee)!==0&&(Le(u),t&&((se=(H=u.nodes)==null?void 0:H.a)==null||se.unfix(),(_??(_=new Set)).delete(u))),u!==o){if(v!==void 0&&v.has(u)){if(c.length<g.length){var C=g[0],p;l=C.prev;var I=c[0],b=c[c.length-1];for(p=0;p<c.length;p+=1)U(c[p],C,i);for(p=0;p<g.length;p+=1)v.delete(g[p]);M(e,I.prev,b.next),M(e,l,I),M(e,b,C),o=C,l=b,d-=1,c=[],g=[]}else v.delete(u),U(u,o,i),M(e,u.prev,u.next),M(e,u,l===null?e.effect.first:l.next),M(e,l,u),l=u;continue}for(c=[],g=[];o!==null&&o!==u;)(v??(v=new Set)).add(o),g.push(o),o=q(o.next);if(o===null)continue}(u.f&L)===0&&c.push(u),l=u,o=q(u.next)}if(e.outrogroups!==null){for(const O of e.outrogroups)O.pending.size===0&&(ae(fe(O.done)),(ne=e.outrogroups)==null||ne.delete(O));e.outrogroups.size===0&&(e.outrogroups=null)}if(o!==null||v!==void 0){var h=[];if(v!==void 0)for(u of v)(u.f&ee)===0&&h.push(u);for(;o!==null;)(o.f&ee)===0&&o!==e.fallback&&h.push(o),o=q(o.next);var T=h.length;if(T>0){var k=(a&Ce)!==0&&s===0?i:null;if(t){for(d=0;d<T;d+=1)(le=(ue=h[d].nodes)==null?void 0:ue.a)==null||le.measure();for(d=0;d<T;d+=1)(ce=(oe=h[d].nodes)==null?void 0:oe.a)==null||ce.fix()}qr(e,h,k)}}t&&Re(()=>{var O,de;if(_!==void 0)for(u of _)(de=(O=u.nodes)==null?void 0:O.a)==null||de.apply()})}function Ur(e,r,i,a,f,t,s,n){var o=(s&ar)!==0?(s&fr)===0?tr(i,!1,!1):ge(i):null,v=(s&sr)!==0?ge(f):null;return{v:o,i:v,e:W(()=>(t(r,o??i,v??f,n),()=>{e.delete(a)}))}}function U(e,r,i){if(e.nodes)for(var a=e.nodes.start,f=e.nodes.end,t=r&&(r.f&L)===0?r.nodes.start:i;a!==null;){var s=or(a);if(t.before(a),a===f)return;a=s}}function M(e,r,i){r===null?e.effect.first=i:r.next=i,i===null?e.effect.last=r:i.prev=r}function Vr(e,r,i,a,f){var n;E&&X();var t=(n=r.$$slots)==null?void 0:n[i],s=!1;t===!0&&(t=r[i==="default"?"children":i],s=!0),t===void 0?f!==null&&f(e):t(e,s?()=>a:a)}function Wr(e,r,i,a,f,t){let s=E;E&&X();var n=null;E&&R.nodeType===cr&&(n=R,X());var o=E?R:e,v=new Gr(o,!1);we(()=>{const l=r()||null;var _=hr;if(l===null){v.ensure(null,null),Y(!0);return}return v.ensure(l,c=>{if(l){if(n=E?n:vr(l,_),qe(n,n),a){E&&Be(l)&&n.append(document.createComment(""));var g=E?Ie(n):n.appendChild($());E&&(g===null?P(!1):G(g)),a(n,g)}_r.nodes.end=n,c.before(n)}E&&G(c)}),Y(!0),()=>{l&&Y(!1)}},dr),Pe(()=>{Y(!0)}),s&&(P(!0),G(o))}function jr(e,r){var i=void 0,a;ye(()=>{i!==(i=r())&&(a&&(Q(a),a=null),i&&(a=W(()=>{te(()=>i(e))})))})}function He(e){var r,i,a="";if(typeof e=="string"||typeof e=="number")a+=e;else if(typeof e=="object")if(Array.isArray(e)){var f=e.length;for(r=0;r<f;r++)e[r]&&(i=He(e[r]))&&(a&&(a+=" "),a+=i)}else for(i in e)e[i]&&(a&&(a+=" "),a+=i);return a}function Yr(){for(var e,r,i=0,a="",f=arguments.length;i<f;i++)(e=arguments[i])&&(r=He(e))&&(a&&(a+=" "),a+=r);return a}function $r(e){return typeof e=="object"?Yr(e):e??""}const Ee=[...` 	
\r\f \v\uFEFF`];function Kr(e,r,i){var a=e==null?"":""+e;if(r&&(a=a?a+" "+r:r),i){for(var f of Object.keys(i))if(i[f])a=a?a+" "+f:f;else if(a.length)for(var t=f.length,s=0;(s=a.indexOf(f,s))>=0;){var n=s+t;(s===0||Ee.includes(a[s-1]))&&(n===a.length||Ee.includes(a[n]))?a=(s===0?"":a.substring(0,s))+a.substring(n+1):s=n}}return a===""?null:a}function Se(e,r=!1){var i=r?" !important;":";",a="";for(var f of Object.keys(e)){var t=e[f];t!=null&&t!==""&&(a+=" "+f+": "+t+i)}return a}function re(e){return e[0]!=="-"||e[1]!=="-"?e.toLowerCase():e}function Xr(e,r){if(r){var i="",a,f;if(Array.isArray(r)?(a=r[0],f=r[1]):a=r,e){e=String(e).replaceAll(/\s*\/\*.*?\*\/\s*/g,"").trim();var t=!1,s=0,n=!1,o=[];a&&o.push(...Object.keys(a).map(re)),f&&o.push(...Object.keys(f).map(re));var v=0,l=-1;const N=e.length;for(var _=0;_<N;_++){var c=e[_];if(n?c==="/"&&e[_-1]==="*"&&(n=!1):t?t===c&&(t=!1):c==="/"&&e[_+1]==="*"?n=!0:c==='"'||c==="'"?t=c:c==="("?s++:c===")"&&s--,!n&&t===!1&&s===0){if(c===":"&&l===-1)l=_;else if(c===";"||_===N-1){if(l!==-1){var g=re(e.substring(v,l).trim());if(!o.includes(g)){c!==";"&&_++;var S=e.substring(v,_).trim();i+=" "+S+";"}}v=_+1,l=-1}}}}return a&&(i+=Se(a)),f&&(i+=Se(f,!0)),i=i.trim(),i===""?null:i}return e==null?null:String(e)}function Qr(e,r,i,a,f,t){var s=e.__className;if(E||s!==i||s===void 0){var n=Kr(i,a,t);(!E||n!==e.getAttribute("class"))&&(n==null?e.removeAttribute("class"):r?e.className=n:e.setAttribute("class",n)),e.__className=i}else if(t&&f!==t)for(var o in t){var v=!!t[o];(f==null||v!==!!f[o])&&e.classList.toggle(o,v)}return t}function ie(e,r={},i,a){for(var f in i){var t=i[f];r[f]!==t&&(i[f]==null?e.style.removeProperty(f):e.style.setProperty(f,t,a))}}function Zr(e,r,i,a){var f=e.__style;if(E||f!==r){var t=Xr(r,a);(!E||t!==e.getAttribute("style"))&&(t==null?e.removeAttribute("style"):e.style.cssText=t),e.__style=r}else a&&(Array.isArray(a)?(ie(e,i==null?void 0:i[0],a[0]),ie(e,i==null?void 0:i[1],a[1],"important")):ie(e,i,a));return a}function Z(e,r,i=!1){if(e.multiple){if(r==null)return;if(!Oe(r))return gr();for(var a of e.options)a.selected=r.includes(V(a));return}for(a of e.options){var f=V(a);if(br(f,r)){a.selected=!0;return}}(!i||r!==void 0)&&(e.selectedIndex=-1)}function De(e){var r=new MutationObserver(()=>{Z(e,e.__value)});r.observe(e,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["value"]}),Pe(()=>{r.disconnect()})}function vi(e,r,i=r){var a=new WeakSet,f=!0;pr(e,"change",t=>{var s=t?"[selected]":":checked",n;if(e.multiple)n=[].map.call(e.querySelectorAll(s),V);else{var o=e.querySelector(s)??e.querySelector("option:not([disabled])");n=o&&V(o)}i(n),K!==null&&a.add(K)}),te(()=>{var t=r();if(e===document.activeElement){var s=Ar??K;if(a.has(s))return}if(Z(e,t,f),f&&t===void 0){var n=e.querySelector(":checked");n!==null&&(t=V(n),i(t))}e.__value=t,f=!1}),De(e)}function V(e){return"__value"in e?e.__value:e.value}const B=Symbol("class"),F=Symbol("style"),ze=Symbol("is custom element"),Ge=Symbol("is html"),Jr=j?"link":"LINK",xr=j?"input":"INPUT",ei=j?"option":"OPTION",ri=j?"select":"SELECT",ii=j?"progress":"PROGRESS";function ai(e){if(E){var r=!1,i=()=>{if(!r){if(r=!0,e.hasAttribute("value")){var a=e.value;J(e,"value",null),e.value=a}if(e.hasAttribute("checked")){var f=e.checked;J(e,"checked",null),e.checked=f}}};e.__on_r=i,Re(i),Ir()}}function hi(e,r){var i=x(e);i.value===(i.value=r??void 0)||e.value===r&&(r!==0||e.nodeName!==ii)||(e.value=r??"")}function _i(e,r){var i=x(e);i.checked!==(i.checked=r??void 0)&&(e.checked=r)}function fi(e,r){r?e.hasAttribute("selected")||e.setAttribute("selected",""):e.removeAttribute("selected")}function J(e,r,i,a){var f=x(e);E&&(f[r]=e.getAttribute(r),r==="src"||r==="srcset"||r==="href"&&e.nodeName===Jr)||f[r]!==(f[r]=i)&&(r==="loading"&&(e[Or]=i),i==null?e.removeAttribute(r):typeof i!="string"&&me(e).includes(r)?e[r]=i:e.setAttribute(r,i))}function ti(e,r,i,a,f=!1,t=!1){if(E&&f&&e.nodeName===xr){var s=e,n=s.type==="checkbox"?"defaultChecked":"defaultValue";n in i||ai(s)}var o=x(e),v=o[ze],l=!o[Ge];let _=E&&v;_&&P(!1);var c=r||{},g=e.nodeName===ei;for(var S in r)S in i||(i[S]=null);i.class?i.class=$r(i.class):i[B]&&(i.class=null),i[F]&&(i.style??(i.style=null));var N=me(e);for(const b in i){let h=i[b];if(g&&b==="value"&&h==null){e.value=e.__value="",c[b]=h;continue}if(b==="class"){var u=e.namespaceURI==="http://www.w3.org/1999/xhtml";Qr(e,u,h,a,r==null?void 0:r[B],i[B]),c[b]=h,c[B]=i[B];continue}if(b==="style"){Zr(e,h,r==null?void 0:r[F],i[F]),c[b]=h,c[F]=i[F];continue}var d=c[b];if(!(h===d&&!(h===void 0&&e.hasAttribute(b)))){c[b]=h;var w=b[0]+b[1];if(w!=="$$")if(w==="on"){const T={},k="$$"+b;let A=b.slice(2);var C=Ye(A);if(Fe(A)&&(A=A.slice(0,-7),T.capture=!0),!C&&d){if(h!=null)continue;e.removeEventListener(A,c[k],T),c[k]=null}if(C)Ue(A,e,h),Ve([A]);else if(h!=null){let y=function(H){c[b].call(this,H)};c[k]=We(A,e,y,T)}}else if(b==="style")J(e,b,h);else if(b==="autofocus")wr(e,!!h);else if(!v&&(b==="__value"||b==="value"&&h!=null))e.value=e.__value=h;else if(b==="selected"&&g)fi(e,h);else{var p=b;l||(p=je(p));var I=p==="defaultValue"||p==="defaultChecked";if(h==null&&!v&&!I)if(o[b]=null,p==="value"||p==="checked"){let T=e;const k=r===void 0;if(p==="value"){let A=T.defaultValue;T.removeAttribute(p),T.defaultValue=A,T.value=T.__value=k?A:null}else{let A=T.defaultChecked;T.removeAttribute(p),T.defaultChecked=A,T.checked=k?A:!1}}else e.removeAttribute(b);else I||N.includes(p)&&(v||typeof h!="string")?(e[p]=h,p in o&&(o[p]=Cr)):typeof h!="function"&&J(e,p,h)}}}return _&&P(!0),c}function Te(e,r,i=[],a=[],f=[],t,s=!1,n=!1){Er(f,i,a,o=>{var v=void 0,l={},_=e.nodeName===ri,c=!1;if(ye(()=>{var S=r(...o.map(m)),N=ti(e,v,S,t,s,n);c&&_&&"value"in S&&Z(e,S.value);for(let d of Object.getOwnPropertySymbols(l))S[d]||Q(l[d]);for(let d of Object.getOwnPropertySymbols(S)){var u=S[d];d.description===Nr&&(!v||u!==v[d])&&(l[d]&&Q(l[d]),l[d]=W(()=>jr(e,()=>u))),N[d]=u}v=N}),_){var g=e;te(()=>{Z(g,v.value,!0),De(g)})}c=!0})}function x(e){return e.__attributes??(e.__attributes={[ze]:e.nodeName.includes("-"),[Ge]:e.namespaceURI===Sr})}var Ne=new Map;function me(e){var r=e.getAttribute("is")||e.nodeName,i=Ne.get(r);if(i)return i;Ne.set(r,i=[]);for(var a,f=e,t=Element.prototype;t!==f;){a=kr(f);for(var s in a)a[s].set&&i.push(s);f=Tr(f)}return i}/**
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
 */const si={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"};/**
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
 */const ni=e=>{for(const r in e)if(r.startsWith("aria-")||r==="role"||r==="title")return!0;return!1};/**
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
 */const ke=(...e)=>e.filter((r,i,a)=>!!r&&r.trim()!==""&&a.indexOf(r)===i).join(" ").trim();var ui=$e("<svg><!><!></svg>");function gi(e,r){const i=pe(r,["children","$$slots","$$events","$$legacy"]),a=pe(i,["name","color","size","strokeWidth","absoluteStrokeWidth","iconNode"]);Lr(r,!1);let f=z(r,"name",8,void 0),t=z(r,"color",8,"currentColor"),s=z(r,"size",8,24),n=z(r,"strokeWidth",8,2),o=z(r,"absoluteStrokeWidth",8,!1),v=z(r,"iconNode",24,()=>[]);Xe();var l=ui();Te(l,(g,S,N)=>({...si,...g,...a,width:s(),height:s(),stroke:t(),"stroke-width":S,class:N}),[()=>ni(a)?void 0:{"aria-hidden":"true"},()=>(D(o()),D(n()),D(s()),be(()=>o()?Number(n())*24/Number(s()):n())),()=>(D(ke),D(f()),D(i),be(()=>ke("lucide-icon","lucide",f()?`lucide-${f()}`:"",i.class)))]);var _=Rr(l);Br(_,1,v,mr,(g,S)=>{var N=Dr(()=>zr(m(S),2));let u=()=>m(N)[0],d=()=>m(N)[1];var w=Ke(),C=Hr(w);Wr(C,u,!0,(p,I)=>{Te(p,()=>({...d()}))}),ve(g,w)});var c=Pr(_);Vr(c,r,"default",{},null),yr(l),ve(e,l),Mr()}export{gi as I,J as a,Qr as b,Zr as c,vi as d,Br as e,$r as f,hi as g,De as h,mr as i,Z as j,_i as k,ai as r,Vr as s};
