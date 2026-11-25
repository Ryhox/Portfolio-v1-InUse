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
//  - Poke her (where matters: ears, head, belly, feet, cloud; and how often) and pet her. Scroll violently
//    enough and she's flung off her cloud; it races to catch her, she lands in it and shuffles back to the
//    middle.
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
  visible: boolean;
};

/** Where her body is on screen (set by the model every frame, from the bones). */
export type Geo = {
  head: { x: number; y: number; r: number };
  body: { x: number; y: number; r: number };
  ears: { x: number; y: number; r: number }[];
  feet: { x: number; y: number; r: number }[];
};

export type Zone = "head" | "ear" | "body" | "feet" | "cloud";
type Mode = "enter" | "ride" | "air" | "away";
// A place on the screen (viewport px) for her seat. `float`: lying on her cloud above the project videos.
type Spot = { x: number; y: number; float?: boolean };
/** Floating above the videos: how far her seat is above their top edge (model units). Her cloud just
 *  overlaps the edge, so she has room for her ears under the top of the screen. */
const FLOAT = 0.95;
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
  // (floating above the project videos: lying on her belly; sitting up there, her ears would stick out the top)
  float: [{ pose: "Lie_Belly", dur: [14, 22] }],
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
    bubble: { text: "", seq: 0, until: 0 }, zz: false, notes: false, visible: true,
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
  private cloudChase = false;
  // what she's doing
  private pose = "Lie_Back";
  private oneshot: { name: string; until: number } | null = null;
  private routine: { name: string; i: number; until: number } | null = null;
  private freeCheckAt = 0;
  private glide: { spot: Spot | null; sx: number; sy: number; t0: number; T: number } | null = null;
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
  // speech, looking, blinking
  /** What she says is decided by her voice (voice/): her body only tells it what it would like to say. */
  readonly voice = new Voice({ personality: tsundere });
  private voiceKey = 0;
  private said: Record<string, number> = {};
  private poi: { x: number; y: number; until: number } | null = null;
  private blinkAt = 0;
  private blinkT = -1;
  private sections = new Set<string>();
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
    v.setBody({ sleeping: this.sleeping, away: this.mode === "away", annoy: this.annoy, like: this.like, energy: this.energy });
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
    if (!this.durations[name] || this.lockedFlat()) return;
    this.oneshot = { name, until: this.t + this.durations[name] };
  }
  private busy() {
    return !!this.oneshot && this.oneshot.until > this.t;
  }
  private lying() {
    return LYING.has(this.pose);
  }
  private grounded() {
    return this.mode === "ride";
  }
  /** Lying down (or floating above the projects, where she always lies): she stays down whatever happens.
   *  Reactions (annoyed, dizzy, a shrug...) only show on her face and in what she says, no sitting up for them
   *  and lying back down. */
  private lockedFlat() {
    if (this.mode === "ride" && this.spot?.float) return true;
    return this.grounded() && (this.lying() || this.pose === "Sleep");
  }
  /** Sit up (out of any lying pose) and drop the routine, for a reaction. */
  private sitUp() {
    if (this.lockedFlat()) return;
    if (this.lying() || this.pose === "Sleep") this.setPose("Sit_Idle");
    this.routine = null;
  }

  // ================================================================ where the cloud parks
  // She keeps to her lane down the right side of the screen and never covers text (lines, empty space and
  // other decoration are fine). A spot is a place on the screen, not on the page: scrolling doesn't carry her
  // off. She only moves when content is about to come under her, and then to the nearest free place in her
  // lane (straight up or down if she can). In the projects gallery she lies on her cloud and floats just above
  // the videos while they slide past under her.
  private spotPos(s: Spot) {
    return { x: s.x, y: s.y };
  }
  /** The work gallery is pinned and sliding sideways right now. */
  private galleryOn() {
    return this.w.workPinned;
  }
  /** Floating above the videos (or on her way there). */
  private floating() {
    return !!this.spot?.float;
  }
  /** The room she takes up sitting at (x, y) on her cloud: ears to the bottom of the cloud. */
  private roomAt(x: number, y: number) {
    const S = this.S, pad = 6;
    return { left: x - 1.95 * S - pad, right: x + 1.95 * S + pad, top: y - 4.8 * S - pad, bottom: y + 1.35 * S + pad };
  }
  /** How much content she'd cover there (only what's on screen counts: her ears may stick out the top).
   *  `gallery`: the project videos don't count (there her room is
   *  measured sitting up, but she lies down above them). */
  private covers(x: number, y: number, gallery = false) {
    const r = this.roomAt(x, y);
    return this.w.overlap({ left: Math.max(0, r.left), right: Math.min(this.W, r.right), top: Math.max(0, r.top), bottom: Math.min(this.H, r.bottom) }, gallery);
  }
  /** ...there now, or in a moment, wherever the scroll is taking the page (so she steps aside early, not
   *  once the text is already under her). Not in the gallery: that part of the page doesn't scroll. */
  private coversSoon(x: number, y: number, gallery: boolean) {
    const now = this.covers(x, y);
    if (gallery) return now;
    const ahead = clamp(this.w.scrollV * 0.35, -this.H * 0.5, this.H * 0.5);
    return Math.abs(ahead) > 4 ? now + this.covers(x, y + ahead) : now;
  }
  /** Breathing room she keeps from the window's left and right edges. */
  private edgeGap() {
    return clamp(this.W * 0.04, 28, 64);
  }
  /** Her lane: seat positions on the right side of the screen, the far right first. */
  private laneXs() {
    const S = this.S;
    const right = this.W - this.edgeGap() - 1.95 * S;
    const left = Math.max(this.W * 0.8, this.edgeGap() + 1.95 * S);
    const xs = [right];
    for (let x = right - 0.75 * S; x >= left; x -= 0.75 * S) xs.push(x);
    return xs;
  }
  private inLane(x: number) {
    const xs = this.laneXs();
    return x <= xs[0] + 1 && x >= xs[xs.length - 1] - 1;
  }
  private avoid(x: number, y: number) {
    // the iPod (bottom right) and the mini player (bottom left)
    if (x > this.W - 300 && y > this.H - 240) return true;
    if (x < 470 && y > this.H - 120) return true;
    return false;
  }
  /** The nearest place in her lane where she covers nothing (now or in a moment). If there's none (a crowded
   *  phone screen), the one that covers the least. */
  private pickSpot(): Spot | null {
    const S = this.S;
    const lo = this.minY, hi = Math.max(this.minY, this.maxY);
    const gallery = this.galleryOn();
    const xs = this.laneXs();
    let free: { s: Spot; d: number } | null = null;
    let least: { s: Spot; d: number } | null = null;
    xs.forEach((x, i) => {
      for (let y = lo; y <= hi; y += 8) {
        if (this.avoid(x, y)) continue;
        // (near where she is, and as far right as possible)
        const d = Math.abs(y - this.cy) + Math.abs(x - this.cx) * 0.5 + i * 0.8 * S;
        const o = this.coversSoon(x, y, gallery);
        if (o === 0) {
          if (!free || d < free.d) free = { s: { x, y }, d };
        } else if (!least || o + d * 20 < least.d) least = { s: { x, y }, d: o + d * 20 };
      }
    });
    const f = free as { s: Spot; d: number } | null, l = least as { s: Spot; d: number } | null;
    return f?.s ?? l?.s ?? null;
  }
  /** In the gallery: lying on her cloud in the middle of the screen, floating just above the videos. Over
   *  once "and much more" (the end of the gallery) comes in: there she's back to her lane. */
  private floatSpot(): Spot | null {
    // (both measured with the rest of the page, a few times a second: World)
    if (this.w.moreLeft < this.W * 0.95) return null;
    const top = this.w.mediaTop;
    if (!Number.isFinite(top)) return null;
    return { x: this.W / 2, y: top - FLOAT * this.S, float: true };
  }
  /** Where she should be now: where she is, unless something is (about to be) under her. */
  private nextSpot(): Spot | null {
    const cur = this.spot;
    if (this.galleryOn()) {
      const pk = this.floatSpot();
      if (pk && this.covers(pk.x, pk.y, true) === 0) {
        if (cur?.float && Math.abs(cur.x - pk.x) < 3 && Math.abs(cur.y - pk.y) < 3) return cur;
        return pk;
      }
    }
    const gallery = this.galleryOn();
    const fits = (s: Spot) => !s.float && this.inLane(s.x) && !this.avoid(s.x, s.y) && s.y >= this.minY - 1 && s.y <= this.maxY + 1;
    if (cur && fits(cur) && this.coversSoon(cur.x, cur.y, gallery) === 0) return cur;
    const next = this.pickSpot();
    if (!next) return cur;
    // (nowhere free at all: only move if it's clearly better, so she doesn't fidget between bad spots)
    if (cur && fits(cur)) {
      const a = this.coversSoon(next.x, next.y, gallery), b = this.coversSoon(cur.x, cur.y, gallery);
      if (a > 0 && a > b * 0.6) return cur;
    }
    return next;
  }

  // ================================================================ start
  start() {
    this.t = 0;
    this.resize();
    // She drifts in from above the top right, lying on her back.
    this.cx = this.laneXs()[0];
    this.cy = -2.5 * this.S;
    this.x = this.cx;
    this.y = this.cy;
    this.mode = "enter";
    this.setPose("Lie_Back");
    this.spot = this.pickSpot();
  }
  private resize() {
    this.S = clamp(Math.min(this.W, this.H * 1.2) / 30, 24, 40);
  }

  // ================================================================ pointer (from the stage)
  pointerDown(x: number, y: number, zone: Zone) {
    if (this.mode === "away" || this.mode === "air") return;
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
    this.setPose(this.spot?.float ? "Lie_Belly" : "Sit_Idle");
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
    if (n >= 2 && !this.lockedFlat()) this.routine = { name: "sulk", i: -1, until: this.t + (this.durations[this.oneshot?.name ?? ""] ?? 1) };
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

  // ================================================================ the frame
  update(dt: number) {
    this.t += dt;
    this.resize();
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
      case "air":
        this.airFrame(dt);
        break;
      case "away":
        this.awayFrame(dt);
        break;
    }
    if (this.mode !== "air") {
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
          if (this.mode === "ride" && !this.lying()) {
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
        if (!this.lockedFlat()) {
          this.setPose("Sit_Hmph");
          this.routine = { name: "sulk", i: 0, until: t + rnd(6, 9) };
        }
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
    const docH = this.w.docH;
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
    // Where the cloud is headed: her spot, until something is about to come under it (checked often, so she
    // steps aside before the text arrives, not after).
    if (!this.spot || this.t > this.freeCheckAt) {
      this.freeCheckAt = this.t + 0.12;
      const next = this.nextSpot();
      if (next !== this.spot) {
        // (done floating over the projects: she sits back up)
        if (this.spot?.float && !next?.float && this.routine?.name === "float" && !this.sleeping) {
          this.routine = null;
          this.setPose("Sit_Idle");
        }
        this.spot = next;
        // (above the videos: she lies down for the ride; there's no room to sit up there)
        if (next?.float && !this.sleeping && this.routine?.name !== "float") {
          this.setPose("Lie_Belly");
          this.routine = { name: "float", i: 0, until: this.t + rnd(14, 22) };
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
        this.glide = { spot: this.spot, sx: this.cx, sy: this.cy, t0: this.t, T: clamp(0.6 + far / 1600, 0.7, 1.3) };
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
      } else this.cloudToward(p.x, p.y, dt, 9, 800);
      if (this.mode === "enter" && far < 6) {
        this.mode = "ride";
        this.setPose("Sit_Idle");
        if (!this.sc.level) {
          this.play("Wave");
          this.say("hello", 1, true);
        }
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
    if (!this.sleeping && !this.w.reduced && !this.busy() && !this.floating() && (idle > 80 || (this.w.night > 0.5 && idle > 50) || this.energy < 0.1)) {
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
  }

  private pickRoutine(idle: number) {
    // above the videos she stays lying down (there's no room to sit up)
    if (this.floating()) return "float";
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
    // never down at the bottom of the screen: the cloud always gets there first
    if (this.y > this.maxY - 0.2 * S) {
      this.cx = this.x;
      this.cy = this.y;
      this.cvx = this.vx * 0.3;
      this.landOnCloud(this.vy);
    }
  }

  private landing(impact: number) {
    this.roll = Math.atan2(Math.sin(this.roll), Math.cos(this.roll));
    const hard = impact > 1700;
    this.routine = null;
    this.setPose("Sit_Idle");
    this.play("Land");
    if (hard) {
      this.dizzyUntil = this.t + 0.5 + 2.6;
      this.dizzyFrom = this.t + 0.5;
      this.say("hardLand", 1, true);
    } else this.say(this.like > 0.5 ? "softLandLike" : "softLand", impact > 500 ? 0.8 : 0.4);
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
    this.landing(impact);
    this.spot = this.nextSpot();
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
      this.spot = this.nextSpot();
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
    const flat = this.lockedFlat();
    if (this.petting && this.grounded() && !flat) anim = "Pet";
    if (this.holdOnUntil > t && !this.lying() && !flat) anim = "HoldOn";
    if (this.danceUntil > t && this.grounded() && !flat) anim = "Dance";
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
    o.visible = true;
  }
}
