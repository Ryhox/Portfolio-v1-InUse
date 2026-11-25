import { theme } from "@/lib/theme";
import { player } from "../ipod/player";
import { lenis } from "../SmoothScroll";

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

// Things worth a glance now and then (brain.ts): headings, text blocks, cards, buttons, the footer.
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
].join(",");

// Content she must never cover, so she stays in the free space around it:
//   text: measured line by line (the text itself, not the box around it, which is often much wider)
//   things: pictures, videos, buttons, the iPod, the nav, the mini player (their boxes)
// (not the text only screen readers get: it's off screen)
const TEXT_SEL = ":is(h1, h2, h3, h4, p, blockquote, figcaption, .footer a, .footer span, .panel-index, .panel-stat, .work-count, .more-handle, .seen, .st-head):not(.sr-only)";
const THING_SEL = [
  "img", "video", ".panel-media", ".glass-cap", ".chrome-pill", ".nav-pill", ".act", ".more-icon",
  "[data-ipod]", ".mini-player.is-on", "[data-mascot-solid]",
].join(",");

export type Box = { left: number; right: number; top: number; bottom: number };
/** (`media`: part of a project video, which she can float over in the gallery. `work`: in the gallery,
 *  which stays put on the screen while it's pinned, however far the page scrolls.) */
type Solid = Box & { media?: boolean; work?: boolean };

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
  solids: Solid[] = [];
  events: WorldEvent[] = [];
  music = false;
  night = 0;
  hidden = false;
  /** Last time the visitor did anything at all (seconds). */
  input = 0;
  private offs: (() => void)[] = [];
  private scanAt = 0;
  private scanQueued = false;
  private range: Range | null = null;
  private lastScroll = 0;
  private konami = 0;
  private hiddenAt = 0;

  attach() {
    this.now = performance.now() / 1000;
    this.input = this.now;
    // (the width she can use: without the scrollbar)
    this.W = document.documentElement.clientWidth || window.innerWidth;
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
      const w = document.documentElement.clientWidth || window.innerWidth;
      const wide = Math.abs(w - this.W) > 30;
      this.W = w;
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

  // What there is to measure, found once (and again every couple of seconds, in case the page changed), and
  // where each piece was in the page the last time it was measured (document px), so the ones far from the
  // screen can be left alone in between.
  private lists: { perches: Element[]; things: { el: Element; media: boolean; work: boolean }[]; texts: { el: Element; work: boolean; words: Element[] }[] } | null = null;
  private fullAt = -1e9;
  private spans = new WeakMap<Element, [number, number]>();

  private findAll() {
    const mine = (el: Element) => !!el.closest("[data-mascot]");
    this.lists = {
      perches: [...document.querySelectorAll(PERCH_SEL)],
      things: [...document.querySelectorAll(THING_SEL)].filter((el) => !mine(el)).map((el) => ({ el, media: !!el.closest(".panel-media"), work: !!el.closest(".work") })),
      texts: [...document.querySelectorAll(TEXT_SEL)].filter((el) => !mine(el)).map((el) => ({ el, work: !!el.closest(".work"), words: [...el.querySelectorAll(".word, .qw, .w, .hero-word")] })),
    };
  }

  private scan() {
    const out: Perch[] = [];
    const H = this.H;
    // (Measuring the page is the costly part of her, so it's done a few times a second, each element's
    // layout read once, and only what's near the screen; in between, what was measured is moved along with
    // the scroll, see overlap(). Every couple of seconds, everything, in case the page changed.)
    this.chains.clear();
    this.secRects.clear();
    this.scanY = window.scrollY;
    const full = !this.lists || this.now - this.fullAt > 2;
    if (full) {
      this.fullAt = this.now;
      this.findAll();
    }
    const lists = this.lists!;
    const lo = this.scanY - H * 0.8, hi = this.scanY + H * 1.8;
    // (far from the screen last time: skip it; the gallery's pieces move sideways while it's pinned, so always)
    const far = (el: Element, work: boolean) => {
      if (full || (work && this.workPinned)) return false;
      const sp = this.spans.get(el);
      return !!sp && (sp[1] < lo || sp[0] > hi);
    };
    const keep = <R extends Box | null>(el: Element, r: R): R => {
      if (r) this.spans.set(el, [r.top + this.scanY, r.bottom + this.scanY]);
      return r;
    };
    lists.perches.forEach((el) => {
      if (far(el, false)) return;
      const r: DOMRect = keep(el, el.getBoundingClientRect());
      if (r.width < 90 || r.height < 12) return;
      if (r.bottom < -H || r.top > 2 * H || r.right < 0 || r.left > this.W) return;
      out.push({ el, left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    });
    this.perches = out;
    // Content, where it *ends up*: things animating in (sliding up, letters flying in, scaling) are measured
    // at their final place, so she doesn't dodge something mid-animation and then come back.
    this.trackShift = this.galleryShift();
    const solids: Solid[] = [];
    const near = (r: Box) => !(r.bottom < -H * 0.5 || r.top > H * 1.5 || r.right < 0 || r.left > this.W);
    const add = (r: Box | null, media = false, work = false) => {
      if (r && r.right - r.left >= 4 && r.bottom - r.top >= 4 && near(r)) solids.push(media || work ? { ...r, media, work } : r);
    };
    lists.things.forEach(({ el, media, work }) => {
      if (far(el, work)) return;
      const r = keep(el, this.restRect(el));
      if (!r || (r.right - r.left >= this.W * 0.98 && r.bottom - r.top >= H * 0.9)) return; // (a whole-screen backdrop)
      add(r, media, work);
    });
    const range = this.range ??= document.createRange();
    lists.texts.forEach(({ el, work, words }) => {
      if (far(el, work)) return;
      const rest = keep(el, this.restRect(el));
      if (!rest || !near(rest)) return;
      // Text split into words / letters (the big animated headings and quotes): the words' resting places.
      if (words.length) {
        words.forEach((wd) => add(this.restRect(wd), false, work));
        return;
      }
      // Plain text: its lines, shifted by however far the block is still animating from its resting place.
      const live = el.getBoundingClientRect();
      const dx = rest.left - live.left, dy = rest.top - live.top;
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) add({ left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy }, false, work);
    });
    this.solids = solids;
    // The gallery: where its pin starts and ends (its pin-spacer: as tall as the pin lasts, plus a screen), the
    // videos' top edge and where "and much more" is.
    const work = document.querySelector<HTMLElement>(".work");
    const spacer = work?.parentElement?.classList.contains("pin-spacer") ? work.parentElement : null;
    if (spacer) {
      this.pinFrom = spacer.getBoundingClientRect().top + this.scanY;
      this.pinTo = this.pinFrom + spacer.offsetHeight - H;
    } else {
      this.pinFrom = Infinity;
      this.pinTo = -Infinity;
    }
    let top = Infinity;
    document.querySelectorAll(".work .panel-media").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > 0 && r.left < this.W && r.height > 40) top = Math.min(top, r.top);
    });
    this.mediaTop = Number.isFinite(top) ? top : NaN;
    const more = document.querySelector(".work .panel-more");
    this.moreLeft = more ? more.getBoundingClientRect().left : Infinity;
    this.docH = document.documentElement.scrollHeight;
  }

  private trackShift = 0;
  /** Scroll position at the last measuring, and whether the gallery is pinned (now). */
  private scanY = 0;
  /** The gallery is pinned (it stays put on the screen while the page scrolls). Worked out from the scroll
   *  position and the pin's range (measured with the rest), not by measuring the gallery every frame. */
  workPinned = false;
  private pinFrom = Infinity;
  private pinTo = -Infinity;
  /** Measured with the rest: the top of the project videos on screen (viewport px, NaN: none), and the left
   *  edge of "and much more". */
  mediaTop = NaN;
  moreLeft = Infinity;
  /** The page's height (measured with the rest, not every frame). */
  docH = 0;
  private chains = new Map<HTMLElement, { x: number; y: number; end: HTMLElement }>();
  private secRects = new Map<Element, DOMRect>();
  /** Layout position: offsets up the chain (these ignore CSS transforms, i.e. animations). Also says where the
   *  chain ended, to tell whether a fixed-position ancestor is in the way. (Remembered for the rest of the
   *  measuring, so the elements up the chain are read once, not once per element under them.) */
  private chain(el: HTMLElement): { x: number; y: number; end: HTMLElement } {
    const known = this.chains.get(el);
    if (known) return known;
    const up = el.offsetParent as HTMLElement | null;
    const rest = up ? this.chain(up) : { x: 0, y: 0, end: el };
    const c = { x: rest.x + el.offsetLeft, y: rest.y + el.offsetTop, end: rest.end };
    this.chains.set(el, c);
    return c;
  }
  private secRect(sec: Element) {
    let r = this.secRects.get(sec);
    if (!r) this.secRects.set(sec, (r = sec.getBoundingClientRect()));
    return r;
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
    const sr = this.secRect(sec);
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

  /** How much of a box (viewport px) is covered by content: 0 = free. `behind`: the project videos don't count. */
  overlap(b: Box, behind = false) {
    let a = 0;
    // (moved by however far the page has scrolled since it was measured; the gallery doesn't move while pinned)
    const dy = this.scanY - this.scrollY;
    for (const s of this.solids) {
      if (behind && s.media) continue;
      const sy = s.work && this.workPinned ? 0 : dy;
      const w = Math.min(b.right, s.right) - Math.max(b.left, s.left);
      const h = Math.min(b.bottom, s.bottom + sy) - Math.max(b.top, s.top + sy);
      if (w > 0 && h > 0) a += w * h;
    }
    return a;
  }

  update(dt: number) {
    this.now = performance.now() / 1000;
    // (Lenis keeps the scroll position; asking the page for it every frame, after the animations have moved
    // things, made the browser lay the whole page out again in the middle of the frame.)
    const y = lenis ? lenis.animatedScroll : window.scrollY;
    const v = (y - this.lastScroll) / Math.max(dt, 1 / 240);
    this.scrollV = this.scrollV * 0.8 + v * 0.2;
    this.lastScroll = this.scrollY = y;
    this.workPinned = this.W >= 900 && y >= this.pinFrom - 1 && y <= this.pinTo + 1;
    // (Measured when the browser has a moment between frames: then the layout is already worked out and
    // reading it costs little; in the middle of a frame, after the animations have moved things, it made the
    // browser lay the whole page out again on the spot.)
    if (this.now - this.scanAt > 0.3 && !this.scanQueued) {
      this.scanQueued = true;
      // (Only in a gap with room for it, a few ms, or at the latest after a second and a half, or once the page
      // has moved half a screen: squeezed in between two frames on a slow PC it made the next one late. In
      // between, what was measured is moved along with the scroll anyway.)
      const asked = performance.now();
      const run = (d?: IdleDeadline) => {
        const moved = Math.abs(this.scrollY - this.scanY) > this.H * 0.5;
        if (d && !d.didTimeout && !moved && d.timeRemaining() < 6 && performance.now() - asked < 1500) {
          requestIdleCallback(run, { timeout: Math.max(1, 1500 - (performance.now() - asked)) });
          return;
        }
        this.scanQueued = false;
        this.scanAt = performance.now() / 1000;
        if (this.offs.length) this.scan();
      };
      if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 1500 });
      else setTimeout(run, 0);
    }
    if (player.playing !== this.music) {
      this.music = player.playing;
      this.events.push({ type: "music", on: this.music });
    }
    this.night = theme.night;
    this.pointer.vx *= Math.exp(-dt * 6);
    this.pointer.vy *= Math.exp(-dt * 6);
  }

  take() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
