"use client";

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Brain, type Zone } from "./brain";
import { World } from "./world";
import CompileGate from "../three/CompileGate";
import { MODEL } from "./rig";
import { canDrawInWorker, softwareGL } from "@/lib/gpu";
import type { FromWorker, ToWorker } from "./mascot.worker";
import styles from "./mascot.module.css";

// (Only where she can't be drawn in a worker: loaded then, so the page never downloads her twice.)
const MascotModel = lazy(() => import("./MascotModel"));

// Where the browser can draw WebGL in a worker, she's drawn there (mascot.worker.ts): her brain stays on the
// page, posing and rendering her costs the page nothing. Elsewhere (or if the worker fails), on the page.
const canWorker = typeof window !== "undefined" && canDrawInWorker();
// (one pixel per CSS pixel without a graphics card, gpu.ts)
const DPR = () => (softwareGL() ? 1 : Math.min(window.devicePixelRatio || 1, 1.75));

// One of her, for the whole visit (this module only ever loads in the browser).
const world = new World();
const brain = new Brain(world);
// (In development she can be poked from the console: __mascot.brain / __mascot.world.)
if (process.env.NODE_ENV !== "production") (window as unknown as { __mascot?: unknown }).__mascot = { brain, world };

// The layer she lives in: a transparent canvas over the page that never takes a click, plus invisible hit
// areas that follow her head, body, ears and cloud (so only she catches the pointer, never the empty canvas),
// and her speech balloon (Windows XP style).
export default function MascotStage({ active }: { active: boolean }) {
  const hit = useRef<HTMLDivElement>(null);
  const earL = useRef<HTMLDivElement>(null);
  const earR = useRef<HTMLDivElement>(null);
  const cloud = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const bubbleText = useRef<HTMLSpanElement>(null);
  const zz = useRef<HTMLDivElement>(null);
  const shown = useRef({ seq: -1, on: false, zzAt: 0, noteAt: 0, side: 1, bw: 0, bh: 0, hitAt: -1, hitOn: true, tf: "", tail: "" });
  // She's mounted while the loader is still up, out of sight, so her shaders get compiled (and drawn once)
  // then (CompileGate). She only comes to life (sees the page, moves, talks, gets drawn every frame) once
  // she's active, just after the intro.
  const [compiled, setCompiled] = useState(false);
  const onCompiled = useCallback(() => setCompiled(true), []);
  const [inWorker, setInWorker] = useState(canWorker);
  const canvas = useRef<HTMLCanvasElement>(null);
  const worker = useRef<Worker | null>(null);

  useEffect(() => {
    if (!active) return;
    world.attach();
    brain.start();
    brain.voice.start();
    return () => {
      brain.voice.stop();
      world.detach();
    };
  }, [active]);

  // (Only written when they change: every style written makes the browser redo its layers that frame.)
  const place = (el: HTMLElement | null, x: number, y: number, w: number, h: number, on = true) => {
    if (!el) return;
    const tf = `translate3d(${Math.round(x - w / 2)}px, ${Math.round(y - h / 2)}px, 0)`;
    const ww = `${Math.round(w)}px`, hh = `${Math.round(h)}px`, d = on ? "block" : "none";
    if (el.style.transform !== tf) el.style.transform = tf;
    if (el.style.width !== ww) el.style.width = ww;
    if (el.style.height !== hh) el.style.height = hh;
    if (el.style.display !== d) el.style.display = d;
  };

  const onFrame = useCallback((b: Brain) => {
    const g = b.geo, o = b.out;
    // Hit areas: one box around head and body, one per ear, one for the cloud. Invisible, so only kept up to
    // date while the pointer is anywhere near her (or, on touch screens, a few times a second): writing their
    // styles every frame made the browser redo all its layers, every frame.
    // (Ten times a second is plenty for boxes nobody sees; away from the pointer they're taken away, so none is
    // left behind where she was.)
    const p = world.pointer;
    const nowS = performance.now() / 1000;
    const sh = shown.current;
    const near = world.coarse || (p.inside && Math.hypot(p.x - g.head.x, p.y - g.head.y) < 420);
    if (!near && sh.hitOn) {
      sh.hitOn = false;
      [hit.current, earL.current, earR.current, cloud.current].forEach((el) => place(el, 0, 0, 0, 0, false));
    }
    if (near && nowS - sh.hitAt > (world.coarse ? 0.15 : 0.1)) {
    sh.hitAt = nowS;
    sh.hitOn = true;
    const parts = [g.head, g.body, ...g.feet];
    const x0 = Math.min(...parts.map((p) => p.x - p.r));
    const x1 = Math.max(...parts.map((p) => p.x + p.r));
    const y0 = Math.min(...parts.map((p) => p.y - p.r));
    const y1 = Math.max(...parts.map((p) => p.y + p.r));
    place(hit.current, (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, o.visible);
    g.ears.forEach((e, i) => place(i ? earR.current : earL.current, e.x, e.y, e.r * 2, e.r * 2, o.visible));
    const S = b.S;
      place(cloud.current, o.cloud.x, o.cloud.y + 0.5 * S, 3.6 * S, 1.4 * S);
    }

    // the speech balloon, above her head (kept on screen)
    const bb = bubble.current, s = shown.current;
    const now = performance.now() / 1000;
    const t = b.t;
    const on = o.bubble.text !== "" && t < o.bubble.until;
    if (bb && bubbleText.current) {
      if (o.bubble.seq !== s.seq) {
        s.seq = o.bubble.seq;
        bubbleText.current.textContent = o.bubble.text;
        bb.classList.remove(styles.pop);
        // (its size, measured once per line: not every frame, which made the browser lay the page out again)
        s.bw = bb.offsetWidth;
        s.bh = bb.offsetHeight;
        bb.classList.add(styles.pop);
      }
      if (on !== s.on) {
        s.on = on;
        bb.classList.toggle(styles.on, on);
      }
      if (on) {
        const w = s.bw, h = s.bh;
        // (the visible width, without the scrollbar: as World measured it)
        const W = world.W;
        // it opens toward the middle of the screen (she lives on the right: mostly to her left)
        const left = g.head.x > W / 2;
        let x = left ? g.head.x - g.head.r * 0.3 - w * 0.7 : g.head.x + g.head.r * 0.3 - w * 0.3;
        let y = g.head.y - g.head.r * 1.15 - h;
        // No room above her head (floating over the projects, right under the top of the screen): beside her
        // head instead (on the side toward the middle of the screen), never down over the page.
        const below = false;
        if (y < 8) {
          x = left ? g.head.x - g.head.r * 0.9 - w : g.head.x + g.head.r * 0.9;
          y = Math.max(8, g.head.y - h * 0.5 - g.head.r * 0.4);
        }
        x = Math.max(12, Math.min(W - w - 12, x));
        // (written only when it moves a whole pixel)
        const tf = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
        if (tf !== s.tf) bb.style.transform = s.tf = tf;
        const bl = below ? "1" : "";
        if (bb.dataset.below !== bl) bb.dataset.below = bl;
        const tail = `${Math.max(14, Math.min(w - 20, g.head.x - x)).toFixed(0)}px`;
        if (tail !== s.tail) bb.style.setProperty("--tail", (s.tail = tail));
      }
    }
    // sleepy z's floating up from her head
    const z = zz.current;
    if (z && o.zz && now - s.zzAt > 1.1) {
      s.zzAt = now;
      const el = document.createElement("span");
      el.textContent = Math.random() < 0.5 ? "z" : "Z";
      el.className = styles.z;
      el.style.left = `${(g.head.x + g.head.r * 0.6).toFixed(0)}px`;
      el.style.top = `${(g.head.y - g.head.r * 0.7).toFixed(0)}px`;
      z.appendChild(el);
      window.setTimeout(() => el.remove(), 2600);
    }
    // music notes, while the iPod plays (same idea as the z's: they float up from her head and sway)
    if (z && o.notes && now - s.noteAt > 0.7 + Math.random() * 0.5) {
      s.noteAt = now;
      s.side = -s.side;
      const el = document.createElement("span");
      el.textContent = ["♪", "♫", "♬", "♩"][Math.floor(Math.random() * 4)];
      el.className = styles.note;
      el.style.left = `${(g.head.x + s.side * g.head.r * (0.5 + Math.random() * 0.4)).toFixed(0)}px`;
      el.style.top = `${(g.head.y - g.head.r * 0.8).toFixed(0)}px`;
      el.style.setProperty("--dx", `${(s.side * (14 + Math.random() * 22)).toFixed(0)}px`);
      el.style.setProperty("--rot", `${(s.side * (8 + Math.random() * 14)).toFixed(0)}deg`);
      z.appendChild(el);
      window.setTimeout(() => el.remove(), 2400);
    }
  }, []);

  // ---- drawn in a worker: hand it the canvas, get her loaded and compiled (while the loader is still up)
  useEffect(() => {
    const cv = canvas.current;
    if (!inWorker || !cv) return;
    let w: Worker;
    try {
      w = new Worker(new URL("./mascot.worker.ts", import.meta.url), { type: "module" });
      const off = cv.transferControlToOffscreen();
      const init: ToWorker = { type: "init", canvas: off, width: cv.clientWidth, height: cv.clientHeight, dpr: DPR(), url: new URL(MODEL, location.href).href };
      w.postMessage(init, [off]);
    } catch {
      window.setTimeout(() => setInWorker(false), 0);
      return;
    }
    worker.current = w;
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type === "loaded") brain.durations = m.durations;
      else if (m.type === "ready") setCompiled(true);
      else if (m.type === "geo") {
        brain.geo = m.geo;
        inFlight.current = false;
      } else if (m.type === "failed") setInWorker(false);
    };
    w.onerror = () => setInWorker(false);
    const resize = () => {
      const msg: ToWorker = { type: "size", width: cv.clientWidth, height: cv.clientHeight, dpr: DPR() };
      w.postMessage(msg);
    };
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      w.terminate();
      worker.current = null;
    };
  }, [inWorker]);

  // ...and once she's alive, every frame: her brain decides here, the worker poses and draws her. (One frame
  // at a time: if the worker is still busy, the time adds up for the next one instead of piling up.)
  const inFlight = useRef(false);
  useEffect(() => {
    const cv = canvas.current;
    if (!inWorker || !compiled || !active || !cv) return;
    let raf = 0;
    let last = performance.now();
    let owed = 0;
    let frames = 0;
    const soft = softwareGL();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      world.update(dt);
      brain.update(dt);
      owed += dt;
      const w = worker.current;
      // (without a graphics card she's drawn on every other frame: gpu.ts)
      const skip = soft && (frames++ & 1) === 1;
      if (w && !inFlight.current && !skip) {
        inFlight.current = true;
        const msg: ToWorker = {
          type: "frame",
          dt: Math.min(owed, 1 / 20),
          // (the canvas fills the window: World's size, not a layout read every frame)
          in: { out: brain.out, S: brain.S, W: world.W, H: world.H, night: world.night },
        };
        owed = 0;
        w.postMessage(msg);
      }
      onFrame(brain);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [inWorker, compiled, active, onFrame]);

  // pointer on her: press / drag / release, petting (moving over her head without pressing)
  const zoneAt = (x: number, y: number, fallback: Zone): Zone => {
    const g = brain.geo;
    if (fallback === "ear" || fallback === "cloud") return fallback;
    if (g.feet.some((f) => Math.hypot(x - f.x, y - f.y) < f.r * 1.15)) return "feet";
    if (Math.hypot(x - g.head.x, y - g.head.y) < g.head.r) return "head";
    return "body";
  };
  const handlers = (zone: Zone) => ({
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      brain.pointerDown(e.clientX, e.clientY, zoneAt(e.clientX, e.clientY, zone));
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.buttons && zone !== "cloud") brain.hover(e.clientX, e.clientY);
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      brain.pointerUp(e.clientX, e.clientY);
    },
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => brain.pointerUp(e.clientX, e.clientY),
    onDoubleClick: () => zone !== "cloud" && brain.doubleClick(),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      brain.contextMenu();
    },
  });

  return (
    <div className={styles.layer} style={active ? undefined : { visibility: "hidden" }} aria-hidden>
      {inWorker ? (
        <canvas key="worker" ref={canvas} className={styles.canvas} style={{ width: "100%", height: "100%", pointerEvents: "none" }} />
      ) : (
      <Canvas
        key="page"
        className={styles.canvas}
        orthographic
        frameloop={compiled && active ? "always" : "never"}
        camera={{ position: [0, 0, 2000], near: 1, far: 4000, zoom: 1 }}
        dpr={softwareGL() ? 1 : [1, 1.75]}
        flat
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        style={{ pointerEvents: "none" }}
      >
        <hemisphereLight args={["#eef3ff", "#9aaeff", 1.55]} />
        <directionalLight position={[-300, 600, 800]} intensity={1.45} />
        <directionalLight position={[500, 200, 300]} intensity={0.45} color="#cfdcff" />
        <Suspense fallback={null}>
          <MascotModel brain={brain} world={world} onFrame={onFrame} />
          <CompileGate onDone={onCompiled} warm />
        </Suspense>
      </Canvas>
      )}
      <div ref={cloud} className={styles.hit} data-mascot="" {...handlers("cloud")} />
      <div ref={hit} className={styles.hit} data-mascot="" {...handlers("head")} />
      <div ref={earL} className={styles.hit} data-mascot="" {...handlers("ear")} />
      <div ref={earR} className={styles.hit} data-mascot="" {...handlers("ear")} />
      <div ref={bubble} className={styles.bubble}>
        <span ref={bubbleText} />
      </div>
      <div ref={zz} className={styles.zz} />
    </div>
  );
}
