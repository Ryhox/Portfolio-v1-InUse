"use client";

import { Suspense, useCallback, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { Brain, type Zone } from "./brain";
import { World } from "./world";
import MascotModel from "./MascotModel";
import styles from "./mascot.module.css";

// One of her, for the whole visit (this module only ever loads in the browser).
const world = new World();
const brain = new Brain(world);
// (In development she can be poked from the console: __mascot.brain / __mascot.world.)
if (process.env.NODE_ENV !== "production") (window as unknown as { __mascot?: unknown }).__mascot = { brain, world };

// The layer she lives in: a transparent canvas over the page that never takes a click, plus invisible hit
// areas that follow her head, body, ears and cloud (so only she catches the pointer, never the empty canvas),
// and her speech balloon (Windows XP style).
export default function MascotStage() {
  const hit = useRef<HTMLDivElement>(null);
  const earL = useRef<HTMLDivElement>(null);
  const earR = useRef<HTMLDivElement>(null);
  const cloud = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const bubbleText = useRef<HTMLSpanElement>(null);
  const zz = useRef<HTMLDivElement>(null);
  const shown = useRef({ seq: -1, on: false, zzAt: 0, noteAt: 0, side: 1 });

  useEffect(() => {
    world.attach();
    brain.voice.start();
    return () => {
      brain.voice.stop();
      world.detach();
    };
  }, []);

  const place = (el: HTMLElement | null, x: number, y: number, w: number, h: number, on = true) => {
    if (!el) return;
    el.style.transform = `translate3d(${(x - w / 2).toFixed(1)}px, ${(y - h / 2).toFixed(1)}px, 0)`;
    el.style.width = `${w.toFixed(0)}px`;
    el.style.height = `${h.toFixed(0)}px`;
    el.style.display = on ? "block" : "none";
  };

  const onFrame = useCallback((b: Brain) => {
    const g = b.geo, o = b.out;
    // hit areas: one box around head and body, one per ear, one for the cloud
    const parts = [g.head, g.body, ...g.feet];
    const x0 = Math.min(...parts.map((p) => p.x - p.r));
    const x1 = Math.max(...parts.map((p) => p.x + p.r));
    const y0 = Math.min(...parts.map((p) => p.y - p.r));
    const y1 = Math.max(...parts.map((p) => p.y + p.r));
    place(hit.current, (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, o.visible);
    g.ears.forEach((e, i) => place(i ? earR.current : earL.current, e.x, e.y, e.r * 2, e.r * 2, o.visible && !o.grabbing));
    const S = b.S;
    place(cloud.current, o.cloud.x, o.cloud.y + 0.5 * S, 3.6 * S, 1.4 * S, !o.grabbing);
    if (hit.current) hit.current.dataset.grab = o.grabbing ? "1" : "";

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
        void bb.offsetWidth;
        bb.classList.add(styles.pop);
      }
      if (on !== s.on) {
        s.on = on;
        bb.classList.toggle(styles.on, on);
      }
      if (on) {
        const w = bb.offsetWidth, h = bb.offsetHeight;
        const W = window.innerWidth;
        let x = g.head.x + g.head.r * 0.3;
        let y = g.head.y - g.head.r * 1.15 - h;
        const below = y < 8;
        if (below) y = g.head.y + g.head.r + 6;
        x = Math.max(8, Math.min(W - w - 8, x - w * 0.3));
        bb.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        bb.dataset.below = below ? "1" : "";
        bb.style.setProperty("--tail", `${Math.max(14, Math.min(w - 20, g.head.x - x)).toFixed(0)}px`);
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
    <div className={styles.layer} aria-hidden>
      <Canvas
        className={styles.canvas}
        orthographic
        camera={{ position: [0, 0, 2000], near: 1, far: 4000, zoom: 1 }}
        dpr={[1, 1.75]}
        flat
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        style={{ pointerEvents: "none" }}
      >
        <hemisphereLight args={["#eef3ff", "#9aaeff", 1.55]} />
        <directionalLight position={[-300, 600, 800]} intensity={1.45} />
        <directionalLight position={[500, 200, 300]} intensity={0.45} color="#cfdcff" />
        <Suspense fallback={null}>
          <MascotModel brain={brain} world={world} onFrame={onFrame} />
        </Suspense>
      </Canvas>
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
