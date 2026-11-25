"use client";

import { useEffect } from "react";
import { currentTheme } from "@/lib/theme";
import { canDrawInWorker } from "@/lib/gpu";
import { floorLift } from "@/lib/scroll";
import { PALETTES } from "./palettes";
import type { FromSkyWorker, ToSkyWorker } from "./sky.worker";

// Without a graphics card (drawn in software, gpu.ts) there's no sky canvas at all: every sky frame took over
// a tenth of a second of the CPU, and the page stuttered behind it at any size. The sky is drawn once into two
// pictures instead, shown by CSS (.scene in globals.css). They're drawn in a worker (sky.worker.ts), so this
// module doesn't load three.js on the page at all; only where a worker can't draw WebGL is it drawn on the page
// (Backdrop.tsx, loaded just for that).
async function bakeSky(width: number, height: number, night: number): Promise<{ top: string; end: string }> {
  if (canDrawInWorker()) {
    // At the very bottom of the page the floor sits this far down the screen (see measureSections).
    const contact = document.querySelector(".contact");
    const docH = document.documentElement.scrollHeight;
    const below = contact ? docH - (contact.getBoundingClientRect().bottom + window.scrollY) : 0;
    const shots: ToSkyWorker["shots"] = [
      { pal: PALETTES.hero, scroll: 0, floor: 1e5 },
      { pal: PALETTES.contact, scroll: (docH - height) / height, floor: height - below - floorLift(width) },
    ];
    const msg: ToSkyWorker = { width, height, night, phone: window.matchMedia("(pointer: coarse)").matches, shots };
    const got = await new Promise<FromSkyWorker | null>((resolve) => {
      try {
        const w = new Worker(new URL("./sky.worker.ts", import.meta.url), { type: "module" });
        w.onmessage = (e: MessageEvent<FromSkyWorker>) => {
          w.terminate();
          resolve(e.data);
        };
        w.onerror = () => {
          w.terminate();
          resolve(null);
        };
        w.postMessage(msg);
      } catch {
        resolve(null);
      }
    });
    if (got && "blobs" in got) {
      const [top = "", end = ""] = got.blobs.map((b) => (b ? URL.createObjectURL(b) : ""));
      return { top, end };
    }
    // (the worker couldn't: drawn on the page)
  }
  const { bakeSky: onPage } = await import("./Backdrop");
  return onPage(width, height, night);
}

// The sky as two still pictures (bakeSky, drawn while the loader is up and again when day turns to night): the
// clouds, and over the last screen the hill fading in. Ready once they're drawn (or failed: the plain CSS sky
// stays).
export default function BakedSky({ onReady }: { onReady: () => void }) {
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
