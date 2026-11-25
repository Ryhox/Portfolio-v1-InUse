"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { measureSections, scroll } from "@/lib/scroll";
import { Cull } from "@/lib/cull";

gsap.registerPlugin(ScrollTrigger);

export let lenis: Lenis | null = null;

export default function SmoothScroll() {
  useEffect(() => {
    history.scrollRestoration = "manual";
    window.scrollTo(0, 0);

    // Snappier catch-up and shorter wheel steps: still silky, but a flick doesn't coast past whole sections.
    // In the work gallery (while it's pinned and sliding sideways) a sideways swipe on a trackpad, or
    // Shift + wheel, moves it too: the sideways amount becomes the scroll. Nothing to see for it (no
    // horizontal scrollbar); everywhere else sideways gestures are left alone.
    // (Smooth for everyone, also with reduced motion: with the system's "animation effects" off the browser's own
    // wheel scrolling jumps a whole step at a time, which read as choppy. What reduced motion turns off is the
    // page moving by itself: the snapping, Motion.tsx.)
    const instance = new Lenis({
      // (Lenis would otherwise drop its smoothing itself under reduced motion)
      respectReducedMotion: false,
      lerp: 0.12,
      wheelMultiplier: 0.8,
      virtualScroll: (data) => {
        if (!data.event.type.includes("wheel") || Math.abs(data.deltaX) <= Math.abs(data.deltaY)) return true;
        if (!ScrollTrigger.getById("work-slide")?.isActive) return true;
        data.deltaY = data.deltaX;
        data.deltaX = 0;
        return true;
      },
    });
    lenis = instance;

    // ---------- While it scrolls, a clear pane over the page ----------
    // With the page moving under a still mouse the browser works out what's under the pointer every frame (for
    // hover) and for every wheel event: through the gallery's videos and clipped pictures that was a fifth of a
    // frame on a slow PC. A clear pane on top (globals.css) answers at once. It's only there while the page
    // scrolls under a still mouse, and gone the moment the mouse really moves, so hover and clicks work as
    // before. (Mouse and trackpad only: touch screens don't hover.)
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const shield = document.createElement("div");
    shield.className = "scroll-shield";
    shield.setAttribute("aria-hidden", "true");
    document.body.appendChild(shield);
    let shieldOn = false;
    let shieldT = 0;
    let shieldAt = 0;
    let movedAt = -1e9;
    let px = -1;
    let py = -1;
    const shieldOff = () => {
      window.clearTimeout(shieldT);
      shieldT = 0;
      if (!shieldOn) return;
      shieldOn = false;
      shield.classList.remove("is-on");
    };
    const shieldUp = () => {
      if (!fine || held || performance.now() - movedAt < 300) return;
      if (!shieldOn) {
        shieldOn = true;
        shield.classList.add("is-on");
      }
      // (gone 150 ms after the scrolling stops: one timer, re-armed only when it goes off)
      shieldAt = performance.now();
      if (!shieldT) shieldT = window.setTimeout(shieldWake, 150);
    };
    const shieldWake = () => {
      shieldT = 0;
      const left = 150 - (performance.now() - shieldAt);
      if (left > 0) shieldT = window.setTimeout(shieldWake, left);
      else shieldOff();
    };
    // (a real move: the browser also sends moves on the spot when what's under the pointer changes)
    const onMove = (e: PointerEvent) => {
      if (e.clientX === px && e.clientY === py) return;
      px = e.clientX;
      py = e.clientY;
      movedAt = performance.now();
      shieldOff();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    // A press on the pane (the page still gliding under a still mouse) goes to what's under it: the pane steps
    // aside, the press is handed on, and the click that follows lands there too (it'd otherwise go to the
    // page as a whole, and a link or button pressed right after scrolling did nothing).
    let under: Element | null = null;
    let held = false;
    const onShieldDown = (e: PointerEvent) => {
      shieldOff();
      movedAt = performance.now();
      under = document.elementFromPoint(e.clientX, e.clientY);
      under?.dispatchEvent(new PointerEvent("pointerdown", e));
      under?.dispatchEvent(new MouseEvent("mousedown", e));
    };
    const onClickThrough = (e: MouseEvent) => {
      const t = under;
      under = null;
      if (!t || t.contains(e.target as Node)) return;
      e.stopPropagation();
      e.preventDefault();
      (t.closest("a, button, label, summary, [role=button], [tabindex]") as HTMLElement | null)?.click();
    };
    // (not while a button is held: a drag or a text selection with the wheel)
    const onDown = () => (held = true);
    const onUp = () => (held = false);
    shield.addEventListener("pointerdown", onShieldDown);
    window.addEventListener("click", onClickThrough, true);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);

    // (Written only when it moves a whole pixel. Not a CSS scroll-driven animation: with the scroll moved from
    // script every frame, those made the browser work out the page's styles twice a frame.)
    const fill = document.querySelector<HTMLElement>(".progress-fill");
    let fillAt = "";
    const cue = document.querySelector<HTMLElement>(".scroll-cue");
    let cueAt = "";

    // ---------- Resizing: live, and you stay where you were ----------
    // Where you are is kept as a place in the page (which section, how far into it), not as pixels: when
    // the window changes size the gallery's pinned stretch changes length (and crossing the phone breakpoint
    // rebuilds every animation, during which ScrollTrigger measures from the top and used to leave you
    // there). After every re-measure the page goes straight back to that same place.
    type Box = { top: number; h: number };
    let boxes: Box[] = [];
    // The page's blocks (the long about section in its three parts: each switch re-styles all that's inside),
    // not drawn while they're more than half a screen away and the page is scrolling (cull.ts).
    const cull = new Cull();
    let parts: Box[] = [];
    let blocks: HTMLElement[] = [];
    const boxOf = (el: HTMLElement) => ({ top: el.getBoundingClientRect().top + window.scrollY, h: Math.max(1, el.offsetHeight) });
    // (and measured again whenever one of them changes size, so none is ever skipped while it's on screen)
    const sized = new ResizeObserver(() => {
      parts = blocks.map(boxOf);
      cull.update(isOffAt(instance.scroll));
    });
    const isOffAt = (y: number) => {
      const vh = window.innerHeight;
      return (i: number) => !!parts[i] && (parts[i].top + parts[i].h < y - vh * 0.5 || parts[i].top > y + vh * 1.5);
    };
    const layout = () => {
      const els = Array.from(document.querySelectorAll<HTMLElement>("[data-section]")).map(
        (el) => (el.parentElement?.classList.contains("pin-spacer") ? el.parentElement : el) as HTMLElement,
      );
      boxes = els.map(boxOf);
      blocks = Array.from(document.querySelectorAll<HTMLElement>("main > *")).flatMap((el) =>
        el.classList.contains("about") ? (Array.from(el.children) as HTMLElement[]) : [el],
      );
      cull.set(blocks);
      parts = blocks.map(boxOf);
      sized.disconnect();
      blocks.forEach((b) => sized.observe(b));
    };
    const toPlace = (y: number) => {
      let i = 0;
      while (i + 1 < boxes.length && boxes[i + 1].top <= y) i++;
      const b = boxes[i];
      return b ? { i, f: (y - b.top) / b.h } : null;
    };
    let place: { i: number; f: number } | null = null;
    // While a resize is under way the place stays as it was before it (the scroll jumps around meanwhile).
    let holding = false;
    let lastW = window.innerWidth;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let liveAt = 0;
    let liveRaf = 0;
    const onResize = () => {
      // Phones resize for every move of the browser's bars: only a change of width is a real resize there.
      if (coarse && window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      holding = true;
      // Re-measure while the window is being dragged (a few times a second), not only once it's let go.
      if (liveRaf) return;
      liveRaf = requestAnimationFrame(() => {
        liveRaf = 0;
        const now = performance.now();
        if (now - liveAt < 110) return;
        liveAt = now;
        ScrollTrigger.refresh();
      });
    };
    window.addEventListener("resize", onResize);

    instance.on("scroll", (l: Lenis) => {
      if (!holding) place = toPlace(l.scroll);
      scroll.y = l.scroll;
      scroll.velocity = l.velocity;
      // Read before anything below writes a style: ScrollTrigger reads the scroll position, and after a style
      // write that read makes the browser recalculate the page's styles on the spot.
      ScrollTrigger.update();
      shieldUp();
      cull.update(isOffAt(l.scroll));
      const p = Math.min(1, Math.max(0, l.progress || 0));
      const fx = `translateX(${Math.round((p - 1) * window.innerWidth)}px)`;
      if (fill && fx !== fillAt) fill.style.transform = fillAt = fx;
      // The scroll cue fades over the first bit of scrolling. Set on the cue only (on <html> it re-styled the
      // whole page every frame), and only when it changes; once it's gone its loops stop too.
      const gone = Math.min(1, l.scroll / (window.innerHeight * 0.15)).toFixed(2);
      if (cue && gone !== cueAt) {
        cueAt = gone;
        cue.style.setProperty("--scrolled", gone);
        cue.classList.toggle("is-gone", gone === "1.00");
      }
    });

    // One clock for Lenis + GSAP so pinned/scrubbed animations never drift from the scroll. First in the
    // frame (before GSAP renders its tweens): ScrollTrigger reads the scroll position right here, and read
    // after the tweens have written their styles that read forces a full style + layout pass every frame.
    const tick = (time: number) => instance.raf(time * 1000);
    gsap.ticker.add(tick, false, true);
    gsap.ticker.lagSmoothing(0);

    // In-page links: pinned sections report their pinned position, so resolve the start of their pin.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href")!.slice(1);
      const el = id ? document.getElementById(id) : null;
      if (!id && a.getAttribute("href") !== "#") return;
      e.preventDefault();
      if (!el || id === "top") return instance.scrollTo(0, { duration: 1.6 });
      const pin = ScrollTrigger.getAll().find((st) => st.pin === el || st.trigger === el);
      const target = pin ? pin.start : el.getBoundingClientRect().top + window.scrollY;
      instance.scrollTo(target, { duration: 1.6 });
    };
    document.addEventListener("click", onClick);

    const onRefresh = () => {
      layout();
      if (holding && place && boxes[place.i]) {
        const b = boxes[place.i];
        instance.resize();
        instance.scrollTo(Math.max(0, Math.min(instance.limit, b.top + place.f * b.h)), { immediate: true, force: true });
        ScrollTrigger.update();
        // Let go once the resizing has stopped (the last re-measure has run).
        requestAnimationFrame(() => (holding = !!liveRaf));
      }
      measureSections();
    };
    ScrollTrigger.addEventListener("refresh", onRefresh);
    layout();
    measureSections();

    return () => {
      gsap.ticker.remove(tick);
      document.removeEventListener("click", onClick);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(liveRaf);
      ScrollTrigger.removeEventListener("refresh", onRefresh);
      instance.destroy();
      sized.disconnect();
      cull.dispose();
      window.removeEventListener("pointermove", onMove);
      shield.removeEventListener("pointerdown", onShieldDown);
      window.removeEventListener("click", onClickThrough, true);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      shieldOff();
      shield.remove();
      lenis = null;
    };
  }, []);

  return null;
}
