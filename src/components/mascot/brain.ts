import type { Expr } from "./face";
import type { LineKey } from "./lines";
import { Voice } from "./voice/mind";
import { tsundere } from "./voice/personality";
import type { World } from "./world";

// Her mind. Every frame it reads the world (World) and decides where she is, what she does, which
// animation plays, what face she pulls, where she looks and what she says. The 3D side (MascotModel) only
// shows the result.
//
// She lives on a little cloud and is a bit of a tsundere: nonchalant, easily annoyed, secretly pleased.
//  - She stays on her cloud (only you can put her down on the page; then the cloud fetches her).
//  - The cloud parks at a spot that belongs to the page (on a heading, a card, in the margin), so scrolling
//    carries her off; she then drifts back into view, lying on her back, unbothered.
//  - Left alone she runs little routines (lounging, grooming, sulking, stargazing at night, bopping to the
//    iPod...), picked by her mood (annoyance, boredom, energy, how much she likes you).
//  - Poke her (where matters: ears, head, belly, feet, cloud; and how often), pet her, pick her up by
//    whatever you grab (an ear, her head, her middle, her feet: she hangs from it), shake her, throw her.
//    The cloud stays where it was while you hold her, then races to catch her; she lands in it and shuffles
//    back to the middle. Miss, and she lands on the page and the cloud comes to fetch her.
//  - She notices the music, day and night, the tab going away, text you select or copy, typing, clicks
//    near her, the cursor hanging around her, and where you are on the page.

export type Out = {
  x: number;
  y: number;
  /** Visual tilt (counter-clockwise, radians), around her seat. */
  roll: number;
  yaw: number;
  anim: string;
  once: boolean;
  fade: number;
  speed: number;
  seq: number;
  expr: Expr;
  blink: number;
  look: { x: number; y: number; w: number };
  cloud: { x: number; y: number; squash: number; tilt: number };
  bubble: { text: string; seq: number; until: number };
  zz: boolean;
  /** Music notes floating up from her (the iPod is playing and she's awake). */
  notes: boolean;
  /** While held: how far she's swung away from hanging straight (radians). The model lets her limbs lag. */
  swing: number;
  visible: boolean;
  grabbing: boolean;
};

/** Where her body is on screen (set by the model every frame, from the bones). */
export type Geo = {
  head: { x: number; y: number; r: number };
  body: { x: number; y: number; r: number };
  ears: { x: number; y: number; r: number }[];
  feet: { x: number; y: number; r: number }[];
};

export type Zone = "head" | "ear" | "body" | "feet" | "cloud";
type Mode = "enter" | "ride" | "perch" | "held" | "air" | "hop" | "away";
// `el`: sits on that element (at fraction f of its width). Otherwise a spot in the margin: kept relative to
// the section it's in (`anchor`), so it moves with that section, also while the section is pinned (the work
// gallery stays put while the page scrolls under it); docY is the fallback.
type Spot = { el: Element | null; f: number; docY: number; x: number; anchor?: { el: Element; dy: number } };
type Step = { pose?: string; once?: string; dur?: [number, number]; say?: LineKey; chance?: number; face?: Expr };

// Animations where her own head motion matters (no looking around on top of them).
const HEAD_BUSY = new Set([
  "Sit_Look", "Peek", "Sit_Scratch", "Sit_Hmph", "Sit_LookUp", "Cloud_Pat", "Shrug", "Stomp", "Pet", "Dizzy",
  "Lie_Belly", "Lie_Back", "Sleep_Lie", "Sleep", "Tumble", "Fall", "Dangle", "Air", "Jump", "Land", "Sit_Yawn",
]);
const LYING = new Set(["Lie_Belly", "Lie_Back", "Sleep_Lie"]);

// Little routines she runs when nothing is going on.
const ROUTINES: Record<string, Step[]> = {
  chill: [{ pose: "Sit_Idle", dur: [6, 10] }, { once: "Sit_Look" }, { pose: "Sit_Kick", dur: [5, 8] }, { pose: "Sit_Idle", dur: [4, 7] }],
  lounge: [{ pose: "Sit_Idle", dur: [3, 5] }, { pose: "Lie_Belly", dur: [9, 15] }, { pose: "Lie_Back", dur: [10, 16] }, { pose: "Sit_Idle", dur: [3, 5] }],
  groom: [{ once: "Sit_Scratch" }, { pose: "Sit_Idle", dur: [2, 4] }, { once: "Sit_EarFlick" }, { pose: "Sit_Idle", dur: [4, 7] }],
  bored: [{ once: "Sit_Sigh", say: "bored", chance: 0.5 }, { pose: "Sit_Bored", dur: [7, 11] }, { once: "Cloud_Pat" }, { pose: "Sit_Bored", dur: [5, 8] }],
  sleepy: [{ once: "Sit_Yawn", face: "yawn", say: "yawn", chance: 0.4 }, { pose: "Sit_Bored", dur: [5, 8] }, { pose: "Lie_Back", dur: [8, 12] }, { pose: "Sleep_Lie", dur: [30, 60] }],
  stargaze: [{ pose: "Sit_LookUp", dur: [9, 15], say: "stars", chance: 0.5 }, { once: "Sit_Yawn", face: "yawn" }, { pose: "Lie_Back", dur: [10, 16] }],
  sulk: [{ pose: "Sit_Hmph", dur: [6, 10], say: "sulk", chance: 0.5 }, { once: "Sit_Sigh" }, { pose: "Sit_Idle", dur: [4, 6] }],
  music: [{ pose: "HeadBob", dur: [10, 18] }, { pose: "Dance", dur: [5, 7], say: "musicOn", chance: 0.4, face: "smug" }, { pose: "HeadBob", dur: [8, 14] }],
  watch: [{ pose: "Sit_Idle", dur: [3, 5] }, { once: "Peek" }, { pose: "Sit_Kick", dur: [4, 7] }],
};

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function weighted<T>(items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + Math.max(0, w), 0);
  let r = Math.random() * total;
  for (const [v, w] of items) {
    r -= Math.max(0, w);
    if (r <= 0) return v;
  }
  return items[0][0];
}

export class Brain {
  out: Out = {
    x: -999, y: -999, roll: 0, yaw: 0, anim: "Lie_Back", once: false, fade: 0.4, speed: 1, seq: 0,
    expr: "neutral", blink: 0, look: { x: 0, y: 0, w: 0 },
    cloud: { x: -999, y: -999, squash: 0, tilt: 0 },
    bubble: { text: "", seq: 0, until: 0 }, zz: false, notes: false, swing: 0, visible: true, grabbing: false,
  };
  geo: Geo = { head: { x: 0, y: 0, r: 0 }, body: { x: 0, y: 0, r: 0 }, ears: [], feet: [] };
  durations: Record<string, number> = {};
  /** Development only: force an animation / switch off looking around. */
  debug: { anim?: string; noLook?: boolean } = {};
  t = 0;
  /** px per model unit */
  S = 40;

  private w: World;
  private mode: Mode = "enter";
  // her seat (px, viewport), velocity, tilt
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private spin = 0;
  private roll = 0;
  // offset from the middle of the cloud after a catch (she shuffles back to the middle)
  private seatDx = 0;
  // the cloud
  private cx = 0;
  private cy = 0;
  private cvx = 0;
  private cvy = 0;
  private cSquash = 0;
  private cSquashV = 0;
  private spot: Spot | null = null;
  private lastSpotEl: Element | null = null;
  private cloudChase = false;
  // perched on the page itself
  private perch: { el: Element | null; dx: number } | null = null;
  private hop: { t: number; T: number; x0: number; y0: number; to: "cloud" | "perch"; px: number; py: number; el: Element | null } | null = null;
  // what she's doing
  private pose = "Lie_Back";
  private oneshot: { name: string; until: number } | null = null;
  private routine: { name: string; i: number; until: number } | null = null;
  private nextTravelAt = 0;
  private freeCheckAt = 0;
  private glide: { spot: Spot | null; sx: number; sy: number; t0: number; T: number } | null = null;
  private coveredCount = 0;
  private perchUntil = 0;
  // mood (0..1)
  private annoy = 0;
  private like = 0.2;
  private energy = 0.8;
  private pokes: number[] = [];
  private exprOverride: { e: Expr; until: number } | null = null;
  private dizzyUntil = 0;
  private sleeping = false;
  private petting = 0;
  private petUntil = 0;
  private hoverPts: { x: number; y: number; t: number }[] = [];
  private nearSince = 0;
  private danceUntil = 0;
  private holdOnUntil = 0;
  private awayUntil = 0;
  private leaveAt = 0;
  // pointer
  private press: { x: number; y: number; t: number; zone: Zone } | null = null;
  private held = {
    psi: 0, omega: 0, psi0: 0, L: 1, rx: 0, ry: 0, grip: "head" as Zone,
    px: 0, py: 0, lx: 0, ly: 0, pvx: 0, pvy: 0, ax: 0, flips: [] as number[], lastSign: 0, since: 0, saidLong: false,
  };
  // speech, looking, blinking
  /** What she says is decided by her voice (voice/): her body only tells it what it would like to say. */
  readonly voice = new Voice({ personality: tsundere });
  private voiceKey = 0;
  private said: Record<string, number> = {};
  private poi: { x: number; y: number; until: number } | null = null;
  private blinkAt = 0;
  private blinkT = -1;
  private sections = new Set<string>();
  private musicSince = 0;
  private keyTimes: number[] = [];
  private saidStill = false;

  constructor(w: World) {
    this.w = w;
  }

  // ================================================================ helpers
  private get W() { return this.w.W; }
  private get H() { return this.w.H; }
  /** Highest a seat may be (her ears need the room above it), and lowest. */
  private get minY() { return Math.max(110, 4.7 * this.S + 12); }
  private get maxY() { return this.H - 1.4 * this.S - 8; }

  /** Her body would like to say something. The voice weighs it against everything else going on and decides
   *  what actually comes out (forced ones are reflexes: she always reacts, but the voice picks the words). */
  private say(key: LineKey, chance = 1, force = false) {
    this.voice.hear(key, chance, force);
  }

  /** Every frame: tell the voice how she's doing, show whatever it decided to say. */
  private voiceFrame() {
    const v = this.voice;
    v.setBody({ sleeping: this.sleeping, held: this.mode === "held", away: this.mode === "away", annoy: this.annoy, like: this.like, energy: this.energy });
    const s = v.getState();
    if (s.key !== this.voiceKey) {
      this.voiceKey = s.key;
      // (cut short: what she was talking about left the screen)
      if (!s.line) this.out.bubble.until = Math.min(this.out.bubble.until, this.t);
      if (s.line) {
        // She talks: she's awake (sleep-talk aside).
        if (this.sleeping && s.expr !== "sleep") this.wake(true);
        this.out.bubble = { text: s.line, seq: this.out.bubble.seq + 1, until: this.t + s.dur };
        if (s.expr && !this.sleeping) this.face(s.expr, Math.min(s.dur, 2.5));
      }
    }
    // She looks at what she's talking about (unless something just happened that she's already looking at).
    if (v.attention && !(this.poi && this.poi.until > this.t)) this.poi = { ...v.attention, until: this.t + 0.25 };
  }
  private sayEvery(key: LineKey, every: number, chance = 1) {
    if ((this.said[key] ?? -1e9) + every > this.t) return;
    this.said[key] = this.t;
    this.say(key, chance);
  }
  private face(e: Expr, sec: number) {
    this.exprOverride = { e, until: this.t + sec };
  }
  private setPose(name: string) {
    this.pose = name;
  }
  private play(name: string) {
    if (!this.durations[name]) return;
    this.oneshot = { name, until: this.t + this.durations[name] };
  }
  private busy() {
    return !!this.oneshot && this.oneshot.until > this.t;
  }
  private lying() {
    return LYING.has(this.pose);
  }
  private grounded() {
    return this.mode === "ride" || this.mode === "perch";
  }
  /** Sit up (out of any lying pose) and drop the routine, for a reaction. */
  private sitUp() {
    if (this.lying() || this.pose === "Sleep") this.setPose("Sit_Idle");
    this.routine = null;
  }

  // ================================================================ spots for the cloud
  private spotPos(s: Spot): { x: number; y: number; ok: boolean } {
    if (s.el) {
      const r = this.w.rectOf(s.el);
      if (!r) return { x: this.cx, y: this.cy, ok: false };
      const half = 1.9 * this.S;
      // Slid off sideways (the work gallery): gone, just like scrolled away.
      if (r.right < half * 0.8 || r.left > this.W - half * 0.8) return { x: this.cx, y: this.cy, ok: false };
      const x = clamp(r.left + s.f * r.width, Math.max(half, r.left + half * 0.4), Math.min(this.W - half, r.right - half * 0.4));
      return { x, y: r.top - 1.02 * this.S, ok: true };
    }
    if (s.anchor) {
      const r = this.w.rectOf(s.anchor.el);
      if (r) return { x: s.x, y: r.top + s.anchor.dy, ok: true };
    }
    return { x: s.x, y: s.docY - this.w.scrollY, ok: true };
  }
  /** The work gallery is pinned and sliding sideways right now. */
  private galleryOn() {
    const work = document.querySelector(".work");
    const r = work && this.w.rectOf(work);
    return !!r && Math.abs(r.top) < 2 && r.bottom >= this.H - 2 && window.innerWidth >= 900;
  }
  /** Where on the page she should keep to one side (viewport px, live). */
  private sideRule() {
    const out: { top: number; bottom: number; side: "left" | "right" }[] = [];
    for (const sel of [".skills", ".contact"]) {
      const el = document.querySelector(sel);
      const r = el && this.w.rectOf(el);
      if (r && r.bottom > 0 && r.top < this.H) out.push({ top: r.top, bottom: r.bottom, side: "right" });
    }
    return out;
  }
  private sectionAt(y: number) {
    for (const el of document.querySelectorAll("[data-section]")) {
      const r = el.getBoundingClientRect();
      if (r.top <= y && r.bottom >= y) return { el, dy: y - r.top };
    }
    return undefined;
  }
  private spotVisible(s: Spot) {
    const p = this.spotPos(s);
    return p.ok && p.y > this.minY - 30 && p.y < this.maxY + 40;
  }
  /** The room she takes up sitting at (x, y) on her cloud: ears to the bottom of the cloud. */
  private roomAt(x: number, y: number) {
    const S = this.S, pad = 6;
    return { left: x - 1.95 * S - pad, right: x + 1.95 * S + pad, top: y - 4.8 * S - pad, bottom: y + 1.35 * S + pad };
  }
  /** How much content she'd cover there (only what's on screen counts: her ears may stick out the top). */
  private covers(x: number, y: number) {
    const r = this.roomAt(x, y);
    return this.w.overlap({ left: Math.max(0, r.left), right: Math.min(this.W, r.right), top: Math.max(0, r.top), bottom: Math.min(this.H, r.bottom) });
  }
  /** Breathing room she keeps from the window's left and right edges. */
  private edgeGap() {
    return clamp(this.W * 0.04, 28, 64);
  }
  private offEdge(x: number) {
    const m = this.edgeGap() + 1.95 * this.S;
    return x >= m - 1 && x <= this.W - m + 1;
  }
  /** Would she cover any content there? */
  private blocked(x: number, y: number) {
    return this.covers(x, y) > 0;
  }
  private avoid(x: number, y: number) {
    // the iPod (bottom right) and the mini player (bottom left)
    if (x > this.W - 300 && y > this.H - 240) return true;
    if (x < 470 && y > this.H - 120) return true;
    return false;
  }
  // She only ever sits where she covers nothing: on top of an element only if the space above it is free,
  // otherwise in the margins and gaps between things. Spots close to where she is are strongly preferred, so
  // she doesn't zip across the page.
  private pickSpot(near = true): Spot | null {
    const S = this.S;
    const cand: [Spot, number][] = [];
    const lo = this.minY, hi = this.maxY;
    const gallery = this.galleryOn();
    const side = this.sideRule();
    const closeness = (x: number, y: number) => {
      // (parts of the page where she belongs on one side: the tech stack and the end, on the right)
      const sided = side.find((r) => y >= r.top && y - 2.4 * S <= r.bottom);
      const pref = !sided ? 1 : (sided.side === "right") === x > this.W * 0.55 ? 3 : 0.04;
      if (!near) return pref;
      const d = Math.hypot(x - this.cx, y - this.cy);
      return pref * Math.pow(1.6 - Math.min(1.5, d / (this.W * 0.5)), 2);
    };
    for (const p of this.w.perches) {
      if (p.el === this.lastSpotEl && Math.random() < 0.6) continue;
      const top = p.top - 1.02 * S;
      if (top < lo || top > hi) continue;
      // (live position: the gallery moves between scans)
      const r = this.w.rectOf(p.el);
      if (!r || r.right < 2 * S || r.left > this.W - 2 * S) continue;
      // In the sliding gallery, cards further right stay on screen longer: she prefers those, so she rides
      // along instead of hopping onto one that's about to leave.
      const ahead = gallery && p.el.closest(".work-track") ? 0.3 + clamp(r.left / this.W, 0, 1.2) * 1.4 : 1;
      for (const f of [0.08, 0.92, Math.random()]) {
        const sp: Spot = { el: p.el, f, docY: 0, x: 0 };
        const pos = this.spotPos(sp);
        if (!pos.ok || this.avoid(pos.x, pos.y) || this.blocked(pos.x, pos.y) || !this.offEdge(pos.x)) continue;
        cand.push([sp, ahead * closeness(pos.x, pos.y) * (f === 0.08 || f === 0.92 ? 1.3 : 0.6)]);
      }
    }
    // free space anywhere on screen (margins, gaps), pinned to the section it's in
    // (a fine grid, so she finds the gaps between things too)
    const cols = this.W < 700 ? [0.1, 0.3, 0.5, 0.7, 0.9] : [0.04, 0.1, 0.16, 0.24, 0.32, 0.4, 0.5, 0.6, 0.68, 0.76, 0.84, 0.9, 0.96];
    const rows = 11;
    let best: { sp: Spot; o: number } | null = null;
    const m = this.edgeGap() + 1.95 * S;
    for (const fx of cols) {
      const x = clamp(fx * this.W, m, this.W - m);
      for (let i = 0; i < rows; i++) {
        const y = lo + ((Math.max(lo + 10, hi) - lo) * i) / (rows - 1);
        if (this.avoid(x, y)) continue;
        const sp: Spot = { el: null, f: 0, x, docY: y + this.w.scrollY, anchor: this.sectionAt(y) };
        const o = this.covers(x, y);
        if (o > 0) {
          // (crowded: remember the spot that covers least, leaning to her preferred side)
          const score = o / closeness(x, y);
          if (!best || score < best.o) best = { sp, o: score };
          continue;
        }
        // (the edges of the screen are the most out of the way)
        const edge = fx <= 0.12 || fx >= 0.88 ? 1.5 : 1;
        cand.push([sp, closeness(x, y) * edge * 0.9]);
      }
    }
    // Nowhere completely free (a crowded phone screen): the spot that covers the least.
    if (!cand.length) return best?.sp ?? null;
    const s = weighted(cand);
    this.lastSpotEl = s.el;
    return s;
  }

  // ================================================================ start
  start() {
    this.t = 0;
    this.resize();
    // She drifts in from above the top right, lying on her back.
    this.cx = this.W * 0.78;
    this.cy = -2.5 * this.S;
    this.x = this.cx;
    this.y = this.cy;
    this.mode = "enter";
    this.setPose("Lie_Back");
    this.spot = this.pickHero() ?? this.pickSpot(false);
  }
  private pickHero(): Spot | null {
    const p = this.w.perches.find((p) => (p.el as HTMLElement).classList?.contains("hero-title"));
    if (!p) return null;
    const s: Spot = { el: p.el, f: 0.86, docY: 0, x: 0 };
    if (!this.spotVisible(s)) return null;
    const pos = this.spotPos(s);
    return this.blocked(pos.x, pos.y) || !this.offEdge(pos.x) ? null : s;
  }
  private resize() {
    this.S = clamp(Math.min(this.W, this.H * 1.2) / 30, 24, 40);
  }

  // ================================================================ pointer (from the stage)
  pointerDown(x: number, y: number, zone: Zone) {
    if (this.mode === "away" || this.mode === "hop" || this.mode === "air") return;
    this.press = { x, y, t: this.t, zone };
    this.w.input = this.w.now;
  }
  // (She can't be picked up: a press on her is a poke, even if the pointer wanders a little.)
  pointerUp(x: number, y: number) {
    const p = this.press;
    this.press = null;
    if (p && Math.hypot(x - p.x, y - p.y) < 24) this.poke(p.zone);
  }
  hover(x: number, y: number) {
    const h = this.geo.head;
    if (Math.hypot(x - h.x, y - h.y) > h.r * 1.05) return;
    const t = this.t;
    this.hoverPts.push({ x, y, t });
    this.hoverPts = this.hoverPts.filter((p) => t - p.t < 1.2);
    let turns = 0, len = 0;
    for (let i = 2; i < this.hoverPts.length; i++) {
      const a = this.hoverPts[i - 2], b = this.hoverPts[i - 1], c = this.hoverPts[i];
      const d1 = b.x - a.x, d2 = c.x - b.x;
      if (Math.abs(d1) > 2 && Math.abs(d2) > 2 && Math.sign(d1) !== Math.sign(d2)) turns++;
      len += Math.hypot(c.x - b.x, c.y - b.y);
    }
    if (turns >= 3 && len > 90) this.pet();
  }
  doubleClick() {
    if (!this.grounded()) return;
    if (this.annoy > 0.6) {
      this.say("noDance", 1, true);
      this.face("annoyed", 1.5);
      return;
    }
    this.sitUp();
    this.danceUntil = this.t + 4.5;
    this.say("dance", 0.8);
  }
  contextMenu() {
    this.say("menu", 1, true);
    this.face("annoyed", 1.5);
  }

  // ================================================================ reactions
  /** `quiet`: woken by her own voice (she's about to say something anyway, so no "i was awake."). */
  private wake(quiet = false) {
    if (!this.sleeping) return false;
    this.sleeping = false;
    this.routine = null;
    this.setPose("Sit_Idle");
    this.play("Poke");
    this.face("surprised", 0.8);
    this.said.wakeAt = this.t;
    if (!quiet) this.say("wake", 1, true);
    return true;
  }
  private poke(zone: Zone) {
    this.w.input = this.w.now;
    if (!this.grounded()) return;
    // (she's already made up her mind to leave: more pokes don't keep her here)
    if (this.leaveAt) return;
    if (zone === "cloud") {
      this.cSquashV += 7;
      this.say("cloud", 0.6);
      if (!this.lying() && !this.sleeping) this.play("Poke");
      return;
    }
    if (this.wake()) return;
    this.sitUp();
    this.pokes = this.pokes.filter((t) => this.t - t < 4);
    this.pokes.push(this.t);
    const n = this.pokes.length;
    this.annoy = Math.min(1, this.annoy + 0.18);
    if (zone === "ear") {
      this.play("Sit_EarFlick");
      this.face(n > 2 ? "angry" : "annoyed", 2);
      this.say("ear", 0.9, n > 1);
      return;
    }
    if (zone === "feet") {
      this.play("Poke");
      this.face("squint", 1.2);
      this.say("feet", 0.8);
      return;
    }
    if (n <= 1) {
      this.play("Poke");
      this.face("annoyed", 1.6);
      this.say(zone === "body" ? "belly" : "poke1", 0.6);
    } else if (n === 2) {
      this.play("Poke");
      this.face("annoyed", 2);
      this.say("poke2", 0.9, true);
    } else if (n === 3) {
      this.play("Shrug");
      this.face("smug", 2);
      this.say("poke3", 1, true);
    } else if (n <= 5) {
      this.play("Stomp");
      this.face("angry", 2.6);
      this.say("poke4", 1, true);
    } else {
      this.play("Stomp");
      this.face("angry", 3);
      this.say("leave", 1, true);
      this.leaveAt = this.t + 1.1;
    }
    // afterwards: sulk for a bit
    if (n >= 2) this.routine = { name: "sulk", i: -1, until: this.t + (this.durations[this.oneshot?.name ?? ""] ?? 1) };
  }
  private pet() {
    if (!this.grounded() || this.busy()) return;
    if (this.wake()) return;
    if (!this.petting) {
      this.sitUp();
      this.petting = this.t;
      this.say(this.like > 0.5 ? "petLike" : "pet", 0.6);
    }
    this.petUntil = this.t + 0.9;
    this.like = Math.min(1, this.like + 0.004);
    this.annoy = Math.max(0, this.annoy - 0.01);
  }

  // ================================================================ held: she hangs from where you grabbed her
  private grab(x: number, y: number, zone: Zone) {
    if (this.mode === "away" || this.mode === "hop" || this.mode === "air") return;
    this.wake();
    this.routine = null;
    const S = this.S;
    // where you grabbed, relative to her seat, in her own (upright) frame: x right, y up
    const rx = x - this.x, ry = this.y - y;
    // her middle (centre of mass) sits about 1.5 units above the seat
    const dx = 0 - rx, dy = 1.5 * S - ry;
    const L = Math.max(1.2 * S, Math.hypot(rx, ry), Math.hypot(dx, dy));
    // How she hangs: by an ear, tilted so her weight is under it; by the head or round the middle, upright with
    // her limbs dangling; by the feet, upside down.
    const psi0 = zone === "feet" ? Math.PI : zone === "ear" ? clamp(-Math.PI / 2 - Math.atan2(dy, dx), -0.9, 0.9) : 0;
    this.mode = "held";
    this.perch = null;
    this.oneshot = null;
    this.held = {
      psi: 0, omega: 0, psi0, L, rx, ry, grip: zone,
      px: x, py: y, lx: x, ly: y, pvx: 0, pvy: 0, ax: 0, flips: [], lastSign: 0, since: this.t, saidLong: false,
    };
    // the cloud stays where it is
    this.cvx = this.cvy = 0;
    this.out.grabbing = true;
    const lines: Record<Zone, LineKey> = { ear: "grabEar", head: "held", body: "grabBody", feet: "grabFeet", cloud: "held" };
    this.say(lines[zone], 0.85, true);
    this.face(zone === "ear" ? "angry" : zone === "feet" ? "surprised" : "annoyed", 999);
  }
  private release() {
    this.out.grabbing = false;
    this.exprOverride = null;
    const h = this.held;
    const shaken = h.flips.filter((t) => this.t - t < 1.4).length >= 4;
    this.vx = clamp(h.pvx, -3000, 3000);
    this.vy = clamp(h.pvy, -3000, 3000);
    const speed = Math.hypot(this.vx, this.vy);
    this.spin = clamp(h.omega, -12, 12) + (speed > 1300 ? clamp(this.vx / 320, -10, 10) : 0);
    this.roll = h.psi;
    this.mode = "air";
    this.cloudChase = Math.random() < 0.85;
    if (shaken) {
      this.dizzyUntil = -1; // dizzy once she lands
      this.say("shaken", 1, true);
    } else if (speed > 1300) this.say("thrown", 0.6);
  }
  private heldFrame(dt: number) {
    const h = this.held;
    const step = Math.max(dt, 1 / 240);
    const vx = (h.px - h.lx) / step, vy = (h.py - h.ly) / step;
    const ax = (vx - h.pvx) / step;
    h.pvx = h.pvx * 0.5 + vx * 0.5;
    h.pvy = h.pvy * 0.5 + vy * 0.5;
    h.lx = h.px;
    h.ly = h.py;
    h.ax = h.ax * 0.7 + ax * 0.3;
    // pendulum around the point you're holding
    // First she swings round into how she'll hang (a quick, smooth turn: upside down if you've got her
    // feet), then she's a pendulum.
    if (this.t - h.since < 0.45) {
      h.psi += (h.psi0 - h.psi) * (1 - Math.exp(-dt * 9));
      h.omega = 0;
    }
    const g = 2600, phi = h.psi - h.psi0;
    h.omega += (-(g / h.L) * Math.sin(phi) - (clamp(h.ax, -20000, 20000) / h.L) * Math.cos(phi) - 2.4 * h.omega) * dt;
    h.omega = clamp(h.omega, -9, 9);
    // a swing, never a loop over your hand
    const lim = 1.25;
    const np = h.psi - h.psi0 + h.omega * dt;
    if (this.t - h.since < 0.45) {
      // (still turning into place)
    } else if (Math.abs(np) > lim) {
      h.psi = h.psi0 + Math.sign(np) * lim;
      h.omega *= -0.2;
    } else h.psi += h.omega * dt;
    const sgn = Math.abs(h.pvx) > 700 ? Math.sign(h.pvx) : 0;
    if (sgn && sgn !== h.lastSign) {
      h.flips.push(this.t);
      h.lastSign = sgn;
    }
    // her seat: the grab point rotated with her, hanging from your hand
    const c = Math.cos(h.psi), s = Math.sin(h.psi);
    const rxr = h.rx * c - h.ry * s, ryr = h.rx * s + h.ry * c;
    this.x = h.px - rxr;
    this.y = h.py + ryr;
    this.roll = h.psi;
    this.pose = h.grip === "feet" ? "Fall" : "Dangle";
    if (!h.saidLong && this.t - h.since > 6) {
      h.saidLong = true;
      this.say("heldLong", 0.9);
    }
    // the cloud waits where it was (just drifting a little)
    this.cvx *= Math.exp(-dt * 3);
    this.cvy *= Math.exp(-dt * 3);
    this.cx += this.cvx * dt;
    this.cy += this.cvy * dt;
  }

  // ================================================================ the frame
  update(dt: number) {
    this.t += dt;
    const S0 = this.S;
    this.resize();
    if (S0 !== this.S && this.mode === "perch") this.fall();
    this.annoy = Math.max(0, this.annoy - dt * 0.04);
    this.energy = clamp(this.energy + dt * (this.sleeping ? 0.02 : -0.002) - this.w.night * dt * 0.002, 0, 1);
    this.handleEvents();
    const idle = this.w.now - this.w.input;
    this.scrollFrame(dt, idle);

    switch (this.mode) {
      case "enter":
      case "ride":
        this.rideFrame(dt, idle);
        break;
      case "perch":
        this.perchFrame(dt, idle);
        break;
      case "held":
        this.heldFrame(dt);
        break;
      case "air":
        this.airFrame(dt);
        break;
      case "hop":
        this.hopFrame(dt);
        break;
      case "away":
        this.awayFrame(dt);
        break;
    }
    if (this.mode !== "held" && this.mode !== "air") {
      // straighten up (the short way round)
      const r = Math.atan2(Math.sin(this.roll), Math.cos(this.roll));
      this.roll = r * Math.exp(-dt * 7);
    }
    this.cSquashV += (-110 * this.cSquash - 10 * this.cSquashV) * dt;
    this.cSquash += this.cSquashV * dt;
    if (this.leaveAt && this.t > this.leaveAt) {
      this.leaveAt = 0;
      this.goAway();
    }
    if (!this.saidStill && this.t > 200 && idle < 20) {
      this.saidStill = true;
      this.say("stillHere", 1);
    }
    this.voiceFrame();
    this.compose(dt, idle);
  }

  private handleEvents() {
    for (const e of this.w.take()) {
      switch (e.type) {
        case "resize":
          if (this.mode === "perch") this.fall();
          else if (this.mode === "ride" && !this.lying()) {
            this.holdOnUntil = this.t + 1;
            this.sayEvery("resize", 30, 0.6);
          }
          break;
        case "theme":
          if (!this.grounded()) break;
          this.sitUp();
          if (e.night) {
            this.play("Sit_Yawn");
            this.face("yawn", 1.6);
            this.say("night", 0.9);
          } else {
            this.face("squint", 1.6);
            this.say("day", 0.9);
          }
          break;
        case "hidden":
          if (e.hidden) {
            if (this.mode === "ride") {
              this.sleeping = true;
              this.routine = null;
              this.setPose("Sleep_Lie");
            }
          } else if (e.away > 6) {
            this.said.wokeBack = this.t;
            this.pendingBack = this.t + 0.6;
          }
          break;
        case "music":
          this.musicSince = this.t;
          if (e.on) {
            this.say("musicOn", 0.5);
            if (this.mode === "ride" && !this.sleeping) this.routine = { name: "music", i: -1, until: 0 };
          } else {
            this.say("musicOff", 0.35);
            if (this.pose === "HeadBob" || this.pose === "Dance") {
              this.setPose("Sit_Idle");
              this.routine = null;
            }
          }
          break;
        case "select":
          this.poi = { x: e.x, y: e.y, until: this.t + 3 };
          this.sayEvery("select", 25, 0.5);
          break;
        case "copy":
          this.sayEvery("copy", 30, 0.9);
          this.face("smug", 1.8);
          break;
        case "key":
          this.keyTimes = this.keyTimes.filter((t) => this.t - t < 3);
          this.keyTimes.push(this.t);
          if (this.keyTimes.length > 8) this.sayEvery("typing", 45, 0.8);
          break;
        case "konami":
          if (!this.grounded()) break;
          this.sitUp();
          this.danceUntil = this.t + 8;
          this.say("dance", 1, true);
          break;
        case "link":
          this.poi = { x: e.x, y: e.y, until: this.t + (e.media ? 2.6 : 1.6) };
          if (e.media && this.grounded() && !this.sleeping) this.sayEvery("project", 35, 0.4);
          break;
        case "click": {
          const d = Math.hypot(e.x - this.x, e.y - (this.y - 1.6 * this.S));
          if (d > 2.6 * this.S && d < 10 * this.S) this.poi = { x: e.x, y: e.y, until: this.t + 1.2 };
          if (this.sleeping && d < 5 * this.S && d > 2.6 * this.S) this.wake();
          break;
        }
        case "section":
          this.onSection(e.name);
          break;
      }
    }
  }
  private pendingBack = 0;

  private onSection(name: string) {
    const first = !this.sections.has(name);
    this.sections.add(name);
    if (this.mode !== "ride" || this.sleeping) return;
    if (name === "hero" && !first && this.sections.size > 2) this.sayEvery("backTop", 60, 0.7);
    if (!first) return;
    if (name === "intro") this.say("intro", 0.6);
    if (name === "work") this.say("work", 0.9);
    if (name === "contact") {
      this.sitUp();
      this.play("Point");
      this.say("contact", 1, true);
    }
  }

  // ================================================================ the cloud's motion
  /** A damped spring toward a point, with a speed limit. */
  private cloudToward(tx: number, ty: number, dt: number, k = 5, maxV = 420) {
    const c = 2 * Math.sqrt(k) * 0.95;
    this.cvx += (k * (tx - this.cx) - c * this.cvx) * dt;
    this.cvy += (k * (ty - this.cy) - c * this.cvy) * dt;
    const v = Math.hypot(this.cvx, this.cvy);
    if (v > maxV) {
      this.cvx *= maxV / v;
      this.cvy *= maxV / v;
    }
    this.cx += this.cvx * dt;
    this.cy += this.cvy * dt;
  }
  /** Racing somewhere: accelerates hard, brakes in time (an arrival controller), believable top speed. */
  private cloudRace(tx: number, ty: number, dt: number, vmax = 1500, acc = 7000) {
    const dx = tx - this.cx, dy = ty - this.cy;
    const d = Math.hypot(dx, dy);
    const want = Math.min(vmax, Math.sqrt(2 * acc * 0.8 * d), d * 14);
    const wx = d > 0.01 ? (dx / d) * want : 0, wy = d > 0.01 ? (dy / d) * want : 0;
    const ex = wx - this.cvx, ey = wy - this.cvy;
    const e = Math.hypot(ex, ey), a = Math.min(e, acc * dt);
    if (e > 0.001) {
      this.cvx += (ex / e) * a;
      this.cvy += (ey / e) * a;
    }
    this.cx += this.cvx * dt;
    this.cy += this.cvy * dt;
  }

  // ================================================================ watching you scroll
  private sc = {
    dir: 0, flips: [] as number[], level: 0, levelAt: 0, runSince: 0, runDist: 0, runSaid: false,
    still: 0, total: 0, stopPending: false, slow: 0, wasBottom: false, bottomSaid: false, lastY: -1, sleepDist: 0,
  };
  private scrollFrame(dt: number, idle: number) {
    const sc = this.sc, w = this.w, t = this.t;
    const y = w.scrollY, v = w.scrollV;
    const dy = sc.lastY < 0 ? 0 : Math.abs(y - sc.lastY);
    sc.lastY = y;
    const moving = Math.abs(v) > 120 && dy > 0.2;
    const seated = this.grounded() || this.mode === "enter";
    const ground = seated && !this.busy();
    if (moving) {
      const d = Math.sign(v);
      if (d !== sc.dir) {
        if (sc.dir) sc.flips.push(t);
        sc.dir = d;
        sc.runSince = t;
        sc.runDist = 0;
        sc.runSaid = false;
      }
      sc.runDist += dy;
      sc.total += dy;
      sc.still = 0;
      if (Math.abs(v) < 450) sc.slow += dt;
      else sc.slow = Math.max(0, sc.slow - dt * 2);
      // she follows the page with her eyes: down when you scroll down, up when you scroll up
      if (t - sc.runSince > 0.35 && seated && !this.sleeping)
        this.poi = { x: this.x + d * 40, y: this.y + d * 320, until: t + 0.5 };
      // the page moves under her: she wakes up (a real scroll, not a nudge)
      if (this.sleeping) {
        sc.sleepDist += Math.abs(dy);
        if (sc.sleepDist > this.H * 0.25) {
          sc.sleepDist = 0;
          this.wake();
        }
      }
    } else {
      sc.still += dt;
      sc.slow = Math.max(0, sc.slow - dt * 0.5);
    }
    if (sc.still > 1.2) sc.sleepDist = 0;
    sc.flips = sc.flips.filter((f) => t - f < 9);
    if (this.mode === "held" && moving) this.sayEvery("heldScroll", 25, 0.6);
    if (this.sleeping || !seated) return;

    // back and forth, back and forth: puzzled, then seasick, then fed up
    const n = sc.flips.length;
    const want = n >= 14 ? 4 : n >= 10 ? 3 : n >= 6 ? 2 : n >= 3 ? 1 : 0;
    if (want > sc.level && t - sc.levelAt > 1.6) {
      sc.level++;
      sc.levelAt = t;
      this.sitUp();
      if (sc.level === 1) {
        this.play("Shrug");
        this.face("squint", 2.5);
        this.say("scrollFlip", 1, true);
      } else if (sc.level === 2) {
        this.play("Dizzy");
        this.say("seasick", 1, true);
        this.annoy = clamp(this.annoy + 0.2, 0, 1);
      } else if (sc.level === 3) {
        this.play("Stomp");
        this.face("angry", 3);
        this.say("scrollAngry", 1, true);
        this.annoy = clamp(this.annoy + 0.3, 0, 1);
      } else {
        this.setPose("Sit_Hmph");
        this.routine = { name: "sulk", i: 0, until: t + rnd(6, 9) };
        this.say("scrollSulk", 1, true);
        this.annoy = clamp(this.annoy + 0.3, 0, 1);
      }
    }
    if (sc.level && !n && t - sc.levelAt > 3) {
      if (sc.level >= 2 && sc.still > 1) {
        this.play("Sit_Sigh");
        this.say("scrollCalm", 0.9, true);
      }
      sc.level = 0;
    }
    if (sc.level) return;

    // a long ride in one direction
    if (moving && !sc.runSaid && sc.runDist > this.H * 2.2) {
      sc.runSaid = true;
      sc.stopPending = true;
      if (ground) {
        if (sc.dir > 0) this.say("scrollLong", 0.55);
        else {
          this.play("Sit_LookUp");
          this.say("scrollUp", 0.6);
        }
      }
    }
    // ...and where it stops
    if (sc.stopPending && sc.still > 0.9) {
      sc.stopPending = false;
      if (ground && !this.lying()) {
        this.play("Sit_Look");
        this.say("scrollStop", 0.5);
      }
    }
    // scrolling slowly for a while: she notices you're actually reading
    if (sc.slow > 7 && ground) {
      sc.slow = 0;
      this.sayEvery("reading", 70, 0.7);
    }
    // the end of the page, and all the way back up
    const docH = typeof document !== "undefined" ? document.documentElement.scrollHeight : 0;
    const bottom = docH > this.H * 1.5 && y + this.H >= docH - 6;
    if (bottom && !sc.bottomSaid && sc.still > 0.4) {
      sc.bottomSaid = true;
      sc.wasBottom = true;
      if (ground) {
        this.sitUp();
        this.play(Math.random() < 0.5 ? "Shrug" : "Point");
        this.say("bottom", 1, true);
      }
    }
    if (y < this.H * 0.6) sc.bottomSaid = false;
    if (sc.wasBottom && y < 4 && sc.still > 0.4) {
      sc.wasBottom = false;
      if (ground) {
        this.play("Sit_Sigh");
        this.say("allTheWayUp", 0.9, true);
      }
    }
    // the page moves again after a long quiet spell
    if (moving && idle < 0.5 && sc.still === 0 && (this.said.quietScroll ?? -1e9) + 60 < t && this.lastQuiet > 40) {
      this.said.quietScroll = t;
      this.say("movingAgain", 0.6);
    }
    this.lastQuiet = moving ? 0 : this.lastQuiet + dt;
  }
  private lastQuiet = 0;

  // ================================================================ riding
  private rideFrame(dt: number, idle: number) {
    const S = this.S;
    // where the cloud is headed; a new spot once the old one has scrolled away
    // Something slid under her spot (the gallery moving, content animating in): she moves to free space. (Twice
    // in a row, a moment apart, so a passing animation doesn't send her off.)
    // (Only once the page has been still for a moment, and the spot stays covered for over a second: no
    // reacting to things in motion.)
    if (this.spot && this.t > this.freeCheckAt) {
      this.freeCheckAt = this.t + 0.4;
      const p = this.spotPos(this.spot);
      const still = this.sc.still > 0.6;
      this.coveredCount = still && p.ok && this.blocked(p.x, p.y) ? this.coveredCount + 1 : 0;
      if (this.coveredCount >= 3) {
        this.coveredCount = 0;
        const s = this.pickSpot(true);
        if (s) this.spot = s;
      }
    }
    if (!this.spot || !this.spotVisible(this.spot)) {
      const was = this.spot;
      this.spot = this.pickSpot(true);
      if (was && this.spot && !this.sleeping) {
        const p = this.spotPos(this.spot);
        if (this.cy < -S || this.cy > this.H + S) this.cx = clamp(this.cx, 2 * S, this.W - 2 * S);
        // carried off by the scroll: she drifts back in, lying back, unbothered
        if (Math.abs(p.y - this.cy) > this.H * 0.4 && !this.busy() && Math.random() < 0.7) {
          this.routine = null;
          this.setPose("Lie_Back");
          this.arriveLook = true;
        }
      }
    }
    if (this.spot) {
      const p = this.spotPos(this.spot);
      const far = Math.hypot(p.x - this.cx, p.y - this.cy);
      // Long trips (across a big part of the screen, or catching up after a scroll) are one smooth glide:
      // eased in and out (no jerk at the start or the landing), about 1.1 s to 1.7 s depending on the
      // distance. Short hops stay soft and floaty.
      const big = Math.min(this.W, this.H) * 0.35;
      if (this.glide && this.glide.spot !== this.spot) this.glide = null; // (new destination: start over from here)
      if (!this.glide && far > big) {
        this.glide = { spot: this.spot, sx: this.cx, sy: this.cy, t0: this.t, T: clamp(0.8 + far / 1400, 1.1, 1.8) };
      }
      if (this.glide) {
        const gl = this.glide;
        const u = clamp((this.t - gl.t0) / gl.T, 0, 1);
        const e = u * u * u * (u * (6 * u - 15) + 10); // smootherstep
        const nx = gl.sx + (p.x - gl.sx) * e, ny = gl.sy + (p.y - gl.sy) * e;
        this.cvx = (nx - this.cx) / Math.max(dt, 1e-3);
        this.cvy = (ny - this.cy) / Math.max(dt, 1e-3);
        this.cx = nx;
        this.cy = ny;
        if (u >= 1) {
          this.glide = null;
          this.cvx = this.cvy = 0;
        }
      } else this.cloudToward(p.x, p.y, dt, 6, 520);
      if (far < 10 && this.arriveLook) {
        this.arriveLook = false;
        this.setPose("Sit_Idle");
        this.play("Sit_Look");
        this.routine = null;
      }
      if (this.mode === "enter" && far < 6) {
        this.mode = "ride";
        this.setPose("Sit_Idle");
        if (!this.sc.level) {
          this.play("Wave");
          this.say("hello", 1, true);
        }
        this.nextTravelAt = this.t + rnd(60, 110);
        this.said.scrollHint = this.t;
      }
    }
    // she shuffles back to the middle of the cloud
    this.seatDx *= Math.exp(-dt * 5);
    this.x = this.cx + this.seatDx;
    this.y = this.cy;
    if (this.mode !== "ride") return;
    if (this.said.scrollHint && this.sc.total < 50 && this.t - this.said.scrollHint > 4.5 && this.t - this.said.scrollHint < 5) {
      this.said.scrollHint = 0;
      this.say("scrollTop", 1);
    }
    if (this.pendingBack && this.t > this.pendingBack) {
      this.pendingBack = 0;
      if (this.wake()) {
        this.play("Wave");
        this.say("awayBack", 1, true);
      }
    }
    // scrolling hard: she holds on; way too hard and she's flung off
    const sv = Math.abs(this.w.scrollV);
    if (sv > 2600 && !this.lying() && !this.sleeping) {
      this.holdOnUntil = this.t + 0.5;
      this.sayEvery("scrollFast", 25, 0.7);
      if (sv > 7000 && (this.said.fellOff ?? -1e9) + 30 < this.t && Math.random() < 0.02) {
        this.said.fellOff = this.t;
        this.vx = rnd(-200, 200);
        this.vy = -Math.sign(this.w.scrollV) * 500;
        this.mode = "air";
        this.cloudChase = true;
        this.say("fellOff", 1, true);
        return;
      }
    }
    // naps
    if (!this.sleeping && !this.w.reduced && !this.busy() && (idle > 80 || (this.w.night > 0.5 && idle > 50) || this.energy < 0.1)) {
      this.routine = { name: "sleepy", i: -1, until: 0 };
    }
    if (this.sleeping) {
      const p = this.w.pointer;
      if (this.w.now - p.moved < 0.2 && Math.hypot(p.x - this.x, p.y - this.y) < 4 * S && Math.hypot(p.vx, p.vy) > 900) this.wake();
      return;
    }
    if (this.w.reduced) {
      if (!this.busy()) this.pose = "Sit_Idle";
      return;
    }
    // petting ends when the hand stops
    if (this.petting && this.t > this.petUntil) {
      if (this.t - this.petting > 2.5) this.say(this.like > 0.5 ? "petEndLike" : "petEnd", 0.6);
      this.petting = 0;
    }
    // the cursor hanging around near her: she notices, ear twitch, a glance
    const p = this.w.pointer;
    const near = p.inside && Math.hypot(p.x - this.x, p.y - (this.y - 1.6 * S)) < 4.5 * S;
    if (near) {
      if (!this.nearSince) this.nearSince = this.t;
      if (this.t - this.nearSince > 2.2 && !this.busy() && !this.lying() && !this.petting && (this.said.near ?? -1e9) + 15 < this.t) {
        this.said.near = this.t;
        this.play(Math.random() < 0.5 ? "Sit_EarFlick" : "Poke");
        this.say("hover", 0.4);
      }
    } else this.nearSince = 0;

    if (!this.petting && !this.busy()) this.runRoutine(idle);
    // wander to somewhere else now and then (not mid-nap or mid-lounge)
    if (this.t > this.nextTravelAt && !this.petting && !this.lying()) {
      this.nextTravelAt = this.t + rnd(60, 120);
      const s = this.pickSpot(true);
      if (s) this.spot = s;
    }
  }
  private arriveLook = false;

  private pickRoutine(idle: number) {
    const bored = clamp(idle / 60, 0, 1);
    const night = this.w.night;
    const music = this.w.music;
    const pointerActive = this.w.now - this.w.pointer.moved < 2;
    return weighted<string>([
      ["chill", 2.2 * (1 - bored) + 0.4],
      ["lounge", 1.2 + bored * 0.8],
      ["groom", 1],
      ["bored", bored * 2.4],
      ["sleepy", (1 - this.energy) * 2 + (bored > 0.85 ? 2 : 0)],
      ["stargaze", night > 0.5 ? 2.5 : 0],
      ["sulk", this.annoy > 0.4 ? 3 : 0],
      ["music", music ? 6 : 0],
      ["watch", pointerActive ? 1.4 : 0.2],
    ]);
  }
  private runRoutine(idle: number): void {
    const r = this.routine;
    if (r && this.t < r.until) return;
    if (!r || r.i + 1 >= ROUTINES[r.name].length) {
      const name = this.pickRoutine(idle);
      this.routine = { name, i: -1, until: 0 };
      return this.runRoutine(idle);
    }
    r.i++;
    const st = ROUTINES[r.name][r.i];
    if (st.pose) {
      this.setPose(st.pose);
      if (st.pose === "Sleep_Lie") this.sleeping = true;
      if (st.pose === "Dance") this.danceUntil = 0;
      r.until = this.t + (st.dur ? rnd(st.dur[0], st.dur[1]) : 6);
    } else if (st.once) {
      if (this.lying()) this.setPose("Sit_Idle");
      this.play(st.once);
      r.until = this.t + (this.durations[st.once] ?? 1) + 0.3;
    }
    if (st.face) this.face(st.face, 1.8);
    if (st.say) this.say(st.say, st.chance ?? 1);
  }

  // ================================================================ sitting on the page itself
  private startHop(to: "cloud" | "perch", px: number, py: number, el: Element | null) {
    this.mode = "hop";
    this.routine = null;
    this.setPose("Sit_Idle");
    const d = Math.hypot(px - this.x, py - this.y);
    this.hop = { t: 0, T: 0.5 + d / 1500, x0: this.x, y0: this.y, to, px, py, el };
    this.play("Jump");
  }
  private hopFrame(dt: number) {
    const h = this.hop;
    if (!h) {
      this.mode = "ride";
      return;
    }
    h.t += dt;
    const crouch = 0.22;
    let tx = h.px, ty = h.py;
    if (h.to === "cloud") {
      tx = this.cx;
      ty = this.cy;
    } else if (h.el) {
      const r = this.w.rectOf(h.el);
      if (r) ty = r.top;
    }
    if (h.t < crouch) return;
    const u = clamp((h.t - crouch) / h.T, 0, 1);
    const lift = 1.4 * this.S + Math.hypot(tx - h.x0, ty - h.y0) * 0.25;
    this.x = h.x0 + (tx - h.x0) * u;
    this.y = h.y0 + (ty - h.y0) * u - lift * 4 * u * (1 - u);
    this.pose = "Air";
    this.oneshot = null;
    if (h.to === "perch") this.cloudToward(this.cx + 30 * Math.sign(this.cx - tx || 1), this.cy, dt, 2, 200);
    if (u >= 1) {
      this.hop = null;
      if (h.to === "cloud") this.landOnCloud(500);
      else this.landOnPerch(h.el, 400);
    }
  }
  private landOnPerch(el: Element | null, impact: number) {
    this.mode = "perch";
    this.vx = this.vy = 0;
    this.spin = 0;
    let dx = this.x;
    if (el) {
      const r = this.w.rectOf(el);
      if (r) dx = this.x - r.left;
    }
    this.perch = { el, dx };
    this.landing(impact, false);
    this.perchUntil = this.t + rnd(7, 15);
  }
  private perchFrame(dt: number, idle: number) {
    const S = this.S;
    const p = this.perch;
    if (p?.el) {
      const r = this.w.rectOf(p.el);
      if (!r || r.top < this.minY - 4 * S || r.top > this.H + 4 * S || p.dx < -S || p.dx > r.width + S) return this.fall();
      this.x = r.left + p.dx;
      this.y = r.top;
      const edge = p.dx < 1.3 * S || p.dx > r.width - 1.3 * S;
      if (!this.busy()) this.pose = edge ? "Sit_Edge" : this.w.music ? "HeadBob" : this.annoy > 0.4 ? "Sit_Hmph" : "Sit_Idle";
    } else {
      this.y = this.H - 2;
      if (!this.busy()) this.pose = this.annoy > 0.4 ? "Sit_Hmph" : "Sit_Idle";
    }
    if (this.petting && this.t > this.petUntil) this.petting = 0;
    // the cloud comes over and waits beside her; then she hops back on
    const side = this.x > this.W / 2 ? -1 : 1;
    const wx = clamp(this.x + side * 2.6 * S, 2 * S, this.W - 2 * S);
    const wy = clamp(this.y - 0.2 * S, this.minY, this.maxY);
    this.cloudRace(wx, wy, dt, 900, 3000);
    if (!this.busy() && this.t > this.perchUntil - 4 && idle > 2 && Math.random() < 0.01) {
      this.play(weighted<string>([["Sit_Look", 2], ["Sit_EarFlick", 1], ["Peek", 1.2], ["Sit_Sigh", 0.6]]));
    }
    if (this.t > this.perchUntil && !this.busy() && !this.petting && Math.hypot(this.cx - wx, this.cy - wy) < 24) {
      this.perch = null;
      this.startHop("cloud", this.cx, this.cy, null);
    }
  }
  private fall() {
    this.mode = "air";
    this.perch = null;
    this.vx = rnd(-60, 60);
    this.vy = -120;
    this.spin = 0;
    this.cloudChase = true;
  }

  // ================================================================ flying through the air
  private airFrame(dt: number) {
    const S = this.S;
    const g = 2400;
    const py = this.y;
    this.vy += g * dt;
    this.vx *= Math.exp(-dt * 0.35);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.roll += this.spin * dt;
    this.spin *= Math.exp(-dt * 0.5);
    const m = 1.3 * S;
    if (this.x < m) {
      this.x = m;
      this.vx = Math.abs(this.vx) * 0.45;
      this.spin *= -0.6;
    }
    if (this.x > this.W - m) {
      this.x = this.W - m;
      this.vx = -Math.abs(this.vx) * 0.45;
      this.spin *= -0.6;
    }
    if (this.y < -this.H * 0.6) {
      this.y = -this.H * 0.6;
      this.vy = Math.abs(this.vy) * 0.3;
    }
    this.pose = Math.abs(this.spin) > 2.5 ? "Tumble" : "Fall";
    // once the spin has died down she rights herself on the way down (cats do it, so can she)
    if (Math.abs(this.spin) < 3) {
      const r = Math.atan2(Math.sin(this.roll), Math.cos(this.roll));
      this.roll = r * Math.exp(-dt * (this.vy > 0 ? 6 : 2.5));
      this.spin *= Math.exp(-dt * 3);
    }
    // the cloud races to where she'll be when she comes down to its height
    if (this.y > this.H * 0.5) this.cloudChase = true;
    if (this.cloudChase) {
      const catchY = clamp(Math.max(this.y + 1.5 * S, this.cy), this.minY, this.maxY);
      // time until she falls to catchY (solve y + vy t + g t²/2 = catchY)
      const dy = catchY - this.y;
      const tFall = dy > 0 ? (-this.vy + Math.sqrt(Math.max(0, this.vy * this.vy + 2 * g * dy))) / g : 0.05;
      const tx = clamp(this.x + this.vx * Math.min(tFall, 1.2), 2 * S, this.W - 2 * S);
      this.cloudRace(tx, catchY, dt);
    } else {
      this.cvx *= Math.exp(-dt * 2);
      this.cvy *= Math.exp(-dt * 2);
      this.cx += this.cvx * dt;
      this.cy += this.cvy * dt;
    }
    if (this.vy <= 0) return;
    // caught?
    if (Math.abs(this.x - this.cx) < 1.7 * S && py <= this.cy + 0.3 * S && this.y >= this.cy - 0.15 * S) {
      this.y = this.cy;
      return this.landOnCloud(this.vy);
    }
    // landed on the page?
    for (const p of this.w.perches) {
      const r = this.w.rectOf(p.el);
      if (!r) continue;
      if (this.x < r.left + 0.4 * S || this.x > r.right - 0.4 * S) continue;
      if (py <= r.top && this.y >= r.top && r.top > this.minY * 0.6 && r.top < this.H) {
        this.y = r.top;
        return this.landOnPerch(p.el, this.vy);
      }
    }
    // never down at the bottom of the screen: the cloud always gets there first
    if (this.y > this.maxY - 0.2 * S) {
      this.cx = this.x;
      this.cy = this.y;
      this.cvx = this.vx * 0.3;
      this.landOnCloud(this.vy);
    }
  }

  private landing(impact: number, onCloud: boolean) {
    this.roll = Math.atan2(Math.sin(this.roll), Math.cos(this.roll));
    const hard = impact > 1700 || this.dizzyUntil === -1;
    this.routine = null;
    this.setPose("Sit_Idle");
    this.play("Land");
    if (hard) {
      this.dizzyUntil = this.t + 0.5 + 2.6;
      this.dizzyFrom = this.t + 0.5;
      this.say("hardLand", 1, true);
    } else if (onCloud) this.say(this.like > 0.5 ? "softLandLike" : "softLand", impact > 500 ? 0.8 : 0.4);
    else this.say("dropOn", 0.6);
  }
  private dizzyFrom = 0;
  private landOnCloud(impact: number) {
    this.mode = "ride";
    this.vx = this.vy = 0;
    this.spin = 0;
    this.seatDx = clamp(this.x - this.cx, -1.6 * this.S, 1.6 * this.S);
    // the cloud gives under her
    this.cSquashV += clamp(impact / 110, 3, 16);
    this.cvy += impact * 0.12;
    this.landing(impact, true);
    this.spot = this.pickSpot(true);
  }

  // ================================================================ leaving in a huff
  private goAway() {
    this.mode = "away";
    this.routine = null;
    this.setPose("Sit_Hmph");
    this.awayUntil = this.t + rnd(12, 18);
  }
  private awayFrame(dt: number) {
    const side = this.cx > this.W / 2 ? 1 : -1;
    this.cloudToward(this.cx + side * 2000, this.cy - 80, dt, 1.5, 900);
    this.x = this.cx;
    this.y = this.cy;
    if (this.t > this.awayUntil) {
      this.annoy = 0.3;
      this.pokes = [];
      this.cx = clamp(this.W * (side > 0 ? 0.85 : 0.15), 2 * this.S, this.W - 2 * this.S);
      this.cy = -3 * this.S;
      this.spot = this.pickSpot(false);
      this.mode = "ride";
      this.setPose("Sit_Hmph");
      this.routine = { name: "sulk", i: 0, until: this.t + 6 };
      this.said.backAt = this.t;
      this.say("back", 1, true);
    }
  }

  // ================================================================ attention: what she looks at
  // In order: whatever just happened (a link or project you point at, a click, text you select, the page
  // moving), then you (the cursor, while it moves; if she's cross with you she makes a point of looking
  // away), else now and then a glance of her own (at a heading or a project on screen, at you, at the sky).
  private glance: { x: number; y: number; until: number } | null = null;
  private nextGlance = 4;
  private attend(t: number): { x: number; y: number; w: number } {
    const S = this.S, hx = this.x, hy = this.y - 1.9 * S;
    if (this.poi && this.poi.until > t) return { x: this.poi.x, y: this.poi.y, w: 1 };
    const p = this.w.pointer;
    if (p.inside && this.w.now - p.moved < 3) {
      this.nextGlance = Math.max(this.nextGlance, t + rnd(2, 4));
      if (this.annoy > 0.5) return { x: 2 * hx - p.x, y: hy - 60, w: 0.85 };
      return { x: p.x, y: p.y, w: 1 };
    }
    if (this.glance && this.glance.until > t) return { x: this.glance.x, y: this.glance.y, w: 0.9 };
    if (t > this.nextGlance) {
      const hold = rnd(1.6, 3.6);
      this.nextGlance = t + hold + rnd(2.5, 7);
      const seen = this.w.perches.filter((q) => q.bottom > 0 && q.top < this.H && Math.abs((q.left + q.right) / 2 - hx) > 2 * S);
      const pick = weighted<string>([["page", seen.length ? 3 : 0], ["you", 2], ["sky", this.w.night > 0.5 ? 2 : 0.8], ["side", 1]]);
      let gx = hx, gy = hy;
      if (pick === "page") {
        const q = seen[Math.floor(Math.random() * seen.length)];
        gx = clamp(rnd(q.left, q.right), 0, this.W);
        gy = clamp((q.top + q.bottom) / 2, 0, this.H);
      } else if (pick === "sky") {
        gx = hx + rnd(-300, 300);
        gy = hy - 500;
      } else if (pick === "side") {
        gx = hx + (Math.random() < 0.5 ? -1 : 1) * rnd(300, 600);
        gy = hy + rnd(-80, 120);
      }
      this.glance = { x: gx, y: gy, until: t + hold };
      return { x: gx, y: gy, w: 0.9 };
    }
    return { x: hx, y: hy, w: 0 };
  }

  // ================================================================ what gets shown
  private compose(dt: number, idle: number) {
    const o = this.out;
    const t = this.t;
    let anim = this.pose;
    let once = false;
    if (this.petting && this.grounded()) anim = "Pet";
    if (this.holdOnUntil > t && !this.lying()) anim = "HoldOn";
    if (this.danceUntil > t && this.grounded()) anim = "Dance";
    if (this.oneshot && this.oneshot.until > t) {
      anim = this.oneshot.name;
      once = true;
    }
    if (this.dizzyUntil > t && t >= this.dizzyFrom) {
      anim = "Dizzy";
      once = false;
    }
    if (this.debug.anim) {
      anim = this.debug.anim;
      once = false;
    }
    if (anim !== o.anim || once !== o.once) {
      const lieChange = LYING.has(anim) !== LYING.has(o.anim) || anim === "Sleep" || o.anim === "Sleep";
      o.fade = lieChange ? 0.8 : anim === "Fall" || anim === "Tumble" || anim === "Dangle" || anim === "Air" ? 0.18 : anim === "Land" ? 0.08 : 0.3;
      o.anim = anim;
      o.once = once;
      o.seq++;
    }
    o.speed = 1;

    // face
    let e: Expr = this.annoy > 0.55 ? "annoyed" : clamp(idle / 60, 0, 1) > 0.6 || this.energy < 0.3 ? "bored" : "neutral";
    if (this.w.night > 0.6 && e === "neutral") e = "bored";
    if (anim === "Dance") e = "smug";
    if (anim === "Pet") e = this.like > 0.5 ? "content" : t % 6 < 4 ? "content" : "annoyed";
    if (anim === "Sit_Hmph") e = "annoyed";
    if (anim === "Fall" || anim === "Tumble") e = "surprised";
    if (anim === "Dangle") e = "annoyed";
    if (this.exprOverride && this.exprOverride.until > t) e = this.exprOverride.e;
    if (this.sleeping || anim === "Sleep" || anim === "Sleep_Lie") e = "sleep";
    if (anim === "Dizzy") e = "dizzy";
    o.expr = e;

    // blinking
    if (t > this.blinkAt) {
      this.blinkAt = t + rnd(2.4, 5.5) * (Math.random() < 0.15 ? 0.25 : 1);
      this.blinkT = 0;
    }
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const k = this.blinkT / 0.16;
      o.blink = k < 0.5 ? k * 2 : Math.max(0, 2 - k * 2);
      if (k >= 1) this.blinkT = -1;
    } else o.blink = 0;

    // where to look
    let { x: lx, y: ly, w: lw } = this.attend(t);
    if (this.debug.noLook || HEAD_BUSY.has(anim) || this.sleeping || !(this.grounded() || this.mode === "enter")) lw = 0;
    if (lw === 0) {
      lx = this.x;
      ly = this.y - 1.9 * this.S;
    }
    o.look = { x: lx, y: ly, w: lw };

    o.x = this.x;
    o.y = this.y;
    o.roll = this.roll;
    o.yaw = 0;
    const travel = this.mode === "ride" ? clamp(this.cvx / 900, -0.35, 0.35) : 0;
    o.cloud = { x: this.cx, y: this.cy, squash: this.cSquash * 0.03, tilt: -travel * 0.25 };
    o.zz = this.sleeping;
    o.notes = this.w.music && !this.sleeping && this.mode !== "away";
    o.swing = this.mode === "held" ? this.held.psi - this.held.psi0 : 0;
    o.visible = true;
  }
}
