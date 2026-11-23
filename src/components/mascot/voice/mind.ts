// Her voice. Her body and its reflexes live in ../brain.ts; whenever that wants to say something it asks
// here (hear), and this decides what actually comes out, or whether something better is worth saying.
// It also talks on its own. Nothing here knows *what* she says; that's personality.ts. This is how she decides:
//
//   1. Every stimulus changes her mood (feel) and lands in her short-term memory.
//   2. Every thought she knows rates how much she wants to say it *right now* (want), looking at the
//      world, her mood, what just happened and what she remembers.
//   3. Big reactions (someone poked her) come out immediately. Everything else builds an urge to talk;
//      when it's high enough she picks one thought, weighted and a bit random, so she's never predictable.
//   4. Lines are built from a grammar, so even the same thought is worded differently each time.
//   5. Thoughts can set expectations ("hover Fly Lab, it's my favourite") and react when you do or don't.
//   6. A little of it is remembered between visits (localStorage, this browser only).

import { Grammar, type Rules, type Vars } from "./grammar";
import { Senses, type Stimulus, type StimulusType, type World } from "./senses";
import type { Expr } from "../face";

export type Emotion = Expr;

/** Her body's state, handed over by the brain every frame. */
export type Body = {
  sleeping: boolean;
  held: boolean;
  away: boolean; // off screen / gone
  annoy: number;
  like: number;
  energy: number;
};

export type Mood = {
  joy: number;
  energy: number;
  annoy: number;
  curiosity: number;
  affection: number;
  boredom: number;
};

export type LongMemory = {
  visits: number;
  /** Pokes before this visit started (to hold grudges). */
  pokesBefore: number;
  lastVisit: number; // Date.now()
  pokes: number;
  songs: string[];
};

export type Expectation = {
  id: string;
  test: (s: Stimulus, w: World) => boolean;
  until: number;
  hit: string; // thought id to say when it happens
  miss?: string; // thought id to say when it doesn't
  vars?: Vars;
};

export type Ctx = {
  w: World;
  body: Body;
  s: Stimulus | null; // the thing that just happened (null: she's just thinking)
  recent: Stimulus[]; // the last ~10 s, newest last
  mood: Mood;
  long: LongMemory;
  facts: Record<string, number>; // her own counters for this visit (pokes, skips, ...)
  notes: Record<string, string>; // her own notes for this visit (last project she talked about, ...)
  vars: Vars; // set by want(), used by the lines
  now: number;
  rng: () => number;
  /** ms since she last said this thought (Infinity if never) */
  since: (id: string) => number;
  /** how often she said it this visit */
  count: (id: string) => number;
  /** ms since this kind of stimulus last happened (Infinity if never) */
  ago: (type: StimulusType) => number;
  expect: (e: Omit<Expectation, "until"> & { ms: number }) => void;
};

export type Thought = {
  id: string;
  /** What happening makes her think this. Leave out for chatter (thoughts she has on her own). */
  on?: StimulusType[];
  /** How much she wants to say this now. ≤0: not at all. ~1: normal chatter. ≥3: reacts on the spot. */
  want: (c: Ctx) => number;
  /** What to say: templates for the grammar. An array of arrays is a little monologue, said in order. */
  lines: (c: Ctx) => readonly string[] | readonly (readonly string[])[];
  emotion?: Emotion | ((c: Ctx) => Emotion | null);
  /** Minimum ms before this thought can come back. */
  cooldown?: number;
  /** Only once per visit. */
  once?: boolean;
  /** Not worn out by repeating (her reflexes: each has its own little cooldown instead). */
  tireless?: boolean;
  /** Where to look while saying it: an element, or the visitor (the cursor). */
  look?: (c: Ctx) => Element | "cursor" | null;
  /** After saying it: remember things, set expectations. */
  then?: (c: Ctx) => void;
};

export type Personality = {
  rules: Rules;
  thoughts: Thought[];
  baseline: Mood;
  feel: (s: Stimulus, mood: Mood, w: World, facts: Record<string, number>) => void;
};

export type VoiceOptions = {
  personality: Personality;
  /** 0.5 = calm, 1 = chatty, 2 = never shuts up. */
  talkativeness?: number;
  /** Random seed source (tests). */
  rng?: () => number;
  /** localStorage key for what she remembers between visits; null to forget everything. */
  storageKey?: string | null;
};

export type VoiceState = {
  line: string | null;
  key: number; // changes with every new line
  /** Seconds the line stays up. */
  dur: number;
  /** Face to pull while saying it (null: let the brain decide). */
  expr: Expr | null;
};

/** Mostly on screen (a card that slid or scrolled away isn't worth talking about anymore). */
function onScreen(el: Element) {
  if (!el.isConnected) return false;
  const r = el.getBoundingClientRect();
  const w = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
  const h = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
  return w > Math.min(r.width, window.innerWidth) * 0.35 && h > Math.min(r.height, window.innerHeight) * 0.35;
}
const isProject = (el: unknown): el is Element => el instanceof Element && el.matches("[data-project]");

const REACT = 2.6; // want at or above this: say it now, even mid-sentence (if it's more important)
const TICK = 400;
const MEMORY_MS = 10_000;

export class Voice {
  readonly mood: Mood;
  /** What she's talking about, in px (viewport), while she says it: the brain makes her look there. */
  attention: { x: number; y: number } | null = null;
  body: Body = { sleeping: false, held: false, away: false, annoy: 0, like: 0.2, energy: 0.8 };

  private senses: Senses | null = null;
  private g: Grammar;
  private p: Personality;
  private talk: number;
  private rng: () => number;
  private storageKey: string | null;
  private long: LongMemory;
  private facts: Record<string, number> = {};
  private notes: Record<string, string> = {};
  private consumed = new WeakSet<Stimulus>();
  private recent: Stimulus[] = [];
  private lastSaid = new Map<string, number>();
  private saidCount = new Map<string, number>();
  private lastStim = new Map<StimulusType, number>();
  private expectations: Expectation[] = [];
  private urge = 0;
  /** No small talk before this (a breather after every line; reactions don't wait). */
  private quietUntil = 0;
  /** Everything she said lately, word for word, so she doesn't say the exact same sentence again soon. */
  private spoken: string[] = [];
  private queue: { text: string; emotion: Emotion | null; look: Element | "cursor" | null; priority: number }[] = [];
  private busyUntil = 0;
  private currentPriority = 0;
  private lineStarted = 0;
  private currentThought = "";
  private currentChatter = false;
  private lookEl: Element | "cursor" | null = null;
  private timer = 0;
  private lastTick = 0;
  private state: VoiceState = { line: null, key: 0, dur: 0, expr: null };
  private listeners = new Set<() => void>();

  constructor(opts: VoiceOptions) {
    this.p = opts.personality;
    this.talk = opts.talkativeness ?? 0.85;
    this.rng = opts.rng ?? Math.random;
    this.storageKey = opts.storageKey === undefined ? "mascot-memory" : opts.storageKey;
    this.g = new Grammar(this.p.rules, this.rng);
    this.mood = { ...this.p.baseline };
    this.long = this.load();
  }

  // ---- lifecycle -------------------------------------------------------------------------------------

  start() {
    if (this.senses) return;
    this.senses = new Senses((s) => this.perceive(s));
    this.senses.start();
    this.lastTick = performance.now();
    this.timer = window.setInterval(() => this.tick(), TICK);
  }

  stop() {
    this.senses?.stop();
    this.senses = null;
    clearInterval(this.timer);
    this.save();
  }

  /** 0.5 = calm, 1 = chatty, 2 = never shuts up. */
  setTalkativeness(t: number) {
    this.talk = t;
  }

  /** Her body wants to say something (one of the LineKeys). `chance` (0..1) is how much it wants to; forced
   *  ones are reflexes (poked, grabbed, thrown). The voice decides. */
  hear(key: string, chance = 1, force = false) {
    if (!this.senses) return;
    this.perceive({ type: "her", key, chance, force, at: performance.now() });
  }

  /** Called by the brain every frame. Her mood is the body's; the voice only adds joy/curiosity/boredom. */
  setBody(b: Body) {
    this.body = b;
    this.mood.annoy = b.annoy;
    this.mood.affection = b.like;
    this.mood.energy = b.energy;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getState = () => this.state;

  // ---- perception -----------------------------------------------------------------------------------

  private perceive(s: Stimulus) {
    const w = this.senses!.world;
    this.recent.push(s);
    this.lastStim.set(s.type, s.at);
    this.p.feel(s, this.mood, w, this.facts);
    this.clampMood();

    if (s.type === "start") {
      this.long.pokesBefore = this.long.pokes;
      this.long.visits++;
      this.save();
    }
    if (s.type === "her" && s.key.startsWith("poke")) this.long.pokes++;
    if (s.type === "song" && !this.long.songs.includes(s.title)) this.long.songs = [...this.long.songs, s.title].slice(-20);
    if (s.type === "away") this.save();

    // Did they do what she was hoping for?
    for (const e of [...this.expectations]) {
      if (e.test(s, w)) {
        this.expectations = this.expectations.filter((x) => x !== e);
        this.consumed.add(s);
        this.force(e.hit, s, e.vars);
        return;
      }
    }

    // Nobody's looking (other tab): remember it, say nothing.
    if (document.hidden) return;

    // React now if it's important enough to interrupt, or if she's free anyway. Otherwise it stays in her
    // short-term memory and she may still bring it up when she's done talking.
    const best = this.best(s, 0.8);
    if (!best) return;
    const now = performance.now();
    const free = !this.busy(now) && !this.queue.length;
    // The same reaction again within a moment (poke-poke-poke): she's still mid-squeak, don't restart it.
    if (best.thought.id === this.currentThought && now - this.lineStarted < 900) {
      this.consumed.add(s);
      return;
    }
    // Small talk is never more important than reacting to what you just did.
    const overChatter = this.currentChatter && best.score >= 1.2;
    // What she's talking about has left the screen, or a different project just came up: move on now.
    const topicGone = this.lookEl instanceof Element && !onScreen(this.lookEl);
    const nextLook = best.thought.look?.(best.ctx) ?? null;
    const newProject = isProject(nextLook) && isProject(this.lookEl) && nextLook !== this.lookEl && best.score >= 1;
    if ((best.score >= REACT && best.score >= this.currentPriority) || free || overChatter || topicGone || newProject) {
      this.consumed.add(s);
      this.say(best.thought, best.ctx, best.score);
    } else this.urge += 0.35;
  }

  // ---- thinking -------------------------------------------------------------------------------------

  private tick() {
    if (!this.senses) return;
    const now = performance.now();
    const dt = now - this.lastTick;
    this.lastTick = now;
    const w = this.senses.world;
    w.now = now;
    this.recent = this.recent.filter((s) => now - s.at < MEMORY_MS);

    // Mood drifts back to her baseline; boredom grows when nothing happens.
    const k = Math.min(1, dt / 20_000);
    for (const key of Object.keys(this.mood) as (keyof Mood)[]) this.mood[key] += (this.p.baseline[key] - this.mood[key]) * k;
    const quiet = now - w.lastInput;
    if (quiet > 8_000) this.mood.boredom += dt / 60_000;
    this.clampMood();

    // Expectations that ran out.
    for (const e of [...this.expectations]) {
      if (now > e.until) {
        this.expectations = this.expectations.filter((x) => x !== e);
        if (e.miss && !this.busy(now)) this.force(e.miss, null, e.vars);
      }
    }

    this.follow(w);

    // Nobody's looking (other tab), or she's off screen: she keeps her thoughts to herself.
    if (document.hidden || this.body.away) return;

    // Talking about something that just left the screen (scrolled or slid away): stop, drop the rest of it.
    if (this.busy(now) && this.lookEl instanceof Element && !onScreen(this.lookEl)) {
      this.busyUntil = now;
      this.lookEl = null;
      this.urge = 0; // (leave room for whatever's on screen now, no small talk in the gap)
      this.queue = this.queue.filter((q) => !(q.look instanceof Element) || onScreen(q.look));
      this.set({ line: null, expr: null, dur: 0, key: this.state.key + 1 });
    }

    // Still talking: let the current line finish.
    if (this.busy(now)) return;
    while (this.queue.length && this.queue[0].look instanceof Element && !onScreen(this.queue[0].look)) this.queue.shift();
    if (this.queue.length) {
      this.show(this.queue.shift()!, now);
      return;
    }
    if (this.state.line !== null) this.set({ line: null, expr: null });

    // Something she *really* wants to say (the greeting, ...) doesn't wait for the urge, and neither does
    // a reaction she didn't get to while she was talking.
    const urgent = this.scored(null).filter((x) => x.score >= REACT || (x.stim && x.score >= 0.9));
    if (urgent.length) {
      const pick = this.softmax(urgent, 0.6);
      if (pick.stim) this.consumed.add(pick.stim);
      this.say(pick.thought, pick.ctx, pick.score);
      return;
    }

    // A breather after each line before she starts small talk again.
    if (now < this.quietUntil) return;

    // The urge to say something builds with time, energy and how much is going on.
    const activity = Math.min(1, this.recent.length / 6);
    const asleep = quiet > 30_000 || this.body.sleeping;
    this.urge += (dt / 7_000) * this.talk * (0.55 + this.mood.energy * 0.6 + activity * 0.5) * (asleep ? 0.25 : 1);
    if (this.urge < 1) return;

    const pick = this.choose(null);
    if (pick) {
      this.urge = 0;
      if (pick.stim) this.consumed.add(pick.stim);
      this.say(pick.thought, pick.ctx, pick.score);
    } else this.urge = 0.7; // nothing to say: try again soon
  }

  private busy(now: number) {
    return now < this.busyUntil;
  }

  private ctx(s: Stimulus | null, vars: Vars = {}): Ctx {
    const w = this.senses!.world;
    const now = performance.now();
    return {
      w,
      body: this.body,
      s,
      recent: this.recent,
      mood: this.mood,
      long: this.long,
      facts: this.facts,
      notes: this.notes,
      vars: { ...vars },
      now,
      rng: this.rng,
      since: (id) => (this.lastSaid.has(id) ? now - this.lastSaid.get(id)! : Infinity),
      count: (id) => this.saidCount.get(id) ?? 0,
      ago: (type) => (this.lastStim.has(type) ? now - this.lastStim.get(type)! : Infinity),
      expect: (e) => {
        this.expectations = this.expectations.filter((x) => x.id !== e.id);
        this.expectations.push({ ...e, until: now + e.ms });
      },
    };
  }

  private available(t: Thought, c: Ctx) {
    if (t.once && c.count(t.id) > 0) return false;
    if (t.cooldown && c.since(t.id) < t.cooldown) return false;
    return true;
  }

  private scored(s: Stimulus | null) {
    const out: { thought: Thought; ctx: Ctx; score: number; stim: Stimulus | null }[] = [];
    const now = performance.now();
    for (const t of this.p.thoughts) {
      // Reactions only to their own triggers. When she's just thinking (s = null), a reaction can still
      // come up for something from the last few seconds that she didn't get to say anything about.
      let stim = s;
      let stale = 1;
      if (t.on) {
        if (s) {
          if (!t.on.includes(s.type)) continue;
        } else {
          stim = [...this.recent].reverse().find((r) => t.on!.includes(r.type) && !this.consumed.has(r) && now - r.at < 8_000) ?? null;
          if (!stim) continue;
          stale = 0.75;
        }
      } else if (s) continue;
      const c = this.ctx(stim);
      if (!this.available(t, c)) continue;
      let want = 0;
      try {
        want = t.want(c);
      } catch {
        want = 0;
      }
      if (!(want > 0)) continue;
      // Never start talking about something that's already gone from the screen.
      const el = t.look?.(c);
      if (el instanceof Element && !onScreen(el)) continue;
      // Chatter wears out: the more she's said a thing this visit, the less she wants to say it again.
      if (want < REACT && !t.tireless) want *= Math.pow(0.5, c.count(t.id));
      out.push({ thought: t, ctx: c, score: want * stale, stim });
    }
    return out;
  }

  private best(s: Stimulus, min: number) {
    const all = this.scored(s).filter((x) => x.score >= min);
    if (!all.length) return null;
    return this.softmax(all, 0.6);
  }

  private choose(s: Stimulus | null) {
    const all = this.scored(s).filter((x) => x.score >= 0.15);
    if (!all.length) return null;
    // Bored = more random. Curious/energetic = goes for the most relevant thing.
    const temperature = 0.35 + this.mood.boredom * 0.5;
    return this.softmax(all, temperature);
  }

  private softmax<T extends { score: number }>(items: T[], temperature: number) {
    const max = Math.max(...items.map((i) => i.score));
    const weights = items.map((i) => Math.exp((i.score - max) / temperature));
    let r = this.rng() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  private force(id: string, s: Stimulus | null, vars?: Vars) {
    const t = this.p.thoughts.find((x) => x.id === id);
    if (!t) return;
    const c = this.ctx(s, vars);
    // Expectation thoughts still get to fill their vars, but always speak.
    try {
      t.want(c);
    } catch {
      /* ignore */
    }
    Object.assign(c.vars, vars);
    this.say(t, c, REACT + 1);
  }

  // ---- speaking -------------------------------------------------------------------------------------

  private say(t: Thought, c: Ctx, priority: number) {
    const now = performance.now();
    this.lastSaid.set(t.id, now);
    this.saidCount.set(t.id, (this.saidCount.get(t.id) ?? 0) + 1);

    const raw = t.lines(c);
    const parts: (readonly string[])[] = Array.isArray(raw[0]) ? (raw as (readonly string[])[]) : [raw as readonly string[]];
    const emotion = typeof t.emotion === "function" ? t.emotion(c) : (t.emotion ?? null);
    const look = t.look?.(c) ?? null;
    // (Recently used wordings are remembered per thought, and per reflex for her body's lines.)
    // A few tries at a wording she hasn't used lately, so the same sentence doesn't come back soon.
    const texts = parts
      .map((options, i) => {
        let text = "";
        for (let k = 0; k < 6; k++) {
          text = this.g.expand(options, c.vars, `${t.id}:${c.vars._k ?? ""}:${i}`);
          if (!this.spoken.includes(text)) break;
        }
        this.spoken = [...this.spoken, text].slice(-80);
        return text;
      })
      .filter(Boolean);
    t.then?.(c);
    if (!texts.length) return;

    this.currentThought = t.id;
    this.currentChatter = !t.on && priority < REACT;
    // Interrupting: drop whatever she was about to say.
    this.queue = texts.slice(1).map((text) => ({ text, emotion, look, priority }));
    this.show({ text: texts[0], emotion, look, priority }, now);
  }

  private show(item: { text: string; emotion: Emotion | null; look: Element | "cursor" | null; priority: number }, now: number) {
    this.currentPriority = item.priority >= REACT ? item.priority : 0;
    this.lineStarted = now;
    // Long enough to read: ~16 characters a second, plus a beat.
    const ms = Math.min(8_000, 1_700 + item.text.length * 60);
    this.busyUntil = now + ms + 500;
    this.quietUntil = now + ms + 4_000;
    this.lookEl = item.look;
    this.set({ line: item.text, expr: item.emotion, dur: ms / 1000, key: this.state.key + 1 });
    window.setTimeout(() => {
      if (this.lineStarted === now) this.currentPriority = 0;
    }, 1_200);
  }

  /** Eyes: on what she's talking about, while she talks about it (otherwise the brain decides). */
  private follow(w: World) {
    const el = this.busy(performance.now()) ? this.lookEl : null;
    if (!el) {
      this.attention = null;
      return;
    }
    if (el === "cursor") {
      this.attention = { x: ((w.pointer.x + 1) / 2) * window.innerWidth, y: ((1 - w.pointer.y) / 2) * window.innerHeight };
      return;
    }
    const r = el.getBoundingClientRect();
    this.attention = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  private set(next: Partial<VoiceState>) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((fn) => fn());
  }

  private clampMood() {
    for (const key of Object.keys(this.mood) as (keyof Mood)[]) this.mood[key] = Math.min(1, Math.max(0, this.mood[key]));
  }

  // ---- long-term memory -----------------------------------------------------------------------------

  private load(): LongMemory {
    const fresh: LongMemory = { visits: 0, pokesBefore: 0, lastVisit: 0, pokes: 0, songs: [] };
    if (!this.storageKey) return fresh;
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey) ?? "null");
      return saved ? { ...fresh, ...saved } : fresh;
    } catch {
      return fresh;
    }
  }

  private save() {
    if (!this.storageKey) return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({ ...this.long, lastVisit: Date.now() }));
    } catch {
      /* private mode etc. */
    }
  }
}
