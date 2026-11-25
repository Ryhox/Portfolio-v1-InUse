"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { theme } from "@/lib/theme";
import { softwareGL } from "@/lib/gpu";

// Where the flight through the clouds is, 0..1, set by the scroll (Motion.tsx): 0 before, 0.5 deep inside the
// cloud bank, 1 out the other side.
export const cloudPass = { target: 0, snap: false };

// The way from About into the work: you fly through a bank of the sky's own clouds. Its sunlit top rises in
// from the bottom of the screen (a hazier, farther layer leads in, slower), it swallows the screen while the
// page swaps behind it and you push on through bright mist. Then the bank's blue-grey underside rises away
// and the gallery is there (its heading rises in once the clouds have cleared it, Motion.tsx). The bank rides with the
// scroll (faster than the page: it's close), so the same scroll always shows the same frame and scrolling
// back flies you back. One small WebGL layer over the page, drawn at a fraction of the screen's resolution
// (clouds are soft) and only while you're in it.

// Where the front bank's edges are (screen heights from the top) at progress p: in from the bottom at about
// 0.05, covering everything from about 0.36 to 0.6, gone off the top by about 0.91.
const FRONT = { at: 1.36, speed: 4.19, height: 2.3 };
const BACK = { at: 1.21, speed: 3.0, height: 1.49 };

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
  uniform float uP;
  uniform float uNight;
  // Phones: one octave of detail less (on a small screen the finest one breaks the billows into specks).
  uniform float uPhone;
  // Each bank's top edge and height (screen heights from the top of the screen).
  uniform vec2 uFront;
  uniform vec2 uBack;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  // Value noise: random values on a square grid, blended. Cheap, and right for a big screen, but its
  // contours follow the grid, so a narrow phone screen (a few big cells across) shows clouds with straight
  // edges, squares and triangles. Phones get gradient noise instead (a random slope at each grid point),
  // whose contours are round; scaled to the same spread, so the sky has as much cloud.
  vec2 slope(vec2 i) {
    // (Each grid point wrapped into a small range first: further down the page the coordinates get big,
    // and some phone GPUs lose the precision the hash needs there.)
    i = mod(i, 289.0);
    return vec2(hash(i), hash(i + vec2(31.7, 17.3))) * 2.0 - 1.0;
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    if (uPhone > 0.5) {
      vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
      float a = dot(slope(i), f);
      float b = dot(slope(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
      float c = dot(slope(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
      float d = dot(slope(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
      return clamp(0.5 + 1.5 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y), 0.0, 1.0);
    }
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
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
    // (The detail left out on phones still adds its average, so there's as much cloud.)
    return s + (uPhone > 0.5 ? a * 0.5 : 0.0);
  }
  // The sky's cumulus (as in Backdrop.tsx): big shapes, billowy detail on top.
  float cloud(vec2 p) {
    float base = fbm(p * 0.55);
    float puff = fbm(p * 1.8 + vec2(base * 1.6, 0.0));
    return base * 0.72 + puff * 0.42;
  }

  // One bank at screen point (x, sy) (sy from the top): colour and coverage. Its edges billow (pushed out
  // where the cloud is thick), lit like the sky's: sunlit tops, blue-grey bellies, bright mist deep inside.
  // k: how much finer the billows are on a tall, narrow (phone) screen, so as many cross it as on a wide one
  // and its edges stay crisp billows instead of a soft band of fog.
  vec4 bank(float x, float sy, vec2 edge, float scale, vec2 seed, float k) {
    float y = sy - edge.x;
    float inside = min(y, edge.y - y);
    if (inside < -0.3) return vec4(0.0);
    vec2 at = vec2(x, y) * scale * k + seed + vec2(uTime * 0.01, 0.0);
    float d = cloud(at);
    float a = smoothstep(0.0, 0.18 / k, inside + (d - 0.5) * 0.42 / sqrt(k));
    if (a <= 0.0) return vec4(0.0);
    float toward = cloud(at + vec2(0.05, -0.12) * k);
    float lit = 0.62 + (d - toward) * 2.6;
    lit = mix(lit, 0.9 + (d - 0.5) * 0.3, smoothstep(0.06, 0.5, inside));
    lit -= smoothstep(0.4, 0.0, edge.y - y) * 0.22;
    lit = clamp(lit, 0.0, 1.0);
    vec3 day = mix(vec3(0.63, 0.71, 0.84), vec3(1.0, 0.995, 0.98), lit);
    vec3 night = mix(vec3(0.045, 0.075, 0.19), vec3(0.24, 0.3, 0.54), lit);
    return vec4(mix(day, night, uNight), a);
  }

  void main() {
    float aspect = uRes.x / uRes.y;
    // A gentle push forward through the middle of it (everything swells a little from the centre).
    float push = 1.0 + smoothstep(0.3, 0.75, uP) * 0.3;
    float x = (vUv.x - 0.5) * aspect / push;
    float sy = (0.5 - vUv.y) / push + 0.5;
    float k = clamp(0.62 / aspect, 1.0, 1.3);

    vec4 front = bank(x, sy, uFront, 1.5, vec2(3.1, 1.7), k);
    vec4 back = vec4(0.0);
    if (front.a < 0.999) {
      // The farther layer: smaller billows, hazier, a little of the sky's blue in it.
      back = bank(x, sy, uBack, 2.2, vec2(8.4, 5.2), k);
      back.rgb = mix(back.rgb, mix(vec3(0.55, 0.72, 0.93), vec3(0.08, 0.13, 0.3), uNight), 0.3);
      back.a *= 0.55;
    }
    float a = front.a + back.a * (1.0 - front.a);
    gl_FragColor = vec4(front.rgb * front.a + back.rgb * back.a * (1.0 - front.a), a);
  }
`;

export default function CloudPass() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvas.current;
    // (without a graphics card there's no flight through the clouds: drawn in software it was all lag, gpu.ts)
    if (!cv || softwareGL()) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl = cv.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false, powerPreference: "high-performance" });
    if (!gl) return;
    // Everything below is set up again if the graphics driver resets (sleep, a driver crash): otherwise the
    // flight would be gone for good.
    const setup = () => {
      // Compiled in the background (KHR_parallel_shader_compile): nothing asks about the shader until the browser
      // says it's done (asking any sooner makes it finish the compile on the spot, a freeze while the page loads).
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
      const parallel = gl.getExtension("KHR_parallel_shader_compile");
      let raf = 0;
      let stop = () => {};
      const begin = () => {
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
          console.warn(gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs), gl.getProgramInfoLog(prog));
          return;
        }
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, "p");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        const u = {
          res: gl.getUniformLocation(prog, "uRes"),
          time: gl.getUniformLocation(prog, "uTime"),
          p: gl.getUniformLocation(prog, "uP"),
          night: gl.getUniformLocation(prog, "uNight"),
          phone: gl.getUniformLocation(prog, "uPhone"),
          front: gl.getUniformLocation(prog, "uFront"),
          back: gl.getUniformLocation(prog, "uBack"),
        };

        // Clouds are soft: half the screen's pixels across is plenty (the browser smooths it up). Phones get a
        // little more (their screens are small, and a third was visibly mushy).
        const coarse = window.matchMedia("(pointer: coarse)").matches;
        // From its own box (the large viewport, CSS), and only when that really changes: phones fire resize for
        // every move of the browser's bars, and resizing a canvas wipes it.
        const resize = () => {
          const k = coarse ? 0.6 : 0.5;
          const w = Math.max(2, Math.round((cv.clientWidth || window.innerWidth) * k));
          const h = Math.max(2, Math.round((cv.clientHeight || window.innerHeight) * k));
          if (w === cv.width && h === cv.height) return;
          cv.width = w;
          cv.height = h;
          gl.viewport(0, 0, w, h);
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(cv);

        let cur = 0;
        let shown = false;
        const t0 = performance.now();
        const tick = (_t: number, deltaMs: number) => {
          const dt = Math.min(deltaMs, 50) / 1000;
          // Follows the scroll with a little give, so a flick still glides through.
          cur += (cloudPass.target - cur) * (1 - Math.exp(-dt * 7));
          if (cloudPass.snap) {
            cloudPass.snap = false;
            cur = cloudPass.target;
          }
          if (Math.abs(cloudPass.target - cur) < 0.0005) cur = cloudPass.target;
          const on = !reduced && cur > 0.004 && cur < 0.996;
          const top = FRONT.at - FRONT.speed * cur;
          if (!on) {
            if (shown) {
              shown = false;
              cv.style.visibility = "hidden";
            }
            return;
          }
          if (!shown) {
            shown = true;
            cv.style.visibility = "visible";
          }
          gl.uniform2f(u.res, cv.width, cv.height);
          gl.uniform1f(u.time, (performance.now() - t0) / 1000);
          gl.uniform1f(u.p, cur);
          gl.uniform1f(u.night, theme.night);
          gl.uniform1f(u.phone, coarse ? 1 : 0);
          gl.uniform2f(u.front, top, FRONT.height);
          gl.uniform2f(u.back, BACK.at - BACK.speed * cur, BACK.height);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        };
        gsap.ticker.add(tick);
        stop = () => {
          gsap.ticker.remove(tick);
          ro.disconnect();
          gl.deleteBuffer(buf);
        };
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
        stop();
        gl.deleteProgram(prog);
      };
    };
    let teardown = setup();
    const lost = (e: Event) => {
      e.preventDefault();
      teardown();
      teardown = () => {};
    };
    const restored = () => (teardown = setup());
    cv.addEventListener("webglcontextlost", lost);
    cv.addEventListener("webglcontextrestored", restored);
    return () => {
      cv.removeEventListener("webglcontextlost", lost);
      cv.removeEventListener("webglcontextrestored", restored);
      // (The context isn't thrown away: a remount gets the same one back from the canvas.)
      teardown();
    };
  }, []);

  return (
    <canvas ref={canvas} className="cloud-pass" aria-hidden />
  );
}
