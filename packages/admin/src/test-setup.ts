/**
 * Entorno de pruebas del admin.
 *
 * jsdom no implementa la Web Animations API, y Svelte la usa para
 * `animate:`/`transition:`. Sin este polyfill, montar cualquier componente con
 * una lista animada revienta con `element.animate is not a function` — que no
 * es un fallo del componente sino del entorno, y confundirlos cuesta una tarde.
 */

import "@testing-library/jest-dom/vitest";

if (typeof Element !== "undefined" && !Element.prototype.animate) {
  // Devuelve una animación ya terminada: los tests comprueban el DOM
  // resultante, no los fotogramas intermedios.
  Element.prototype.animate = function animate() {
    return {
      cancel() {},
      finish() {},
      pause() {},
      play() {},
      reverse() {},
      addEventListener() {},
      removeEventListener() {},
      currentTime: 0,
      playState: "finished",
      finished: Promise.resolve(),
      onfinish: null,
    } as unknown as Animation;
  };
}

// jsdom tampoco trae ResizeObserver, que usan varios componentes de layout.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
