

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export const universal = {
  "ssr": false,
  "prerender": false
};
export const universal_id = "src/routes/+layout.ts";
export const imports = ["_app/immutable/nodes/0.IihMKjqB.js","_app/immutable/chunks/C-6n7b0Y.js","_app/immutable/chunks/Bm0TaU-Y.js","_app/immutable/chunks/CwQiR1ah.js","_app/immutable/chunks/RHSDymrL.js","_app/immutable/chunks/IuiPc1mh.js","_app/immutable/chunks/C0VBvGkr.js","_app/immutable/chunks/QRZHqxvK.js","_app/immutable/chunks/X4sUii19.js","_app/immutable/chunks/CKNZf63S.js","_app/immutable/chunks/BL97dVxi.js","_app/immutable/chunks/DyIE8UIn.js","_app/immutable/chunks/CQr59hUh.js","_app/immutable/chunks/Cr_PjA-T.js","_app/immutable/chunks/YUAmgTZv.js","_app/immutable/chunks/CvXqV1BZ.js","_app/immutable/chunks/CZP-Ru6N.js","_app/immutable/chunks/Bhr7e5nl.js","_app/immutable/chunks/CRXmZs2P.js","_app/immutable/chunks/BDG74Ad3.js","_app/immutable/chunks/DPv59IMb.js","_app/immutable/chunks/CROCV8Ue.js","_app/immutable/chunks/CBIgpbnC.js"];
export const stylesheets = ["_app/immutable/assets/0.Bdny0Tjp.css"];
export const fonts = [];
