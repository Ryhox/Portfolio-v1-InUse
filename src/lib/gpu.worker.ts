/// <reference lib="webworker" />

// Finds out, off the page's main thread, whether WebGL works in a worker and whether it's drawn in software
// (gpu.ts). Starting a WebGL context is cheap on a real graphics card, but in software (SwiftShader) it took
// the page's main thread most of a second: here it costs the page nothing.

export type GpuInfo = { worker: boolean; soft: boolean };

const SOFT = /swiftshader|llvmpipe|lavapipe|softpipe|software|basic render/i;

let info: GpuInfo = { worker: false, soft: false };
try {
  const gl = (new OffscreenCanvas(1, 1).getContext("webgl2") ?? new OffscreenCanvas(1, 1).getContext("webgl")) as WebGLRenderingContext | null;
  if (gl) {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    info = { worker: true, soft: SOFT.test(name) };
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
} catch {
  // (no WebGL in a worker: the page checks for itself, gpu.ts)
}
(self as unknown as DedicatedWorkerGlobalScope).postMessage(info);
