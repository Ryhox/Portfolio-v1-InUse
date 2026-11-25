// Whether this browser draws WebGL in software (no usable graphics card: a blocklisted or missing GPU driver,
// a virtual machine, a headless test like PageSpeed). Then every pixel of the 3D layers is computed on the CPU,
// and at full size the page ran at a couple of frames a second; those layers are drawn smaller and less often
// there (Scene.tsx, CloudPass.tsx, the iPod and the mascot). With a real graphics card nothing changes.

/** A worker can draw WebGL into a canvas handed over from the page (OffscreenCanvas). Tried for real, once:
 *  Safari 16.4 to 16.7 has OffscreenCanvas but no WebGL on it. */
let workerGL: boolean | null = null;
export function canDrawInWorker() {
  if (workerGL !== null) return workerGL;
  workerGL = false;
  if (typeof OffscreenCanvas === "undefined" || typeof HTMLCanvasElement === "undefined" || !("transferControlToOffscreen" in HTMLCanvasElement.prototype)) return workerGL;
  try {
    const gl = new OffscreenCanvas(1, 1).getContext("webgl2") as WebGL2RenderingContext | null;
    workerGL = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // (no WebGL there)
  }
  return workerGL;
}

let soft: boolean | null = null;

export function softwareGL() {
  if (soft !== null) return soft;
  soft = false;
  if (typeof document === "undefined") return soft;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return (soft = true);
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    soft = /swiftshader|llvmpipe|lavapipe|softpipe|software|basic render/i.test(name);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // (can't tell: assume a real graphics card)
  }
  return soft;
}
