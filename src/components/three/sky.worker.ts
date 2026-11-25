/// <reference lib="webworker" />
import { fragment, MAX_GLASS, vertex } from "./sky";

// The sky's still pictures (BakedSky.tsx), drawn off the page's main thread. Only used without a graphics
// card, where each picture is computed pixel by pixel on the CPU: on the page that held its main thread for a
// second or more while it loaded; here it costs the page nothing.
//
// Plain WebGL 2, not three.js: one rectangle and the sky's own shader (sky.ts) is all it draws, and three.js
// was 180 KB to download for that. The shader gets exactly what three.js puts around it for the page's sky
// (Backdrop.tsx): GLSL 3, and its sRGB output step in place of the #include, so the pictures come out the same.

export type Shot = { pal: [number, number, number][]; scroll: number; floor: number };
export type ToSkyWorker = { width: number; height: number; night: number; phone: boolean; shots: Shot[] };
export type FromSkyWorker = { blobs: (Blob | null)[] } | { failed: string };

const post = (m: FromSkyWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

const head = (phone: boolean) => `#version 300 es
precision highp float;
precision highp int;
${phone ? "#define PHONE\n" : ""}`;

const vertexSrc = (phone: boolean) => `${head(phone)}
#define attribute in
#define varying out
in vec3 position;
in vec2 uv;
${vertex}`;

// (three.js: sRGBTransferOETF, what <colorspace_fragment> does for an sRGB canvas)
const fragmentSrc = (phone: boolean) => `${head(phone)}
#define varying in
layout(location = 0) out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
vec4 linearToOutputTexel(in vec4 value) {
  return vec4(mix(pow(value.rgb, vec3(0.41666)) * 1.055 - vec3(0.055), value.rgb * 12.92, vec3(lessThanEqual(value.rgb, vec3(0.0031308)))), value.a);
}
${fragment.replace("#include <colorspace_fragment>", "gl_FragColor = linearToOutputTexel(gl_FragColor);")}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
  return s;
}

self.onmessage = async (e: MessageEvent<ToSkyWorker>) => {
  const { width, height, night, phone, shots } = e.data;
  let gl: WebGL2RenderingContext | null = null;
  try {
    const canvas = new OffscreenCanvas(width, height);
    gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: true }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error("no webgl2");
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vertexSrc(phone)));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fragmentSrc(phone)));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link");
    gl.useProgram(prog);

    // The full-screen rectangle, as three.js's PlaneGeometry(2, 2): corners at ±1, uv 0..1 with v up.
    const quad = (name: string, size: number, data: number[]) => {
      const loc = gl!.getAttribLocation(prog, name);
      if (loc < 0) return;
      const buf = gl!.createBuffer();
      gl!.bindBuffer(gl!.ARRAY_BUFFER, buf);
      gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array(data), gl!.STATIC_DRAW);
      gl!.enableVertexAttribArray(loc);
      gl!.vertexAttribPointer(loc, size, gl!.FLOAT, false, 0, 0);
    };
    quad("position", 3, [-1, 1, 0, 1, 1, 0, -1, -1, 0, 1, -1, 0]);
    quad("uv", 2, [0, 1, 1, 1, 0, 0, 1, 0]);

    const u = (name: string) => gl!.getUniformLocation(prog, name);
    gl.uniform1f(u("uTime"), 30);
    gl.uniform1f(u("uNight"), night);
    gl.uniform1f(u("uDense"), 0);
    gl.uniform2f(u("uRes"), width, height);
    gl.uniform4fv(u("uGlass"), new Float32Array(MAX_GLASS * 4));
    gl.uniform1fv(u("uGlassA"), new Float32Array(MAX_GLASS).fill(1));
    gl.uniform1i(u("uGlassN"), 0);
    gl.uniform1i(u("uLoop"), 0);
    gl.uniform4f(u("uGlassBox"), 0, 0, 0, 0);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);

    const blobs: (Blob | null)[] = [];
    for (const s of shots) {
      gl.uniform3fv(u("uTop"), s.pal[0]);
      gl.uniform3fv(u("uMid"), s.pal[1]);
      gl.uniform3fv(u("uLow"), s.pal[2]);
      gl.uniform1f(u("uScroll"), s.scroll);
      gl.uniform1f(u("uFloor"), s.floor);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      blobs.push(await canvas.convertToBlob({ type: "image/webp", quality: 1 }).catch(() => null));
    }
    post({ blobs });
  } catch (err) {
    post({ failed: String(err) });
  } finally {
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  }
};
