// Whether this browser draws WebGL in software (no usable graphics card: a blocklisted or missing GPU driver,
// a virtual machine, a headless test like PageSpeed). Then every pixel of the 3D layers is computed on the CPU,
// and at full size the page ran at a couple of frames a second; those layers are drawn smaller and less often
// there (Scene.tsx, CloudPass.tsx, the iPod and the mascot). With a real graphics card nothing changes.
//
// Finding out means starting a WebGL context, and in software that alone held the page's main thread for
// most of a second. So it's asked in a worker (gpu.worker.ts) and the answer comes back a moment later:
// `gpuReady()` resolves once it's known; `softwareGL()` and `canDrawInWorker()` are only read after that
// (Experience.tsx mounts the 3D layers once it's in).

import type { GpuInfo } from "./gpu.worker";

const SOFT = /swiftshader|llvmpipe|lavapipe|softpipe|software|basic render/i;

let info: GpuInfo | null = null;
let probe: Promise<GpuInfo> | null = null;

// Where a worker can't use WebGL (Safari before 17), the page asks itself, as before.
function onPage(): GpuInfo {
  let soft = false;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return { worker: false, soft: true };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    soft = SOFT.test(name);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // (can't tell: assume a real graphics card)
  }
  return { worker: false, soft };
}

/** Resolves once it's known whether WebGL is drawn in software (and works in a worker). */
export function gpuReady(): Promise<GpuInfo> {
  if (probe) return probe;
  probe = new Promise<GpuInfo>((resolve) => {
    if (typeof window === "undefined") return resolve({ worker: false, soft: false });
    const done = (i: GpuInfo) => {
      if (info) return;
      info = i;
      resolve(i);
    };
    const canTry = typeof OffscreenCanvas !== "undefined" && typeof Worker !== "undefined" && "transferControlToOffscreen" in HTMLCanvasElement.prototype;
    if (!canTry) return done(onPage());
    let w: Worker | null = null;
    const fallback = () => {
      w?.terminate();
      done(onPage());
    };
    try {
      w = new Worker(new URL("./gpu.worker.ts", import.meta.url), { type: "module" });
    } catch {
      return fallback();
    }
    // (a worker that never answers: the page asks itself)
    const t = window.setTimeout(fallback, 5000);
    w.onmessage = (e: MessageEvent<GpuInfo>) => {
      window.clearTimeout(t);
      w?.terminate();
      // No WebGL in the worker: the page may still have it (and must say whether it's software).
      done(e.data.worker ? e.data : onPage());
    };
    w.onerror = () => {
      window.clearTimeout(t);
      fallback();
    };
  });
  return probe;
}

/** A worker can draw WebGL into a canvas handed over from the page (OffscreenCanvas). Read after gpuReady(). */
export function canDrawInWorker() {
  return info?.worker ?? false;
}

/** WebGL is drawn in software. Read after gpuReady(). */
export function softwareGL() {
  return info?.soft ?? false;
}
