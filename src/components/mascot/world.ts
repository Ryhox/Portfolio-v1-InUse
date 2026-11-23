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

// Content she must never cover, so she stays in the free space around it:
//   text: measured line by line (the text itself, not the box around it, which is often much wider)
//   things: pictures, videos, buttons, the iPod, the nav, the mini player (their boxes)
const TEXT_SEL = "h1, h2, h3, h4, p, blockquote, figcaption, .footer a, .footer span, .panel-index, .work-count, .more-handle, .seen, .st-head";
const THING_SEL = [
  "img", "video", ".panel-media", ".glass-cap", ".chrome-pill", ".nav-pill", ".act", ".more-icon",
  "[data-ipod]", ".mini-player.is-on", "[data-mascot-solid]",
].join(",");

export type Box = { left: number; right: number; top: number; bottom: number };

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
  /** Content on screen (and a screen above / below), which she keeps clear of. */
  solids: Box[] = [];
  events: WorldEvent[] = [];
  music = false;
  night = 0;
  hidden = false;
  /** Last time the visitor did anything at all (seconds). */
  input = 0;
  private offs: (() => void)[] = [];
  private scanAt = 0;
  private range: Range | null = null;
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
    // Content, where it *ends up*: things animating in (sliding up, letters flying in, scaling) are measured
    // at their final place, so she doesn't dodge something mid-animation and then come back.
    this.trackShift = this.galleryShift();
    const solids: Box[] = [];
    const near = (r: Box) => !(r.bottom < -H * 0.5 || r.top > H * 1.5 || r.right < 0 || r.left > this.W);
    const add = (r: Box | null) => {
      if (r && r.right - r.left >= 4 && r.bottom - r.top >= 4 && near(r)) solids.push(r);
    };
    document.querySelectorAll(THING_SEL).forEach((el) => {
      if (el.closest("[data-mascot]")) return;
      const r = this.restRect(el);
      if (!r || (r.right - r.left >= this.W * 0.98 && r.bottom - r.top >= H * 0.9)) return; // (a whole-screen backdrop)
      add(r);
    });
    const range = this.range ??= document.createRange();
    document.querySelectorAll(TEXT_SEL).forEach((el) => {
      if (el.closest("[data-mascot]")) return;
      const rest = this.restRect(el);
      if (!rest || !near(rest)) return;
      // Text split into words / letters (the big animated headings and quotes): the words' resting places.
      const words = el.querySelectorAll(".word, .qw, .w, .hero-word");
      if (words.length) {
        words.forEach((wd) => add(this.restRect(wd)));
        return;
      }
      // Plain text: its lines, shifted by however far the block is still animating from its resting place.
      const live = el.getBoundingClientRect();
      const dx = rest.left - live.left, dy = rest.top - live.top;
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) add({ left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy });
    });
    this.solids = solids;
  }

  private trackShift = 0;
  /** Layout position: offsets up the chain (these ignore CSS transforms, i.e. animations). Also says where the
   *  chain ended, to tell whether a fixed-position ancestor is in the way. */
  private chain(el: HTMLElement) {
    let x = 0, y = 0;
    let n: HTMLElement | null = el, end: HTMLElement = el;
    while (n) {
      x += n.offsetLeft;
      y += n.offsetTop;
      end = n;
      n = n.offsetParent as HTMLElement | null;
    }
    return { x, y, end };
  }
  /** Where an element rests once its animations are done (viewport px). Measured from its section's live
   *  position, so scrolling and pinning still count; the gallery's sideways slide (real movement) is added. */
  private restRect(el: Element): Box | null {
    const live = el.getBoundingClientRect();
    if (!live.width && !live.height) return null;
    const asLive = { left: live.left, right: live.right, top: live.top, bottom: live.bottom };
    if (!(el instanceof HTMLElement) || el.offsetParent === null) return asLive; // (svg, fixed things: as they are)
    const sec = (el.closest("[data-section]") as HTMLElement | null) ?? document.body;
    const ce = this.chain(el), cs = this.chain(sec);
    if (ce.end !== cs.end) return asLive; // (a fixed ancestor in between: as it is)
    const sr = sec.getBoundingClientRect();
    let left = sr.left + ce.x - cs.x;
    const top = sr.top + ce.y - cs.y;
    if (this.trackShift && el.closest(".work-track")) left += this.trackShift;
    return { left, right: left + el.offsetWidth, top, bottom: top + el.offsetHeight };
  }
  /** How far the work gallery has slid sideways (its scroll-driven transform). */
  private galleryShift() {
    const track = document.querySelector<HTMLElement>(".work-track");
    const sec = track?.closest<HTMLElement>("[data-section]");
    if (!track || !sec || track.offsetParent === null) return 0;
    const ct = this.chain(track), cs = this.chain(sec);
    if (ct.end !== cs.end) return 0;
    return track.getBoundingClientRect().left - (sec.getBoundingClientRect().left + ct.x - cs.x);
  }

  /** How much of a box (viewport px) is covered by content: 0 = free. */
  overlap(b: Box) {
    let a = 0;
    for (const s of this.solids) {
      const w = Math.min(b.right, s.right) - Math.max(b.left, s.left);
      const h = Math.min(b.bottom, s.bottom) - Math.max(b.top, s.top);
      if (w > 0 && h > 0) a += w * h;
    }
    return a;
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
