import { theme } from "@/lib/theme";
import { player } from "../ipod/player";

// What she can perceive: the screen, the pointer, the scroll, the page's elements she can sit on, and the
// things happening on the page (music, day / night, text being selected or copied, keys, the tab going
// away). Read every frame by the brain; no React in here.

export type Perch = { el: Element; left: number; right: number; top: number; bottom: number };

export type WorldEvent =
  | { type: "select"; x: number; y: number }
  | { type: "copy" }
  | { type: "key" }
  | { type: "konami" }
  | { type: "theme"; night: boolean }
  | { type: "hidden"; hidden: boolean; away: number }
  | { type: "resize" }
  | { type: "section"; name: string }
  | { type: "music"; on: boolean }
  | { type: "click"; x: number; y: number }
  | { type: "link"; x: number; y: number; media: boolean };

// Things worth sitting on: headings, text blocks, cards, buttons, the footer. (Anything can opt in with
// data-mascot-perch.)
const PERCH_SEL = [
  ".hero-title",
  ".statement",
  ".about-note",
  ".quote",
  ".skills-heading",
  ".st-row",
  ".work-heading",
  ".panel-media",
  ".panel-more",
  ".sayhi",
  ".contact-links",
  ".footer",
  "[data-mascot-perch]",
].join(",");

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

export class World {
  W = 1;
  H = 1;
  coarse = false;
  reduced = false;
  now = 0;
  pointer = { x: -1e4, y: -1e4, vx: 0, vy: 0, moved: -1e4, inside: false };
  scrollY = 0;
  scrollV = 0;
  perches: Perch[] = [];
  events: WorldEvent[] = [];
  music = false;
  night = 0;
  hidden = false;
  /** Last time the visitor did anything at all (seconds). */
  input = 0;
  private offs: (() => void)[] = [];
  private scanAt = 0;
  private lastScroll = 0;
  private konami = 0;
  private hiddenAt = 0;

  attach() {
    this.now = performance.now() / 1000;
    this.input = this.now;
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.scrollY = this.lastScroll = window.scrollY;
    this.music = player.playing;
    const on = <K extends keyof WindowEventMap>(t: K, f: (e: WindowEventMap[K]) => void, o?: AddEventListenerOptions) => {
      window.addEventListener(t, f, o);
      this.offs.push(() => window.removeEventListener(t, f, o));
    };
    const onDoc = <K extends keyof DocumentEventMap>(t: K, f: (e: DocumentEventMap[K]) => void, o?: AddEventListenerOptions) => {
      document.addEventListener(t, f, o);
      this.offs.push(() => document.removeEventListener(t, f, o));
    };
    let px = 0, py = 0, pt = 0;
    on("pointermove", (e) => {
      const t = performance.now() / 1000;
      const dt = Math.max(1 / 240, t - pt);
      if (pt) {
        this.pointer.vx = this.pointer.vx * 0.6 + ((e.clientX - px) / dt) * 0.4;
        this.pointer.vy = this.pointer.vy * 0.6 + ((e.clientY - py) / dt) * 0.4;
      }
      px = e.clientX;
      py = e.clientY;
      pt = t;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.moved = t;
      this.pointer.inside = true;
      this.input = t;
    }, { passive: true });
    onDoc("pointerleave", () => (this.pointer.inside = false));
    on("pointerdown", (e) => {
      this.input = performance.now() / 1000;
      this.events.push({ type: "click", x: e.clientX, y: e.clientY });
    }, { passive: true });
    on("wheel", () => (this.input = performance.now() / 1000), { passive: true });
    on("touchstart", () => (this.input = performance.now() / 1000), { passive: true });
    on("resize", () => {
      // (phones resize the page whenever their browser bars slide; only a change of width is a real resize)
      const wide = Math.abs(window.innerWidth - this.W) > 30;
      this.W = window.innerWidth;
      this.H = window.innerHeight;
      if (wide) this.events.push({ type: "resize" });
    });
    on("keydown", (e) => {
      this.input = performance.now() / 1000;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.konami = k === KONAMI[this.konami] ? this.konami + 1 : k === KONAMI[0] ? 1 : 0;
      if (this.konami === KONAMI.length) {
        this.konami = 0;
        this.events.push({ type: "konami" });
      }
      const typing = (e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]");
      if (!typing && e.key.length === 1 && !e.metaKey && !e.ctrlKey) this.events.push({ type: "key" });
    });
    onDoc("copy", () => this.events.push({ type: "copy" }));
    let selT = 0;
    onDoc("selectionchange", () => {
      window.clearTimeout(selT);
      selT = window.setTimeout(() => {
        const s = document.getSelection();
        if (!s || s.isCollapsed || s.toString().trim().length < 4 || !s.rangeCount) return;
        const r = s.getRangeAt(0).getBoundingClientRect();
        if (r.width) this.events.push({ type: "select", x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }, 350);
    });
    onDoc("visibilitychange", () => {
      const t = performance.now() / 1000;
      this.hidden = document.hidden;
      if (document.hidden) this.hiddenAt = t;
      this.events.push({ type: "hidden", hidden: document.hidden, away: document.hidden ? 0 : t - this.hiddenAt });
    });
    const onTheme = (e: Event) => this.events.push({ type: "theme", night: (e as CustomEvent).detail === "dark" });
    window.addEventListener("themechange", onTheme);
    this.offs.push(() => window.removeEventListener("themechange", onTheme));
    on("contextmenu", () => undefined);
    // Links, buttons and project pictures: she looks at what you're pointing at.
    onDoc("pointerover", (e) => {
      const el = e.target as HTMLElement | null;
      const a = el?.closest?.("a, button, .panel-media, img, video, [data-mascot-look]");
      if (!a || (a as HTMLElement).dataset.mascot !== undefined || a.closest("[data-mascot]")) return;
      const r = a.getBoundingClientRect();
      const media = !!a.closest(".panel-media, .panel, img, video");
      this.events.push({ type: "link", x: r.left + r.width / 2, y: r.top + r.height / 2, media });
    }, { passive: true });
    // Which part of the page fills the middle of the screen.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) this.events.push({ type: "section", name: (e.target as HTMLElement).dataset.section || "" });
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    document.querySelectorAll("[data-section]").forEach((el) => io.observe(el));
    this.offs.push(() => io.disconnect());
    this.scan();
  }

  detach() {
    this.offs.forEach((f) => f());
    this.offs = [];
  }

  private scan() {
    const out: Perch[] = [];
    const H = this.H;
    document.querySelectorAll(PERCH_SEL).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 90 || r.height < 12) return;
      if (r.bottom < -H || r.top > 2 * H || r.right < 0 || r.left > this.W) return;
      out.push({ el, left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    });
    this.perches = out;
  }

  update(dt: number) {
    this.now = performance.now() / 1000;
    const y = window.scrollY;
    const v = (y - this.lastScroll) / Math.max(dt, 1 / 240);
    this.scrollV = this.scrollV * 0.8 + v * 0.2;
    this.lastScroll = this.scrollY = y;
    if (this.now - this.scanAt > 0.35) {
      this.scanAt = this.now;
      this.scan();
    }
    if (player.playing !== this.music) {
      this.music = player.playing;
      this.events.push({ type: "music", on: this.music });
    }
    this.night = theme.night;
    this.pointer.vx *= Math.exp(-dt * 6);
    this.pointer.vy *= Math.exp(-dt * 6);
  }

  /** The perch's live top edge (the element may have moved since the last scan). */
  rectOf(el: Element) {
    if (!el.isConnected) return null;
    const r = el.getBoundingClientRect();
    return r.width ? r : null;
  }

  take() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
