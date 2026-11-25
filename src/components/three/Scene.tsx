"use client";

import { Suspense, useEffect, type RefObject } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import Backdrop, { bakeSky } from "./Backdrop";
import { currentTheme } from "@/lib/theme";
import TickerDrive from "./TickerDrive";
import { intro } from "@/lib/intro";
import { softwareGL } from "@/lib/gpu";
import { compileInBackground } from "./compile";

// Touch devices get a lighter render budget (they're usually phones with dense screens and small GPUs).
const COARSE = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
// Without a graphics card (drawn in software, gpu.ts) there's no sky canvas at all: every sky frame took over
// a tenth of a second of the CPU, and the page stuttered behind it at any size. The sky is drawn once into
// pictures instead (BakedSky), shown by CSS (.scene in globals.css).
const SOFT = typeof window !== "undefined" && softwareGL();

// The sky draws nothing until its shader is compiled: a frame drawn while it's still compiling makes the
// browser finish the compile on the spot (a freeze of a second or more while the page loads).
let compiled = false;

function Ready({ onReady }: { onReady: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    let alive = true;
    const t0 = performance.now();
    // Compile in the background (compile.ts), then reveal once the first real frame is on screen. (The page
    // shows either way after a few seconds.)
    compileInBackground(gl, scene, camera, 4000).then(() => {
      if (process.env.NODE_ENV !== "production") console.info("[scene] shaders ready in", Math.round(performance.now() - t0), "ms");
      compiled = true;
      requestAnimationFrame(() => requestAnimationFrame(() => alive && onReady()));
    });
    return () => {
      alive = false;
    };
  }, [gl, scene, camera, onReady]);
  return null;
}

// Forwards the global three.js loading progress (models on both canvases) to the loader.
function Progress({ onProgress }: { onProgress: (p: number) => void }) {
  const progress = useProgress((s) => s.progress);
  useEffect(() => onProgress(progress), [progress, onProgress]);
  return null;
}

// The sky as two still pictures (bakeSky, drawn while the loader is up and again when day turns to night): the
// clouds, and over the last screen the hill fading in. Ready once they're drawn (or failed: the plain CSS sky
// stays).
function BakedSky({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".scene");
    if (!el) {
      onReady();
      return;
    }
    let alive = true;
    // Baked at the sky box's own size (drawn 1:1), once per theme (switching back and forth only swaps the
    // pictures), again only when the box really changes size; the newest bake wins, and each picture is
    // decoded before it's shown.
    type Pics = { top: string; end: string };
    let cache: Partial<Record<"light" | "dark", Pics>> = {};
    let size = "";
    let seq = 0;
    let failed = false;
    const free = (p?: Pics) => p && [p.top, p.end].forEach((u) => u && URL.revokeObjectURL(u));
    const decode = (u: string) => (u ? Object.assign(new Image(), { src: u }).decode().catch(() => undefined) : Promise.resolve());
    const show = (p: Pics) => {
      if (p.top) el.style.setProperty("--sky-top", `url(${p.top})`);
      if (p.end) el.style.setProperty("--sky-end", `url(${p.end})`);
    };
    const bake = async () => {
      if (failed) return;
      const theme = currentTheme() === "dark" ? "dark" : "light";
      const w = el.clientWidth, h = el.clientHeight;
      const key = `${w}x${h}`;
      if (key !== size) {
        Object.values(cache).forEach(free);
        cache = {};
        size = key;
      }
      const have = cache[theme];
      if (have) return show(have);
      const gen = ++seq;
      try {
        const p = await bakeSky(w, h, theme === "dark" ? 1 : 0);
        await Promise.all([decode(p.top), decode(p.end)]);
        if (!alive || gen !== seq || size !== key) return free(p);
        cache[theme] = p;
        show(p);
        onScroll(true);
      } catch {
        // (no WebGL at all: the plain CSS sky stays, and it isn't tried again)
        failed = true;
      }
    };
    // (the hill's picture over the last screen; the class only changes when it's crossed)
    let end = false;
    const onScroll = (force?: boolean) => {
      const now = document.documentElement.scrollHeight - window.innerHeight - window.scrollY < window.innerHeight * 0.8;
      if (now === end && force !== true) return;
      end = now;
      el.classList.toggle("is-end", end);
    };
    bake().finally(() => alive && onReady());
    const retheme = () => void bake();
    window.addEventListener("themechange", retheme);
    // (A real resize: the width, or the height by more than a phone's sliding browser bars.)
    let rt = 0;
    let lastW = el.clientWidth, lastH = el.clientHeight;
    const onResize = () => {
      window.clearTimeout(rt);
      rt = window.setTimeout(() => {
        const w = el.clientWidth, h = el.clientHeight;
        if (w === lastW && Math.abs(h - lastH) < lastH * 0.1) return;
        lastW = w;
        lastH = h;
        void bake();
      }, 250);
    };
    window.addEventListener("resize", onResize);
    const scrolled = () => onScroll();
    window.addEventListener("scroll", scrolled, { passive: true });
    return () => {
      alive = false;
      window.clearTimeout(rt);
      window.removeEventListener("themechange", retheme);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", scrolled);
      Object.values(cache).forEach(free);
    };
  }, [onReady]);
  return null;
}

// The sky behind the whole page (Backdrop): one fullscreen shader.
export default function Scene({
  eventSource,
  onReady,
  onProgress,
}: {
  eventSource: RefObject<HTMLElement | null>;
  onReady: () => void;
  onProgress: (p: number) => void;
}) {
  if (SOFT)
    return (
      <>
        <Progress onProgress={onProgress} />
        <BakedSky onReady={onReady} />
      </>
    );
  return (
    <Canvas
      className="scene-canvas"
      eventSource={eventSource as RefObject<HTMLElement>}
      eventPrefix="client"
      frameloop="never"
      // Its size is the layout size, not what's on screen: the intro scales the sky in (1.12 to 1), and
      // measuring it on screen made a scroll during the intro resize the canvas (a half-second GPU stall).
      resize={{ offsetSize: true }}
      flat
      // Soft clouds don't need every device pixel.
      // (Phones a little more than one per CSS pixel: their screens are small and at 0.75 the cloud edges smeared.)
      dpr={COARSE ? [1, 1.25] : 1}
      gl={{ antialias: false, powerPreference: "high-performance" }}
    >
      {/* While the loader is up, only tick a few times a second (compile), then full rate. */}
      <TickerDrive ready={() => compiled} active={() => Number.isFinite(intro.at)} />
      <Progress onProgress={onProgress} />
      <Backdrop />
      <Suspense fallback={null}>
        <Ready onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}
