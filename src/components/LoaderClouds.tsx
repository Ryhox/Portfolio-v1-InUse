"use client";

import { useEffect, useRef } from "react";
import { currentTheme } from "@/lib/theme";

// Where the loader's clouds are, set by the loader (Experience.tsx): open, how far they have parted (0..1, with
// the loading); burst, how far the push through them at 100% is (0..1). ready: their first frame is drawn (the
// plain mist under them can go).
export const loaderClouds = { open: 0, burst: 0, ready: false };

// How much finer the billows are on a screen of this shape (width / height), as the flight does it.
export const fineFor = (aspect: number) => Math.min(1.25, Math.max(1, 0.62 / aspect));

// The loader's clouds: the sky's own clouds (the same billowy cumulus, sunlit tops and blue-grey bellies as the
// sky and the flight through the clouds, CloudPass.tsx), four layers of them in front of the name, far to near.
// Each layer is its own field of clouds, drifting its own way. As the page loads they part around the middle,
// the near ones first and furthest, so the name comes out from behind them; at 100% you push forward through
// them (each layer swells past you, the nearest fastest) and they clear into the open sky. One WebGL layer, drawn
// at a fraction of the screen's resolution (clouds are soft), only while the loader is up. Not without a graphics
// card (drawn in software it would be all lag, gpu.ts): there the loader has a plain mist instead (globals.css).

const vertex = `
  attribute vec2 p;
  varying vec2 vUv;
  void main() {
    vUv = p * 0.5 + 0.5;
    gl_Position = vec4(p, 0.0, 1.0);
  }
`;

const fragment = `
  precision highp float;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uOpen;
  uniform float uBurst;
  uniform float uNight;
  uniform float uPhone;
  // How much finer the billows are: more on a tall, narrow screen (as in the flight), so as many cross it as a
  // wide one (fineFor; the still first frame is drawn with its own, scripts/loader-still.mjs).
  uniform float uFine;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  // One grid point's random value. The point is wrapped into a small range first (as the sky's and the
  // flight's are): with the big numbers the finer billows reach, phone GPUs (Android's especially) lose the
  // precision the hash needs, whole runs of points came out the same, and the clouds broke into flat facets
  // with hard, straight edges.
  float cell(vec2 i) {
    return hash(mod(i, 289.0));
  }
  // Value noise (as the sky's on a wide screen). Not the flight's rounder phone noise: it clips flat at its
  // extremes, and with clouds this big that showed as smooth white patches on a phone.
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(cell(i), cell(i + vec2(1.0, 0.0)), f.x), mix(cell(i + vec2(0.0, 1.0)), cell(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      if (i == 4 && uPhone > 0.5) break;
      s += a * noise(p);
      p = mat2(1.6, 1.2, -1.2, 1.6) * p;
      a *= 0.5;
    }
    return s + (uPhone > 0.5 ? a * 0.5 : 0.0);
  }
  // (the billows churn: their detail rolls on over the big shapes, all the time, faster in the push)
  float churn() {
    return uTime * 0.05 + uBurst * 0.9;
  }
  float cloud(vec2 p) {
    float base = fbm(p * 0.55);
    float puff = fbm(p * 1.8 + vec2(base * 1.6 + churn(), churn() * 0.6));
    return base * 0.72 + puff * 0.42;
  }

  // One layer, at screen point c (centred, in screen heights): colour and coverage.
  // k: 0 the farthest .. 1 the nearest. seed: where in the cloud field it is. drift: its own slow wind.
  vec4 layer(vec2 c, float k, vec2 seed, vec2 drift, vec2 off, float aspect) {
    // Pushing forward: every layer swells from the middle as the clouds part, a little; at the burst a lot,
    // the near ones most (they're closest, they rush past).
    // (moving off at once, then faster and faster)
    float zoom = 1.0 + uOpen * (0.06 + 0.18 * k) + uBurst * (0.6 + 2.0 * k) + uBurst * uBurst * uBurst * (2.0 + 9.0 * k);
    vec2 q = c / zoom;
    // Rushing past: stretched outward along their way (speed streaks), the nearer the more.
    vec2 dir = normalize(c + vec2(1e-4));
    q -= dir * dot(q, dir) * uBurst * (0.35 + 0.45 * k);
    // Where this point is on the screen, in screen halves (1 at the middle of each edge), from a spot a little
    // off the middle that's this layer's own (so the layers don't open in line, like a tunnel).
    vec2 n = vec2(q.x / (0.5 * aspect), q.y / 0.5) - off;
    float r = length(n);
    // Parting: the clouds drift outward, away from the name, the near ones further (they're closer), by a
    // share of the screen's own size (a fixed distance smeared them sideways across a narrow phone).
    // (and they keep parting through the push, as they did while loading)
    float parted = uOpen + uBurst * 0.6;
    q -= normalize(n + vec2(1e-4)) * vec2(0.5 * aspect, 0.5) * parted * (0.12 + 0.3 * k) * min(r, 1.0);
    // Bigger billows up close, smaller far off (and finer on a tall, narrow screen: uFine).
    float scale = mix(3.4, 1.9, k) * uFine;
    vec2 at = q * scale + seed + drift * uTime;
    float d = cloud(at);
    // How much cloud: at first every layer is thick with it, the name hidden behind them all (each one still
    // billows and is shaded); as the page loads it thins out, first and most around the name. The near layers
    // thin out first.
    float open = clamp(parted * mix(0.9, 1.15, k), 0.0, 1.2);
    // (the clearing's outline warped by a broad noise of its own, so it's ragged cloud, never a clean curve)
    float rr = r + (fbm(q * 1.4 + seed.yx * 0.7) - 0.5) * 0.9;
    float cover = mix(0.86, 0.42, open) - open * 0.6 * (1.0 - smoothstep(0.1, 1.2, rr));
    cover *= 1.0 - smoothstep(0.7, 1.0, uBurst);
    float lo = 1.0 - cover;
    // (crisper edges up close)
    float a = smoothstep(lo, lo + mix(0.12, 0.08, k), d);
    if (a <= 0.0) return vec4(0.0);
    // Sunlight (as in the sky): how much cloud lies between here and the sun, up and to the right. Measured
    // against the sky's own threshold, not this layer's (where there's a lot of cloud everything would count as
    // deep inside, and every cloud would be a grey belly).
    float shade = max(lo, 0.5);
    float depth = 0.0;
    for (int i = 1; i <= 2; i++) {
      depth += max(0.0, cloud(at + vec2(0.035, 0.1) * float(i)) - shade);
    }
    float lit = exp(-depth * 3.2);
    // (deep inside a thick one a little brighter, so it reads as lit mist rather than a dark hole)
    lit = mix(lit, 0.85 + (d - 0.5) * 0.3, 0.35 * smoothstep(0.15, 0.5, d - lo));
    vec3 day = mix(vec3(0.6, 0.68, 0.8), vec3(1.0, 0.995, 0.98), lit);
    vec3 night = mix(vec3(0.05, 0.08, 0.2), vec3(0.3, 0.36, 0.6), lit);
    vec3 col = mix(day, night, uNight);
    // The far ones take on some of the sky's blue (air in between).
    col = mix(col, mix(vec3(0.5, 0.74, 0.96), vec3(0.06, 0.1, 0.24), uNight), 0.2 * (1.0 - k));
    return vec4(col, a * mix(0.9, 1.0, k));
  }

  void main() {
    float aspect = uRes.x / uRes.y;
    vec2 c = vec2((vUv.x - 0.5) * aspect, vUv.y - 0.5);
    vec3 col = vec3(0.0);
    float a = 0.0;
    // Back to front, each over what's behind it (premultiplied).
    for (int i = 0; i < 4; i++) {
      float k = float(i) / 3.0;
      vec2 seed = vec2(3.1, 1.7) + float(i) * vec2(7.3, 4.9);
      vec2 drift = vec2(mod(float(i), 2.0) < 0.5 ? 0.02 : -0.015, 0.004) * (1.0 + k);
      vec2 off = vec2(sin(float(i) * 2.3 + 0.7), cos(float(i) * 1.7 + 0.3)) * vec2(0.14, 0.12);
      vec4 l = layer(c, k, seed, drift, off, aspect);
      col = l.rgb * l.a + col * (1.0 - l.a);
      a = l.a + a * (1.0 - l.a);
    }
    gl_FragColor = vec4(col, a);
  }
`;

export default function LoaderClouds() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const gl = cv.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false, powerPreference: "high-performance" });
    if (!gl) return;
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const vs = shader(gl.VERTEX_SHADER, vertex);
    const fs = shader(gl.FRAGMENT_SHADER, fragment);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    // (compiled in the background: nothing asks about it until the browser says it's done, CloudPass.tsx)
    const parallel = gl.getExtension("KHR_parallel_shader_compile");
    let raf = 0;
    let buf: WebGLBuffer | null = null;
    const night = currentTheme() === "dark" ? 1 : 0;
    const t0 = performance.now();
    let open = 0;
    let last = t0;
    let shown = false;

    const begin = () => {
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.warn(gl.getShaderInfoLog(fs), gl.getProgramInfoLog(prog));
        loaderClouds.ready = false;
        return;
      }
      gl.useProgram(prog);
      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "p");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const u = {
        res: gl.getUniformLocation(prog, "uRes"),
        time: gl.getUniformLocation(prog, "uTime"),
        open: gl.getUniformLocation(prog, "uOpen"),
        burst: gl.getUniformLocation(prog, "uBurst"),
        night: gl.getUniformLocation(prog, "uNight"),
        phone: gl.getUniformLocation(prog, "uPhone"),
        fine: gl.getUniformLocation(prog, "uFine"),
      };
      const draw = () => {
        // (most of the screen's pixels, not all: the billows stay crisp, the cost stays low; a phone's sharp
        // screen gets about half its own pixels, or the clouds look soft next to the name)
        const k = Math.max(0.7, Math.min(window.devicePixelRatio || 1, 2) * 0.55);
        const w = Math.max(2, Math.round((cv.clientWidth || window.innerWidth) * k));
        const h = Math.max(2, Math.round((cv.clientHeight || window.innerHeight) * k));
        if (w !== cv.width || h !== cv.height) {
          cv.width = w;
          cv.height = h;
          gl.viewport(0, 0, w, h);
        }
        gl.uniform2f(u.res, w, h);
        gl.uniform1f(u.time, (performance.now() - t0) / 1000);
        // (from where the still first frame is, 0, catching up with the loading: no jump when they take over)
        const now = performance.now();
        open += (loaderClouds.open - open) * (1 - Math.exp(-Math.min(0.1, (now - last) / 1000) / 0.45));
        last = now;
        gl.uniform1f(u.open, open);
        gl.uniform1f(u.fine, fineFor(w / h));
        gl.uniform1f(u.burst, loaderClouds.burst);
        gl.uniform1f(u.night, night);
        // (all the detail on phones too: it's a few seconds, and with a level less the clouds went soft)
        gl.uniform1f(u.phone, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (!loaderClouds.ready && !shown) {
          // (shown at once; the still under it goes a frame later, once this one is surely on the screen)
          shown = true;
          cv.classList.add("is-on");
          requestAnimationFrame(() => requestAnimationFrame(() => (loaderClouds.ready = true)));
        }
        // (done once the burst has cleared them all: the graphics memory back)
        if (loaderClouds.burst < 1) raf = requestAnimationFrame(draw);
        else gl.getExtension("WEBGL_lose_context")?.loseContext();
      };
      raf = requestAnimationFrame(draw);
    };
    const wait = () => {
      if (parallel && !gl.getProgramParameter(prog, parallel.COMPLETION_STATUS_KHR)) {
        raf = requestAnimationFrame(wait);
        return;
      }
      begin();
    };
    wait();
    return () => {
      cancelAnimationFrame(raf);
      if (buf) gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      // (the loader is gone for good: its graphics memory back)
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return <canvas ref={canvas} className="loader-clouds" aria-hidden />;
}
