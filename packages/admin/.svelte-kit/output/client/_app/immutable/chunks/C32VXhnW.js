import{b as Be,a as ve,d as Fe,c as Ue}from"./czsp-qam.js";import{i as We}from"./CCgvjjDA.js";import{X,m as we,g as D,aN as he,G as $,Y as V,b1 as qe,_ as Ve,b2 as Ce,ag as je,b3 as Ie,aZ as fe,b4 as Ye,a6 as _e,b5 as Xe,b6 as $e,a0 as Ke,v as E,A as G,as as Oe,x as K,y as Ze,J as Je,z as ge,B as P,C as R,aT as Qe,a_ as xe,b7 as L,U as Le,W as Me,b8 as ee,q as Re,b9 as er,ba as rr,aX as ar,V as Z,aU as ir,bb as fr,E as tr,ar as sr,bc as nr,a5 as ur,a3 as Pe,bd as me,j as te,D as lr,be as or,bf as cr,I as dr,bg as vr,bh as hr,bi as _r,bj as j,bk as gr,bl as br,bm as pr,bn as Ar,bo as Er,bp as Sr,p as Tr,a as Nr,c as kr,s as wr,P as H,l as be,f as Cr,r as Ir,u as Or,b0 as Lr}from"./DLU54kKC.js";import{i as Mr,c as Y,f as Rr,a as Pr,d as mr,g as yr,n as Hr,j as zr}from"./DgCnb9Ef.js";import{B as Dr,l as pe,p as z}from"./DKSnlQjq.js";function Gr(e,r){return r}function Br(e,r,a){for(var i=[],f=r.length,t,s=r.length,n=0;n<f;n++){let _=r[n];Me(_,()=>{if(t){if(t.pending.delete(_),t.done.add(_),t.pending.size===0){var c=e.outrogroups;ie(fe(t.done)),c.delete(t),c.size===0&&(e.outrogroups=null)}}else s-=1},!1)}if(s===0){var o=i.length===0&&a!==null;if(o){var v=a,l=v.parentNode;ar(l),l.append(v),e.items.clear()}ie(r,!o)}else t={pending:new Set(r),done:new Set},(e.outrogroups??(e.outrogroups=new Set)).add(t)}function ie(e,r=!0){for(var a=0;a<e.length;a++)Z(e[a],r)}var Ae;function Fr(e,r,a,i,f,t=null){var s=e,n=new Map,o=(r&Ce)!==0;if(o){var v=e;s=E?G(Oe(v)):v.appendChild(X())}E&&K();var l=null,_=je(()=>{var d=a();return Ie(d)?d:d==null?[]:fe(d)}),c,g=!0;function S(){u.fallback=l,Ur(u,c,s,r,i),l!==null&&(c.length===0?(l.f&L)===0?Le(l):(l.f^=L,W(l,null,s)):Me(l,()=>{l=null}))}var N=we(()=>{c=D(_);var d=c.length;let w=!1;if(E){var C=Ze(s)===Je;C!==(d===0)&&(s=ge(),G(s),P(!1),w=!0)}for(var p=new Set,I=$,b=Ve(),h=0;h<d;h+=1){E&&R.nodeType===Qe&&R.data===xe&&(s=R,w=!0,P(!1));var T=c[h],k=i(T,h),A=g?null:n.get(k);A?(A.v&&he(A.v,T),A.i&&he(A.i,h),b&&I.unskip_effect(A.e)):(A=Wr(n,g?s:Ae??(Ae=X()),T,k,h,f,r,a),g||(A.e.f|=L),n.set(k,A)),p.add(k)}if(d===0&&t&&!l&&(g?l=V(()=>t(s)):(l=V(()=>t(Ae??(Ae=X()))),l.f|=L)),d>p.size&&qe(),E&&d>0&&G(ge()),!g)if(b){for(const[m,y]of n)p.has(m)||I.skip_effect(y.e);I.oncommit(S),I.ondiscard(()=>{})}else S();w&&P(!0),D(_)}),u={effect:N,items:n,outrogroups:null,fallback:l};g=!1,E&&(s=R)}function B(e){for(;e!==null&&(e.f&er)===0;)e=e.next;return e}function Ur(e,r,a,i,f){var A,m,y,se,ne,ue,le,oe,ce;var t=(i&rr)!==0,s=r.length,n=e.items,o=B(e.effect.first),v,l=null,_,c=[],g=[],S,N,u,d;if(t)for(d=0;d<s;d+=1)S=r[d],N=f(S,d),u=n.get(N).e,(u.f&L)===0&&((m=(A=u.nodes)==null?void 0:A.a)==null||m.measure(),(_??(_=new Set)).add(u));for(d=0;d<s;d+=1){if(S=r[d],N=f(S,d),u=n.get(N).e,e.outrogroups!==null)for(const O of e.outrogroups)O.pending.delete(u),O.done.delete(u);if((u.f&L)!==0)if(u.f^=L,u===o)W(u,null,a);else{var w=l?l.next:o;u===e.effect.last&&(e.effect.last=u.prev),u.prev&&(u.prev.next=u.next),u.next&&(u.next.prev=u.prev),M(e,l,u),M(e,u,w),W(u,w,a),l=u,c=[],g=[],o=B(l.next);continue}if((u.f&ee)!==0&&(Le(u),t&&((se=(y=u.nodes)==null?void 0:y.a)==null||se.unfix(),(_??(_=new Set)).delete(u))),u!==o){if(v!==void 0&&v.has(u)){if(c.length<g.length){var C=g[0],p;l=C.prev;var I=c[0],b=c[c.length-1];for(p=0;p<c.length;p+=1)W(c[p],C,a);for(p=0;p<g.length;p+=1)v.delete(g[p]);M(e,I.prev,b.next),M(e,l,I),M(e,b,C),o=C,l=b,d-=1,c=[],g=[]}else v.delete(u),W(u,o,a),M(e,u.prev,u.next),M(e,u,l===null?e.effect.first:l.next),M(e,l,u),l=u;continue}for(c=[],g=[];o!==null&&o!==u;)(v??(v=new Set)).add(o),g.push(o),o=B(o.next);if(o===null)continue}(u.f&L)===0&&c.push(u),l=u,o=B(u.next)}if(e.outrogroups!==null){for(const O of e.outrogroups)O.pending.size===0&&(ie(fe(O.done)),(ne=e.outrogroups)==null||ne.delete(O));e.outrogroups.size===0&&(e.outrogroups=null)}if(o!==null||v!==void 0){var h=[];if(v!==void 0)for(u of v)(u.f&ee)===0&&h.push(u);for(;o!==null;)(o.f&ee)===0&&o!==e.fallback&&h.push(o),o=B(o.next);var T=h.length;if(T>0){var k=(i&Ce)!==0&&s===0?a:null;if(t){for(d=0;d<T;d+=1)(le=(ue=h[d].nodes)==null?void 0:ue.a)==null||le.measure();for(d=0;d<T;d+=1)(ce=(oe=h[d].nodes)==null?void 0:oe.a)==null||ce.fix()}Br(e,h,k)}}t&&Re(()=>{var O,de;if(_!==void 0)for(u of _)(de=(O=u.nodes)==null?void 0:O.a)==null||de.apply()})}function Wr(e,r,a,i,f,t,s,n){var o=(s&Xe)!==0?(s&$e)===0?Ke(a,!1,!1):_e(a):null,v=(s&Ye)!==0?_e(f):null;return{v:o,i:v,e:V(()=>(t(r,o??a,v??f,n),()=>{e.delete(i)}))}}function W(e,r,a){if(e.nodes)for(var i=e.nodes.start,f=e.nodes.end,t=r&&(r.f&L)===0?r.nodes.start:a;i!==null;){var s=ir(i);if(t.before(i),i===f)return;i=s}}function M(e,r,a){r===null?e.effect.first=a:r.next=a,a===null?e.effect.last=r:a.prev=r}function qr(e,r,a,i,f){var n;E&&K();var t=(n=r.$$slots)==null?void 0:n[a],s=!1;t===!0&&(t=r.children,s=!0),t===void 0||t(e,s?()=>i:i)}function Vr(e,r,a,i,f,t){let s=E;E&&K();var n=null;E&&R.nodeType===fr&&(n=R,K());var o=E?R:e,v=new Dr(o,!1);we(()=>{const l=r()||null;var _=nr;if(l===null){v.ensure(null,null),Y(!0);return}return v.ensure(l,c=>{if(l){if(n=E?n:sr(l,_),Be(n,n),i){E&&Mr(l)&&n.append(document.createComment(""));var g=E?Oe(n):n.appendChild(X());E&&(g===null?P(!1):G(g)),i(n,g)}ur.nodes.end=n,c.before(n)}E&&G(c)}),Y(!0),()=>{l&&Y(!1)}},tr),Pe(()=>{Y(!0)}),s&&(P(!0),G(o))}function jr(e,r){var a=void 0,i;me(()=>{a!==(a=r())&&(i&&(Z(i),i=null),a&&(i=V(()=>{te(()=>a(e))})))})}function ye(e){var r,a,i="";if(typeof e=="string"||typeof e=="number")i+=e;else if(typeof e=="object")if(Array.isArray(e)){var f=e.length;for(r=0;r<f;r++)e[r]&&(a=ye(e[r]))&&(i&&(i+=" "),i+=a)}else for(a in e)e[a]&&(i&&(i+=" "),i+=a);return i}function Yr(){for(var e,r,a=0,i="",f=arguments.length;a<f;a++)(e=arguments[a])&&(r=ye(e))&&(i&&(i+=" "),i+=r);return i}function Xr(e){return typeof e=="object"?Yr(e):e??""}const Ee=[...` 	
\r\f \v\uFEFF`];function $r(e,r,a){var i=e==null?"":""+e;if(r&&(i=i?i+" "+r:r),a){for(var f of Object.keys(a))if(a[f])i=i?i+" "+f:f;else if(i.length)for(var t=f.length,s=0;(s=i.indexOf(f,s))>=0;){var n=s+t;(s===0||Ee.includes(i[s-1]))&&(n===i.length||Ee.includes(i[n]))?i=(s===0?"":i.substring(0,s))+i.substring(n+1):s=n}}return i===""?null:i}function Se(e,r=!1){var a=r?" !important;":";",i="";for(var f of Object.keys(e)){var t=e[f];t!=null&&t!==""&&(i+=" "+f+": "+t+a)}return i}function re(e){return e[0]!=="-"||e[1]!=="-"?e.toLowerCase():e}function Kr(e,r){if(r){var a="",i,f;if(Array.isArray(r)?(i=r[0],f=r[1]):i=r,e){e=String(e).replaceAll(/\s*\/\*.*?\*\/\s*/g,"").trim();var t=!1,s=0,n=!1,o=[];i&&o.push(...Object.keys(i).map(re)),f&&o.push(...Object.keys(f).map(re));var v=0,l=-1;const N=e.length;for(var _=0;_<N;_++){var c=e[_];if(n?c==="/"&&e[_-1]==="*"&&(n=!1):t?t===c&&(t=!1):c==="/"&&e[_+1]==="*"?n=!0:c==='"'||c==="'"?t=c:c==="("?s++:c===")"&&s--,!n&&t===!1&&s===0){if(c===":"&&l===-1)l=_;else if(c===";"||_===N-1){if(l!==-1){var g=re(e.substring(v,l).trim());if(!o.includes(g)){c!==";"&&_++;var S=e.substring(v,_).trim();a+=" "+S+";"}}v=_+1,l=-1}}}}return i&&(a+=Se(i)),f&&(a+=Se(f,!0)),a=a.trim(),a===""?null:a}return e==null?null:String(e)}function Zr(e,r,a,i,f,t){var s=e.__className;if(E||s!==a||s===void 0){var n=$r(a,i,t);(!E||n!==e.getAttribute("class"))&&(n==null?e.removeAttribute("class"):r?e.className=n:e.setAttribute("class",n)),e.__className=a}else if(t&&f!==t)for(var o in t){var v=!!t[o];(f==null||v!==!!f[o])&&e.classList.toggle(o,v)}return t}function ae(e,r={},a,i){for(var f in a){var t=a[f];r[f]!==t&&(a[f]==null?e.style.removeProperty(f):e.style.setProperty(f,t,i))}}function Jr(e,r,a,i){var f=e.__style;if(E||f!==r){var t=Kr(r,i);(!E||t!==e.getAttribute("style"))&&(t==null?e.removeAttribute("style"):e.style.cssText=t),e.__style=r}else i&&(Array.isArray(i)?(ae(e,a==null?void 0:a[0],i[0]),ae(e,a==null?void 0:a[1],i[1],"important")):ae(e,a,i));return i}function J(e,r,a=!1){if(e.multiple){if(r==null)return;if(!Ie(r))return or();for(var i of e.options)i.selected=r.includes(q(i));return}for(i of e.options){var f=q(i);if(cr(f,r)){i.selected=!0;return}}(!a||r!==void 0)&&(e.selectedIndex=-1)}function He(e){var r=new MutationObserver(()=>{J(e,e.__value)});r.observe(e,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["value"]}),Pe(()=>{r.disconnect()})}function ha(e,r,a=r){var i=new WeakSet,f=!0;lr(e,"change",t=>{var s=t?"[selected]":":checked",n;if(e.multiple)n=[].map.call(e.querySelectorAll(s),q);else{var o=e.querySelector(s)??e.querySelector("option:not([disabled])");n=o&&q(o)}a(n),$!==null&&i.add($)}),te(()=>{var t=r();if(e===document.activeElement){var s=dr??$;if(i.has(s))return}if(J(e,t,f),f&&t===void 0){var n=e.querySelector(":checked");n!==null&&(t=q(n),a(t))}e.__value=t,f=!1}),He(e)}function q(e){return"__value"in e?e.__value:e.value}const F=Symbol("class"),U=Symbol("style"),ze=Symbol("is custom element"),De=Symbol("is html"),Qr=j?"link":"LINK",xr=j?"input":"INPUT",ea=j?"option":"OPTION",ra=j?"select":"SELECT",aa=j?"progress":"PROGRESS";function ia(e){if(E){var r=!1,a=()=>{if(!r){if(r=!0,e.hasAttribute("value")){var i=e.value;Q(e,"value",null),e.value=i}if(e.hasAttribute("checked")){var f=e.checked;Q(e,"checked",null),e.checked=f}}};e.__on_r=a,Re(a),Sr()}}function _a(e,r){var a=x(e);a.value===(a.value=r??void 0)||e.value===r&&(r!==0||e.nodeName!==aa)||(e.value=r??"")}function ga(e,r){var a=x(e);a.checked!==(a.checked=r??void 0)&&(e.checked=r)}function fa(e,r){r?e.hasAttribute("selected")||e.setAttribute("selected",""):e.removeAttribute("selected")}function Q(e,r,a,i){var f=x(e);E&&(f[r]=e.getAttribute(r),r==="src"||r==="srcset"||r==="href"&&e.nodeName===Qr)||f[r]!==(f[r]=a)&&(r==="loading"&&(e[_r]=a),a==null?e.removeAttribute(r):typeof a!="string"&&Ge(e).includes(r)?e[r]=a:e.setAttribute(r,a))}function ta(e,r,a,i,f=!1,t=!1){if(E&&f&&e.nodeName===xr){var s=e,n=s.type==="checkbox"?"defaultChecked":"defaultValue";n in a||ia(s)}var o=x(e),v=o[ze],l=!o[De];let _=E&&v;_&&P(!1);var c=r||{},g=e.nodeName===ea;for(var S in r)S in a||(a[S]=null);a.class?a.class=Xr(a.class):a[F]&&(a.class=null),a[U]&&(a.style??(a.style=null));var N=Ge(e);for(const b in a){let h=a[b];if(g&&b==="value"&&h==null){e.value=e.__value="",c[b]=h;continue}if(b==="class"){var u=e.namespaceURI==="http://www.w3.org/1999/xhtml";Zr(e,u,h,i,r==null?void 0:r[F],a[F]),c[b]=h,c[F]=a[F];continue}if(b==="style"){Jr(e,h,r==null?void 0:r[U],a[U]),c[b]=h,c[U]=a[U];continue}var d=c[b];if(!(h===d&&!(h===void 0&&e.hasAttribute(b)))){c[b]=h;var w=b[0]+b[1];if(w!=="$$")if(w==="on"){const T={},k="$$"+b;let A=b.slice(2);var C=zr(A);if(Rr(A)&&(A=A.slice(0,-7),T.capture=!0),!C&&d){if(h!=null)continue;e.removeEventListener(A,c[k],T),c[k]=null}if(C)Pr(A,e,h),mr([A]);else if(h!=null){let m=function(y){c[b].call(this,y)};c[k]=yr(A,e,m,T)}}else if(b==="style")Q(e,b,h);else if(b==="autofocus")gr(e,!!h);else if(!v&&(b==="__value"||b==="value"&&h!=null))e.value=e.__value=h;else if(b==="selected"&&g)fa(e,h);else{var p=b;l||(p=Hr(p));var I=p==="defaultValue"||p==="defaultChecked";if(h==null&&!v&&!I)if(o[b]=null,p==="value"||p==="checked"){let T=e;const k=r===void 0;if(p==="value"){let A=T.defaultValue;T.removeAttribute(p),T.defaultValue=A,T.value=T.__value=k?A:null}else{let A=T.defaultChecked;T.removeAttribute(p),T.defaultChecked=A,T.checked=k?A:!1}}else e.removeAttribute(b);else I||N.includes(p)&&(v||typeof h!="string")?(e[p]=h,p in o&&(o[p]=br)):typeof h!="function"&&Q(e,p,h)}}}return _&&P(!0),c}function Te(e,r,a=[],i=[],f=[],t,s=!1,n=!1){vr(f,a,i,o=>{var v=void 0,l={},_=e.nodeName===ra,c=!1;if(me(()=>{var S=r(...o.map(D)),N=ta(e,v,S,t,s,n);c&&_&&"value"in S&&J(e,S.value);for(let d of Object.getOwnPropertySymbols(l))S[d]||Z(l[d]);for(let d of Object.getOwnPropertySymbols(S)){var u=S[d];d.description===hr&&(!v||u!==v[d])&&(l[d]&&Z(l[d]),l[d]=V(()=>jr(e,()=>u))),N[d]=u}v=N}),_){var g=e;te(()=>{J(g,v.value,!0),He(g)})}c=!0})}function x(e){return e.__attributes??(e.__attributes={[ze]:e.nodeName.includes("-"),[De]:e.namespaceURI===pr})}var Ne=new Map;function Ge(e){var r=e.getAttribute("is")||e.nodeName,a=Ne.get(r);if(a)return a;Ne.set(r,a=[]);for(var i,f=e,t=Element.prototype;t!==f;){i=Er(f);for(var s in i)i[s].set&&a.push(s);f=Ar(f)}return a}/**
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
 */const sa={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"};/**
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
 */const na=e=>{for(const r in e)if(r.startsWith("aria-")||r==="role"||r==="title")return!0;return!1};/**
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
 */const ke=(...e)=>e.filter((r,a,i)=>!!r&&r.trim()!==""&&i.indexOf(r)===a).join(" ").trim();var ua=Fe("<svg><!><!></svg>");function ba(e,r){const a=pe(r,["children","$$slots","$$events","$$legacy"]),i=pe(a,["name","color","size","strokeWidth","absoluteStrokeWidth","iconNode"]);Tr(r,!1);let f=z(r,"name",8,void 0),t=z(r,"color",8,"currentColor"),s=z(r,"size",8,24),n=z(r,"strokeWidth",8,2),o=z(r,"absoluteStrokeWidth",8,!1),v=z(r,"iconNode",24,()=>[]);We();var l=ua();Te(l,(g,S,N)=>({...sa,...g,...i,width:s(),height:s(),stroke:t(),"stroke-width":S,class:N}),[()=>na(i)?void 0:{"aria-hidden":"true"},()=>(H(o()),H(n()),H(s()),be(()=>o()?Number(n())*24/Number(s()):n())),()=>(H(ke),H(f()),H(a),be(()=>ke("lucide-icon","lucide",f()?`lucide-${f()}`:"",a.class)))]);var _=kr(l);Fr(_,1,v,Gr,(g,S)=>{var N=Or(()=>Lr(D(S),2));let u=()=>D(N)[0],d=()=>D(N)[1];var w=Ue(),C=Cr(w);Vr(C,u,!0,(p,I)=>{Te(p,()=>({...d()}))}),ve(g,w)});var c=wr(_);qr(c,r,"default",{}),Ir(l),ve(e,l),Nr()}export{ba as I,Q as a,Zr as b,Xr as c,ga as d,Fr as e,ha as f,Jr as g,Yr as h,Gr as i,_a as j,He as k,J as l,Te as m,ia as r,qr as s};
