// Her eyes and ears: everything the visitor does on the page, turned into two things.
//   - `world`: what is true right now (which section, what's under the cursor, how fast they scroll, ...)
//   - stimuli: things that just happened ("they clicked the demo", "they scrolled past the work in 2 s", ...)
// She never reacts to raw DOM events; the mind decides what (if anything) a stimulus is worth saying.

import { projects } from "@/content";
import { player, current } from "@/components/ipod/player";

export type Section = "hero" | "intro" | "work" | "contact";

export type Target =
  | { kind: "project"; id: string; title: string }
  | { kind: "demo" | "source"; id: string; title: string }
  | { kind: "goto"; id: string; title: string }
  | { kind: "tool"; name: string; what: string }
  | { kind: "nav"; label: string }
  | { kind: "theme" }
  | { kind: "ipod" }
  | { kind: "player" }
  | { kind: "social"; label: string }
  | { kind: "github" }
  | { kind: "quote"; by: string }
  | { kind: "statement" }
  | { kind: "title" }
  | { kind: "legal" }
  | { kind: "mascot" };

export type Stimulus = { at: number } & (
  | { type: "start" }
  | { type: "section"; section: Section; prev: Section | null; visits: number }
  | { type: "see"; id: string; title: string }
  | { type: "fastScroll"; section: Section | null; skipped: string[] }
  | { type: "scrollBack" }
  | { type: "bottom" }
  | { type: "top" }
  | { type: "hover"; target: Target }
  | { type: "dwell"; target: Target; ms: number }
  | { type: "click"; target: Target }
  | { type: "clickVoid" }
  | { type: "rageClick" }
  | { type: "poke" }
  | { type: "pet"; ms: number }
  | { type: "shake" }
  | { type: "idle"; ms: number }
  | { type: "wake"; ms: number }
  | { type: "away" }
  | { type: "back"; ms: number }
  | { type: "exitIntent" }
  | { type: "select"; text: string }
  | { type: "copy"; what: string }
  | { type: "theme"; theme: "light" | "dark"; flips: number }
  | { type: "song"; title: string; artist: string }
  | { type: "songStop" }
  | { type: "typed"; word: string }
  | { type: "her"; key: string; chance: number; force: boolean }
);

export type StimulusType = Stimulus["type"];
type Raw = Stimulus extends infer T ? (T extends unknown ? Omit<T, "at"> : never) : never;

export type World = {
  now: number;
  startedAt: number;
  section: Section | null;
  sectionSince: number;
  sectionVisits: Partial<Record<Section, number>>;
  depth: number; // 0..1, how far down the page
  maxDepth: number;
  speed: number; // px/s, smoothed
  dir: 1 | -1;
  pointer: { x: number; y: number }; // -1..1, screen space
  pointerSpeed: number; // px/s, smoothed
  hover: Target | null;
  hoverEl: Element | null;
  hoverSince: number;
  lastInput: number;
  theme: "light" | "dark";
  song: { title: string; artist: string } | null;
  touch: boolean;
  seen: Set<string>; // projects that were on screen for a moment
  hovered: Set<string>; // projects pointed at
  opened: Set<string>; // projects whose demo/source was clicked
  clicks: number;
};

export const sectionOrder: Section[] = ["hero", "intro", "work", "contact"];

const IDLE_STEPS = [20_000, 40_000, 80_000];
const DWELL_STEPS = [1_400, 5_000];

export class Senses {
  world: World;
  private off: (() => void)[] = [];
  private timers: number[] = [];
  private emit: (s: Stimulus) => void;

  // Scroll bookkeeping
  private lastY = 0;
  private lastT = 0;
  private runStartY = 0; // where the current scroll direction started
  private fastSince = 0;
  private lastFast = 0;
  private sectionEnteredAt = 0;
  private atBottom = false;
  private atTop = true;
  private lastKey = 0;
  // Pointer bookkeeping
  private lastPX = 0;
  private lastPY = 0;
  private hasPointer = false;
  private recheckQueued = false;
  private lastPT = 0;
  private flips: number[] = [];
  private lastShake = 0;
  private lastXDir = 0;
  private clicksAt: { t: number; x: number; y: number }[] = [];
  private idleStep = 0;
  private dwellStep = 0;
  private hiddenAt = 0;
  private typed = "";
  private themeFlips: number[] = [];
  private songKey = "";
  private seenTimers = new Map<Element, number>();

  constructor(emit: (s: Stimulus) => void) {
    this.emit = emit;
    const now = performance.now();
    this.world = {
      now,
      startedAt: now,
      section: null,
      sectionSince: now,
      sectionVisits: {},
      depth: 0,
      maxDepth: 0,
      speed: 0,
      dir: 1,
      pointer: { x: 0, y: 0 },
      pointerSpeed: 0,
      hover: null,
      hoverEl: null,
      hoverSince: now,
      lastInput: now,
      theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
      song: null,
      touch: matchMedia("(hover: none)").matches,
      seen: new Set(),
      hovered: new Set(),
      opened: new Set(),
      clicks: 0,
    };
  }

  private fire(s: Raw) {
    this.emit({ ...s, at: performance.now() } as Stimulus);
  }

  private on<E extends Event = Event>(target: EventTarget, type: string, fn: (e: E) => void, opts?: AddEventListenerOptions) {
    target.addEventListener(type, fn as EventListener, opts);
    this.off.push(() => target.removeEventListener(type, fn as EventListener, opts));
  }

  start() {
    this.lastY = window.scrollY;
    this.lastT = performance.now();
    this.runStartY = this.lastY;

    this.on(window, "scroll", () => this.onScroll(), { passive: true });
    this.on<PointerEvent>(window, "pointermove", (e) => this.onPointer(e), { passive: true });
    this.on(document, "pointerover", (e) => this.onOver(e.target as Element | null), { passive: true });
    this.on<MouseEvent>(document, "click", (e) => this.onClick(e), { capture: true });
    this.on<KeyboardEvent>(window, "keydown", (e) => this.onKey(e));
    this.on(document, "visibilitychange", () => this.onVisibility());
    this.on<MouseEvent>(document, "mouseout", (e) => {
      // Cursor leaving through the top of the window: usually heading for the tab bar / close button.
      if (!e.relatedTarget && e.clientY <= 4) this.fire({ type: "exitIntent" });
    });
    this.on(document, "copy", () => this.fire({ type: "copy", what: String(document.getSelection() ?? "").slice(0, 80) }));
    let selTimer = 0;
    this.on(document, "selectionchange", () => {
      clearTimeout(selTimer);
      selTimer = window.setTimeout(() => {
        const text = String(document.getSelection() ?? "").trim();
        if (text.length > 3) this.fire({ type: "select", text: text.slice(0, 120) });
      }, 700);
    });

    // Theme flips (the toggle writes data-theme on <html>).
    const themeObs = new MutationObserver(() => {
      const t = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
      if (t === this.world.theme) return;
      this.world.theme = t;
      const now = performance.now();
      this.themeFlips = this.themeFlips.filter((x) => now - x < 12_000).concat(now);
      this.fire({ type: "theme", theme: t, flips: this.themeFlips.length });
    });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    this.off.push(() => themeObs.disconnect());

    // Projects she "sees": on screen (mostly) for a moment.
    const seeObs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as HTMLElement;
          const id = el.dataset.project!;
          if (e.isIntersecting && e.intersectionRatio >= 0.55) {
            if (this.seenTimers.has(el)) continue;
            this.seenTimers.set(
              el,
              window.setTimeout(() => {
                this.seenTimers.delete(el);
                const first = !this.world.seen.has(id);
                this.world.seen.add(id);
                if (first) this.fire({ type: "see", id, title: titleOf(id) });
              }, 600),
            );
          } else {
            clearTimeout(this.seenTimers.get(el));
            this.seenTimers.delete(el);
          }
        }
      },
      { threshold: [0, 0.55, 0.8] },
    );
    document.querySelectorAll("[data-project]").forEach((el) => seeObs.observe(el));
    this.off.push(() => seeObs.disconnect());

    // The slow clock: idle, dwell, the iPod.
    this.timers.push(window.setInterval(() => this.tick(), 250));

    this.onScroll();
    this.fire({ type: "start" });
  }

  stop() {
    this.off.forEach((f) => f());
    this.off = [];
    this.timers.forEach((t) => clearInterval(t));
    this.timers = [];
    this.seenTimers.forEach((t) => clearTimeout(t));
    this.seenTimers.clear();
  }

  /** Her own body: the 3D model calls these (R3F pointer events), since she isn't a DOM element. */
  poke() {
    this.input();
    this.fire({ type: "poke" });
  }
  private petStart = 0;
  private petFired = 0;
  setMascotHovered(on: boolean) {
    const now = performance.now();
    this.petStart = on ? now : 0;
    this.petFired = 0;
    if (on) this.setHover({ kind: "mascot" }, null);
    else if (this.world.hover?.kind === "mascot") this.setHover(null, null);
  }

  private input() {
    const now = performance.now();
    const quiet = now - this.world.lastInput;
    if (this.idleStep > 0) this.fire({ type: "wake", ms: quiet });
    this.idleStep = 0;
    this.world.lastInput = now;
  }

  private tick() {
    const w = this.world;
    const now = performance.now();
    w.now = now;
    // Scroll speed fades when the page stops moving (scroll events stop arriving).
    if (now - this.lastT > 120) w.speed *= 0.6;
    w.pointerSpeed *= 0.8;

    const quiet = now - w.lastInput;
    if (this.idleStep < IDLE_STEPS.length && quiet >= IDLE_STEPS[this.idleStep]) {
      this.fire({ type: "idle", ms: IDLE_STEPS[this.idleStep] });
      this.idleStep++;
    }

    if (w.hover && w.hover.kind !== "mascot" && this.dwellStep < DWELL_STEPS.length && now - w.hoverSince >= DWELL_STEPS[this.dwellStep]) {
      this.fire({ type: "dwell", target: w.hover, ms: DWELL_STEPS[this.dwellStep] });
      this.dwellStep++;
    }

    if (this.petStart) {
      const ms = now - this.petStart;
      if ((this.petFired === 0 && ms > 900) || (this.petFired > 0 && ms - this.petFired > 3_500)) {
        this.petFired = ms;
        this.fire({ type: "pet", ms });
      }
    }

    const song = player.playing ? current() : null;
    const key = song ? `${song.title}|${song.artist}` : "";
    if (key !== this.songKey) {
      this.songKey = key;
      w.song = song ? { title: song.title, artist: song.artist } : null;
      if (song) this.fire({ type: "song", title: song.title, artist: song.artist });
      else this.fire({ type: "songStop" });
    }
  }

  private onScroll() {
    const w = this.world;
    const now = performance.now();
    const y = window.scrollY;
    const dt = Math.max(1, now - this.lastT);
    const v = ((y - this.lastY) / dt) * 1000;
    w.speed = w.speed * 0.7 + Math.abs(v) * 0.3;
    const dir: 1 | -1 = v < 0 ? -1 : 1;
    if (v !== 0 && dir !== w.dir) {
      // Turned around: a long way down and then back up reads as "wait, what was that?"
      if (dir === -1 && this.lastY - this.runStartY > window.innerHeight * 1.2) {
        this.fire({ type: "scrollBack" });
      }
      this.runStartY = this.lastY;
      w.dir = dir;
    }
    this.lastY = y;
    this.lastT = now;
    if (Math.abs(v) > 50) this.input();
    // The page moved under a still cursor (the work gallery slides cards sideways): no pointerover fires,
    // so look again at what's under it now (once a frame at most).
    if (this.hasPointer && !this.recheckQueued) {
      this.recheckQueued = true;
      requestAnimationFrame(() => {
        this.recheckQueued = false;
        this.onOver(document.elementFromPoint(this.lastPX, this.lastPY));
      });
    }

    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    w.depth = Math.min(1, Math.max(0, y / max));
    w.maxDepth = Math.max(w.maxDepth, w.depth);

    if (w.speed > 2_600) {
      this.fastSince ||= now;
      if (now - this.fastSince > 250 && now - this.lastFast > 5_000) {
        this.lastFast = now;
        const skipped = projects.filter((p) => !w.seen.has(p.id)).map((p) => p.title);
        this.fire({ type: "fastScroll", section: w.section, skipped });
      }
    } else this.fastSince = 0;

    // (Only once they've actually scrolled: a page that's still loading can look like it's all "bottom".)
    const bottom = y > window.innerHeight && y >= max - 40;
    if (bottom && !this.atBottom) this.fire({ type: "bottom" });
    this.atBottom = bottom;
    const top = y < 10;
    if (top && !this.atTop && w.maxDepth > 0.4) this.fire({ type: "top" });
    this.atTop = top;

    const section = sectionAtCenter();
    if (section && section !== w.section) {
      // Ignore sections flown through in under half a second.
      const prev = w.section;
      w.section = section;
      w.sectionSince = now;
      this.sectionEnteredAt = now;
      const enteredAt = now;
      window.setTimeout(() => {
        if (w.section !== section || this.sectionEnteredAt !== enteredAt) return;
        const visits = (w.sectionVisits[section] ?? 0) + 1;
        w.sectionVisits[section] = visits;
        this.fire({ type: "section", section, prev, visits });
      }, 500);
    }
  }

  private onPointer(e: PointerEvent) {
    const w = this.world;
    const now = performance.now();
    w.touch = e.pointerType === "touch";
    w.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    w.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    const dt = Math.max(1, now - this.lastPT);
    const dx = e.clientX - this.lastPX;
    const sp = (Math.hypot(dx, e.clientY - this.lastPY) / dt) * 1000;
    w.pointerSpeed = w.pointerSpeed * 0.7 + sp * 0.3;
    // Shaking: quick left/right reversals.
    const xDir = Math.sign(dx);
    if (xDir && xDir !== this.lastXDir && sp > 900) {
      this.flips = this.flips.filter((t) => now - t < 900).concat(now);
      if (this.flips.length >= 6 && now - this.lastShake > 4_000) {
        this.lastShake = now;
        this.flips = [];
        this.fire({ type: "shake" });
      }
    }
    if (xDir) this.lastXDir = xDir;
    this.lastPX = e.clientX;
    this.lastPY = e.clientY;
    this.lastPT = now;
    this.hasPointer = e.pointerType !== "touch";
    if (sp > 30) this.input();
  }

  private onOver(el: Element | null) {
    if (this.world.hover?.kind === "mascot") return;
    const hit = identify(el);
    const same = hit && this.world.hover && sameTarget(hit.target, this.world.hover);
    if (same) return;
    this.setHover(hit?.target ?? null, hit?.el ?? null);
  }

  private setHover(t: Target | null, el: Element | null) {
    const w = this.world;
    w.hover = t;
    w.hoverEl = el;
    w.hoverSince = performance.now();
    this.dwellStep = 0;
    if (!t) return;
    if (t.kind === "project" || t.kind === "demo" || t.kind === "source") w.hovered.add(t.id);
    if (t.kind !== "mascot") this.fire({ type: "hover", target: t });
  }

  private onClick(e: MouseEvent) {
    const w = this.world;
    const now = performance.now();
    this.input();
    w.clicks++;
    const hit = identify(e.target as Element | null);
    if (hit) {
      const t = hit.target;
      if (t.kind === "demo" || t.kind === "source") w.opened.add(t.id);
      if (t.kind === "social" && (e.target as Element).closest(".copy-handle")) this.fire({ type: "copy", what: t.label });
      this.fire({ type: "click", target: t });
      this.clicksAt = [];
      return;
    }
    this.clicksAt = this.clicksAt.filter((c) => now - c.t < 900 && Math.hypot(c.x - e.clientX, c.y - e.clientY) < 40);
    this.clicksAt.push({ t: now, x: e.clientX, y: e.clientY });
    if (this.clicksAt.length >= 3) {
      this.clicksAt = [];
      this.fire({ type: "rageClick" });
    } else if (this.clicksAt.length === 1) this.fire({ type: "clickVoid" });
  }

  private onKey(e: KeyboardEvent) {
    this.input();
    const target = e.target as HTMLElement | null;
    if (target?.closest?.("input, textarea, [contenteditable]")) return;
    if (e.key.length !== 1) return;
    const now = performance.now();
    if (now - this.lastKey > 1_500) this.typed = "";
    this.lastKey = now;
    this.typed = (this.typed + e.key.toLowerCase()).slice(-16);
    const words = ["hello", "hi", "hey", "hallo", "ciao", "servus", "bunny", "cute", "love", "bye", "ryhox", "help"];
    for (const word of words) {
      const before = this.typed.slice(0, -word.length).slice(-1);
      if (this.typed.endsWith(word) && !/[a-z]/.test(before)) {
        this.typed = "";
        this.fire({ type: "typed", word });
        break;
      }
    }
  }

  private onVisibility() {
    if (document.hidden) {
      this.hiddenAt = performance.now();
      this.fire({ type: "away" });
    } else if (this.hiddenAt) {
      const ms = performance.now() - this.hiddenAt;
      this.hiddenAt = 0;
      this.world.lastInput = performance.now();
      this.idleStep = 0;
      this.fire({ type: "back", ms });
    }
  }
}

export function titleOf(id: string) {
  return projects.find((p) => p.id === id)?.title ?? id;
}

function sectionAtCenter(): Section | null {
  const mid = window.innerHeight / 2;
  for (const el of document.querySelectorAll<HTMLElement>("[data-section]")) {
    const r = el.getBoundingClientRect();
    if (r.top <= mid && r.bottom >= mid) return el.dataset.section as Section;
  }
  return null;
}

function sameTarget(a: Target, b: Target) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** What the visitor is pointing at, in her terms. Order matters: the most specific thing wins. */
export function identify(el: Element | null): { target: Target; el: Element } | null {
  if (!el?.closest) return null;
  let m: HTMLElement | null;

  if ((m = el.closest<HTMLElement>("[data-act]"))) {
    const id = m.closest<HTMLElement>("[data-project]")?.dataset.project ?? "";
    const label = m.getAttribute("aria-label") ?? "";
    return { target: { kind: label.startsWith("Source") ? "source" : "demo", id, title: titleOf(id) }, el: m };
  }
  if ((m = el.closest<HTMLElement>("[data-project]"))) {
    const id = m.dataset.project!;
    return { target: { kind: "project", id, title: titleOf(id) }, el: m };
  }
  if ((m = el.closest<HTMLElement>("[data-goto]"))) {
    const id = m.dataset.goto!;
    return { target: { kind: "goto", id, title: titleOf(id) }, el: m };
  }
  if ((m = el.closest<HTMLElement>(".glass-cap"))) {
    const [name, what = ""] = (m.getAttribute("aria-label") ?? "").split(": ");
    return { target: { kind: "tool", name, what: m.dataset.what ?? what }, el: m };
  }
  if ((m = el.closest<HTMLElement>(".theme-switch"))) return { target: { kind: "theme" }, el: m };
  if ((m = el.closest<HTMLElement>(".nav-pill"))) return { target: { kind: "nav", label: (m.textContent ?? "").trim().slice(0, 20) }, el: m };
  if ((m = el.closest<HTMLElement>("[data-ipod]"))) return { target: { kind: "ipod" }, el: m };
  if ((m = el.closest<HTMLElement>(".mini-player"))) return { target: { kind: "player" }, el: m };
  if ((m = el.closest<HTMLElement>(".panel-more"))) return { target: { kind: "github" }, el: m };
  if ((m = el.closest<HTMLElement>(".copy-handle"))) {
    const label = (m.getAttribute("aria-label") ?? "Discord").split(":")[0];
    return { target: { kind: "social", label }, el: m };
  }
  if ((m = el.closest<HTMLElement>(".contact-links a"))) return { target: { kind: "social", label: (m.textContent ?? "").trim() }, el: m };
  if ((m = el.closest<HTMLElement>(".quote"))) return { target: { kind: "quote", by: m.querySelector(".quote-poet")?.textContent ?? "" }, el: m };
  if ((m = el.closest<HTMLElement>(".statement"))) return { target: { kind: "statement" }, el: m };
  if ((m = el.closest<HTMLElement>(".hero-title"))) return { target: { kind: "title" }, el: m };
  if ((m = el.closest<HTMLElement>(".footer a"))) return { target: { kind: "legal" }, el: m };
  return null;
}
