// WHO she is: a tsundere bunny on a cloud. Lowercase, dry, never impressed, secretly pleased.
// The voice (mind.ts) decides *when* to talk; this file decides what she notices, what she cares about and how
// she says it. Two kinds of thoughts:
//   - "her": her body's reflexes (poked, petted, scrolled around...), sent by ../brain.ts as a LineKey.
//     Worded from ../lines.ts plus the variants and context-aware lines below.
//   - everything else: things she notices and thinks up on her own (projects, dares, hot takes, your habits,
//     remembering you from last time...).
//
// Writing lines:  #symbol# = random pick from `rules`,  {var} = the situation,  [maybe] = 50% included.
// A list of lists is a little monologue, said in order.

import { projects } from "@/content";
import { LINES, type LineKey } from "../lines";
import type { Expr } from "../face";
import type { Rules } from "./grammar";
import type { Ctx, Personality, Thought } from "./mind";
import type { Stimulus, StimulusType, Target } from "./senses";
import { moreAbout, moreExtra, moreLines, moreRules } from "./more";

// ---- her vocabulary ---------------------------------------------------------------------------------------

const rules: Rules = {
  tsun: ["not that i care.", "don't make it weird.", "don't read into it.", "i'm only saying this once.", "forget i said that.", "it's not like i'm impressed.", "ugh. fine.", "whatever.", "don't tell him i said that."],
  meh: ["whatever.", "i guess.", "fine.", "big deal.", "cool. i guess.", "mhm.", "sure."],
  hmph: ["hmph.", "tch.", "ugh.", "pfft.", "...", "wow."],
  he: ["he", "ryhox", "my landlord", "the guy who made me"],
  you: ["you", "friend"],
  champ: ["speedy", "friend"],
  good: ["actually good", "not bad", "kinda cool", "fine. good. whatever", "annoyingly good"],
  take_subject: ["light mode", "dark mode", "javascript", "css", "tab indentation", "the semicolon", "comic sans", "a good carrot", "a fluffy cloud", "the iPod", "a github star", "monday", "pineapple on pizza", "a 3D website", "a website without a mascot", "react", "windows xp", "a loading screen", "a cursor trail", "dial-up", "being a bunny", "a mascot who talks too much", "the color pink", "skeuomorphism", "the year 2004"],
  take_verdict: ["is overrated.", "is underrated.", "is the only correct choice.", "is fine. i guess.", "is a whole mood.", "deserves more respect.", "is just a phase.", "peaked in 2004.", "is my whole personality.", "is lowkey iconic.", "is sneakily brilliant."],
  muse_q: ["do clouds have feelings?", "what if the fly wins one day?", "who designed gravity. bad call.", "is a website a place?", "do you think my ears are too long. don't answer.", "if i fall off the page, where do i go?", "how many pixels am i. don't count."],
  bored_act: ["counting pixels", "judging the fonts", "thinking about carrots", "ignoring you", "planning my escape", "grooming. obviously", "staring at the void"],
};

// What she knows (and thinks) about each project. New projects in content.ts still work without an entry.
const about: Record<string, { see: string[]; deep: string[] }> = {
  stargazer: {
    see: ["Stargazer Islands. star the repo, get an island. i don't have one. hint.", "islands. in a browser. ok that's #good#.", "every github star is an island. #he# is shameless."],
    deep: ["your island is rolled from your username. same name, same island. forever. no refunds.", "island astrology. based on a hash. very scientific.", "imagine your own island. you could. you won't. but you could."],
  },
  wieland: {
    see: ["Wieland AI. an AI. i'm not jealous.", "an AI that runs on your own computer. no cloud. i have a cloud. i win.", "a local AI. private. unlike me. i see everything."],
    deep: ["it runs on Ollama. nothing leaves your computer. private and smart. #tsun#", "it even names your chats by itself. clever.", "it's an AI. i'm a bunny. completely different. stop comparing us."],
  },
  pokyh: {
    see: ["Pokyh. he fixed WebUntis. someone had to.", "timetable, grades and the cafeteria menu. in one app. #meh#", "real students use this one. so it's legit. allegedly."],
    deep: ["it averages your grades for you. emotional damage, but organised.", "push notifications for the cafeteria menu. priorities.", "you can install it like a real app. it's a PWA. look it up."],
  },
  flylab: {
    see: ["Fly Lab. a real fly brain. gambling. relatable.", "the fly never wins. respect the grind.", "Fly Lab. my favourite. ...don't tell the others."],
    deep: ["one spin in seven pays. the fly doesn't know. let him dream.", "the brain is a real fruit fly connectome. the gambling problem is all his own.", "near misses on purpose. like a real slot machine. evil. kinda genius."],
  },
  projectile: {
    see: ["a minecraft mod. shows where your arrows land. aimbot with paperwork.", "Projectile Preview. never miss a skeleton again. not that i play.", "minecraft modding. #he# writes java. i'm so sorry."],
    deep: ["it simulates the physics before you shoot. cheating, but legal.", "client side. nobody on the server has to install anything. sneaky.", "my aim needed this. i don't have arms that work. you get it."],
  },
  elsewhere: {
    see: ["Little Elsewhere. a cozy pixel world. i'd move in. the cloud's getting old.", "the pixel art in that game. every tiny tree. fine, it's impressive.", "an idle game. basically me, but productive."],
    deep: ["it even has its own little sounds. cozy. #tsun#", "the windows light up at night. ok that's cute. #tsun#", "you grow a whole world from one spring. i grew a cloud. same thing."],
  },
};

// ---- her reflexes, re-worded: extra variants (on top of lines.ts) and lines that depend on the moment ----

const extra: Partial<Record<LineKey, string[]>> = {
  hello: ["oh. a visitor. #meh#", "hey. make yourself at home.", "welcome. or whatever."],
  scrollTop: ["the good stuff is down there. i'm not carrying you.", "scroll, #you#. it's a website."],
  intro: ["#he# wrote all of this himself. it shows.", "the about part. very professional. i'm the unprofessional part."],
  work: ["all his projects. he made these. allegedly.", "the work. this is where he shows off.", "okay, this part is #good#. #tsun#"],
  contact: ["write him. he gets lonely. like, really lonely.", "the end of the page. say hi, he'd like that."],
  poke1: ["*boop*.", "yes, #you#?"],
  poke2: ["again?", "i'm not a button.", "that's two."],
  poke3: ["you're testing me.", "i have teeth, you know."],
  poke4: ["I SAID STOP.", "that's it. i'm writing your name down."],
  pet: ["...okay. that's nice. #tsun#", "a little to the left. no. ugh, fine."],
  petLike: ["...don't stop. that's an order.", "this is fine. this is very fine."],
  hardLand: ["ow. ow. ow.", "i'm fine. the floor isn't."],
  softLand: ["the cloud gets me.", "nice catch, cloud. you're the only one i trust."],
  scrollFast: ["whoa, slow down.", "my ears are flapping.", "careful, the cloud gets dizzy."],
  yawn: ["*yawn* ...don't look.", "bunnies nap. it's a whole thing."],
  wake: ["i was resting my eyes.", "who's there. oh. you."],
  night: ["lights out. finally.", "night mode. now i can sleep in peace."],
  day: ["who turned the sun on.", "aaah. bright. my eyes. my everything."],
  musicOff: ["hey. i was vibing. not that i vibe."],
  select: ["highlighting? studying for a test?", "that's a good part. #tsun#"],
  copy: ["copying his homework, huh.", "ctrl+c. a classic."],
  typing: ["you're typing to the website. it can't hear you. only i can.", "what are you typing. i can't read it. i tried."],
  awayBack: ["you left. i noticed. not that i care.", "oh. you're back. i didn't wait. i was here anyway."],
  stillHere: ["you're still here. huh.", "long visit. you like it here. admit it."],
  hover: ["your cursor is hovering. near me. why.", "i can feel the cursor. stop."],
  bored: ["so. bored. i'm #bored_act#.", "nothing is happening and i hate it."],
  stars: ["the stars are out. i like them. don't tell anyone.", "make a wish. i already did. it's private."],
  sulk: ["i'm sulking. leave me alone. ...don't actually leave.", "not talking to you. this doesn't count."],
  scrollUp: ["going back up? forgot something?", "rewind. ok."],
  scrollStop: ["here. this is nice. #meh#", "we stopped. good. my lunch thanks you."],
  bottom: ["the bottom. congrats. you scrolled.", "it ends here. nothing else. i checked."],
  project: ["that one's #good#.", "point at it longer. i'll tell you about it."],
};

// Faces for some reflexes (the brain already pulls faces; these only add where it doesn't).
const reflexFace: Partial<Record<LineKey, Expr>> = {
  poke3: "annoyed",
  poke4: "angry",
  scrollAngry: "angry",
  seasick: "dizzy",
  pet: "content",
  petLike: "content",
  copy: "smug",
  musicOn: "content",
  bottom: "smug",
};

/** Lines that depend on what's going on (null: nothing special, use the usual ones). */
function context(key: LineKey, c: Ctx): readonly string[] | readonly (readonly string[])[] | null {
  const { w, long } = c;
  switch (key) {
    case "hello": {
      const lang = (navigator.language || "en").slice(0, 2);
      const h = hour();
      if (long.visits > 1) {
        if (long.pokesBefore >= 10) return [["oh, it's you.", "welcome back."], ["the poker from last time. i remember. go easy on me today."]];
        return ["oh, you're back. hi again.", "welcome back. good to see you. (don't tell anyone i said that.)", "you came back. i'm not happy about it. (i'm a little happy about it.)"];
      }
      if (lang === "de") return ["servus. ...that's all the german i know.", "hallo. or whatever."];
      if (lang === "it") return ["ciao. ...that's all the italian i know.", "ciao. don't expect more."];
      if (h >= 23 || h < 5) return ["it's {time}. a late visit. welcome.", "a night owl. cool. i'm a night bunny."];
      return null;
    }
    case "musicOn": {
      if (!w.song) return null;
      c.vars.title = w.song.title;
      c.vars.artist = w.song.artist;
      if (long.songs.slice(0, -1).includes(w.song.title)) return ["{title} again. good choice, it's a favourite.", "{title}. you played this last time too. i don't mind."];
      if (w.song.artist.includes("Sabrina")) return ["{title}. ...ok fine. this one slaps.", "sabrina. he has good taste.", "*nods along* i'm not dancing. this is a neck exercise."];
      return ["{title}. ok. #meh#", "{artist}? that's ancient. i love it. no i don't.", "{title}. the iPod era. before my time. i'm a website."];
    }
    case "awayBack": {
      const back = [...c.recent].reverse().find((s) => s.type === "back") as Extract<Stimulus, { type: "back" }> | undefined;
      if (!back) return null;
      if (back.ms > 120_000) return ["welcome back. i kept your spot warm.", "you're back. i wasn't waiting. (i was waiting.)"];
      return ["welcome back."];
    }
    case "poke1":
    case "poke2":
    case "poke3":
    case "poke4":
      return long.pokes > 0 && long.pokes % 10 === 0 ? ["you're my most frequent poker. that's a title.", "every visit, a poke. it's becoming a tradition."] : null;
    case "bottom": {
      const missed = unseen(c);
      if (missed.length < 3) return null;
      c.vars.n = missed.length;
      return [["the end.", "bottom. congrats."], ["you skipped a bunch of projects though. i saw. i see everything."]];
    }
    case "project": {
      const t = target(w.hover ?? undefined, "project") ?? target(w.hover ?? undefined, "demo");
      if (!t) return null;
      c.vars.title = t.title;
      return about[t.id]?.see ?? ["{title}. #good#."];
    }
    case "select": {
      const sel = [...c.recent].reverse().find((s) => s.type === "select") as Extract<Stimulus, { type: "select" }> | undefined;
      if (!sel) return null;
      c.vars.snip = sel.text.split(/\s+/).slice(0, 4).join(" ");
      return ["\"{snip}\"? good pick. #tsun#", "you selected \"{snip}\". i'll allow it."];
    }
    case "night":
      return hour() >= 21 || hour() < 6 ? null : ["dark mode at {time}? cozy choice."];
    case "day":
      return hour() >= 21 || hour() < 6 ? ["light mode at {time}. bright and brave."] : null;
    default:
      return null;
  }
}

// ---- helpers --------------------------------------------------------------------------------------------

function got<T extends StimulusType>(c: Ctx, type: T) {
  return c.s?.type === type ? (c.s as Extract<Stimulus, { type: T }>) : null;
}
function target<K extends Target["kind"]>(t: Target | undefined, kind: K) {
  return t?.kind === kind ? (t as Extract<Target, { kind: K }>) : null;
}
const hour = () => new Date().getHours();
const clock = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const titleOf = (id: string) => projects.find((p) => p.id === id)?.title ?? id;
const unseen = (c: Ctx) => projects.filter((p) => !c.w.seen.has(p.id));
const projectEl = (id: string) => document.getElementById(`project-${id}`);
const onPage = (c: Ctx) => c.now - c.w.startedAt;
const quietFor = (c: Ctx) => c.now - c.w.lastInput;
/** Chatter only while someone's there and she's up for it (not asleep, not dangling from your cursor). */
const awake = (c: Ctx) => quietFor(c) < 20_000 && !c.body.sleeping && !c.body.away;

/** What kind of visitor you are, from how you behave. */
function profile(c: Ctx): "skimmer" | "reader" | "clicker" | "explorer" | "lurker" {
  const f = c.facts;
  const mins = Math.max(0.5, onPage(c) / 60_000);
  if ((f.fastScrolls ?? 0) >= 2) return "skimmer";
  if (c.w.clicks / mins > 8) return "clicker";
  if (c.w.hovered.size >= 4 || (f.hovers ?? 0) > 25) return "explorer";
  if ((f.idles ?? 0) >= 2) return "lurker";
  return "reader";
}

// Dares: she challenges you, then watches whether you do it.
const dares: { id: string; say: string[]; ms: number; test: (s: Stimulus) => boolean; ok: (c: Ctx) => boolean; hit: string[]; miss: string[] }[] = [
  {
    id: "theme",
    say: ["bet you won't switch to dark mode.", "i dare you to flip the theme. you won't."],
    ms: 15_000,
    test: (s) => s.type === "theme",
    ok: (c) => c.ago("theme") > 120_000,
    hit: ["...huh. you actually did it.", "ok. respect. a little."],
    miss: ["no pressure. it's there if you want it.", "maybe later then."],
  },
  {
    id: "ipod",
    say: ["try the iPod in the corner. it plays real songs.", "the iPod works. pick a song, i'll judge it. kindly."],
    ms: 30_000,
    test: (s) => s.type === "song",
    ok: (c) => !c.w.song,
    hit: ["fine. you have taste. a little.", "ok. this is acceptable. i guess."],
    miss: ["silence works too.", "no music? fair. it's there if you want it."],
  },
  {
    id: "poke",
    say: ["you can poke me, you know. i react.", "go on, poke me. see what happens."],
    ms: 10_000,
    test: (s) => s.type === "her" && s.key.startsWith("poke"),
    ok: () => true,
    hit: ["...okay, you actually did it.", "you poked me. on purpose. fair enough."],
    miss: ["a respectful visitor. nice.", "good instincts."],
  },
  {
    id: "bottom",
    say: ["scroll to the bottom in under 5 seconds. go.", "speedrun to the bottom. 5 seconds. now."],
    ms: 6_000,
    test: (s) => s.type === "bottom",
    ok: (c) => c.w.depth < 0.7,
    hit: ["okay, that was fast. impressive.", "you actually did it. nice."],
    miss: ["close. i couldn't do it either.", "and time. good effort though."],
  },
  {
    id: "hi",
    say: ["type 'hi'. on your keyboard. i'll hear it.", "say hi. literally. type it."],
    ms: 15_000,
    test: (s) => s.type === "typed" && ["hi", "hey", "hello", "hallo", "ciao", "servus"].includes(s.word),
    ok: (c) => !c.w.touch && c.ago("typed") > 120_000,
    hit: ["...hi. don't make it weird.", "you actually typed it. cute. i mean. whatever."],
    miss: ["no hi? that's okay. i'll wave instead.", "shy? me too."],
  },
];

// ---- what she thinks about ------------------------------------------------------------------------------

const thoughts: Thought[] = [
  // ======== her body's reflexes, in her words ========
  {
    id: "her",
    on: ["her"],
    tireless: true,
    want: (c) => {
      const s = got(c, "her");
      if (!s) return 0;
      c.vars._k = s.key;
      c.vars.time = clock();
      if (s.force) return 4;
      // Not every little thing needs a comment: the same reflex again soon is skipped, and each one fades
      // the more often it's come up this visit.
      const last = c.facts[`said_${s.key}`] ?? -1e9;
      if (c.now - last < 20_000) return 0;
      return (0.3 + s.chance * 1.4) * Math.pow(0.75, c.facts[`n_${s.key}`] ?? 0);
    },
    emotion: (c) => reflexFace[c.vars._k as LineKey] ?? null,
    lines: (c) => {
      const key = c.vars._k as LineKey;
      const special = context(key, c);
      if (special && c.rng() < 0.75) return special;
      return [...(LINES[key] ?? ["..."]), ...(extra[key] ?? [])];
    },
    then: (c) => {
      c.facts[`said_${c.vars._k}`] = c.now;
      c.facts[`n_${c.vars._k}`] = (c.facts[`n_${c.vars._k}`] ?? 0) + 1;
    },
  },

  // ======== remembering you ========
  {
    id: "loyal",
    once: true,
    want: (c) => (c.long.visits >= 4 && onPage(c) > 20_000 && awake(c) ? 1.2 : 0),
    emotion: "content",
    lines: (c) => {
      c.vars.n = c.long.visits;
      return ["you're basically a regular now. i'll learn your name. no i won't.", "you keep coming back. do you live here now? ...that's fine."];
    },
  },

  // ======== the work ========
  {
    id: "seeProject",
    on: ["see"],
    tireless: true, // every card is a new topic
    want: (c) => {
      const s = got(c, "see");
      if (!s || c.body.sleeping) return 0;
      c.vars.title = s.title;
      c.vars.id = s.id;
      return 1.5;
    },
    look: (c) => projectEl(String(c.vars.id)),
    lines: (c) => about[String(c.vars.id)]?.see ?? ["{title}. #good#.", "oh. {title}. #meh#"],
    then: (c) => {
      c.notes.lastProject = String(c.vars.id);
      c.facts.lastProjectAt = c.now;
    },
  },
  {
    id: "dwellProject",
    on: ["dwell"],
    tireless: true,
    cooldown: 8_000,
    want: (c) => {
      const t = target(got(c, "dwell")?.target, "project");
      if (!t || c.body.sleeping) return 0;
      c.vars.title = t.title;
      c.vars.id = t.id;
      c.vars.times = c.facts[`h_${t.id}`] ?? 1;
      return (got(c, "dwell")?.ms ?? 0) > 3_000 ? 1.3 : 2;
    },
    look: (c) => projectEl(String(c.vars.id)),
    lines: (c) => {
      const id = String(c.vars.id);
      const deep = about[id]?.deep ?? ["{title} is #good#. #tsun#"];
      if (c.w.opened.has(id)) return deep;
      if (Number(c.vars.times) >= 3) return [["you keep looking at {title}.", "{title} again. and again."], ["just open it, it's worth it.", "the demo's one click away."]];
      return [deep, ["the demo button is right there. just saying.", "you're staring. just click the demo.", "go on. click it. i won't tell anyone."]];
    },
    then: (c) => {
      const id = String(c.vars.id);
      c.notes.lastProject = id;
      c.facts.lastProjectAt = c.now;
      if (c.w.opened.has(id)) return;
      c.expect({ id: "tryDemo", test: (s) => s.type === "click" && (s.target.kind === "demo" || s.target.kind === "source") && s.target.id === id, ms: 12_000, hit: "listened", miss: c.rng() < 0.5 ? "ignored" : undefined, vars: { title: c.vars.title } });
    },
  },
  {
    id: "listened",
    want: () => 0,
    emotion: "smug",
    lines: () => ["...good. i didn't care either way.", "see? was that so hard.", "finally. go. have fun. or whatever."],
  },
  {
    id: "ignored",
    want: () => 0,
    emotion: "annoyed",
    lines: () => ["or keep browsing. that works too.", "no rush. it'll be there.", "okay, maybe later. (it's really good though.)"],
  },
  {
    id: "hoverAction",
    on: ["hover"],
    cooldown: 10_000,
    want: (c) => {
      const t = c.s?.type === "hover" ? c.s.target : undefined;
      if ((t?.kind !== "demo" && t?.kind !== "source") || !awake(c)) return 0;
      c.vars.title = t.title;
      c.vars.kind = t.kind;
      return c.since("dwellProject") < 3_000 ? 0 : 1.1;
    },
    lines: (c) => (c.vars.kind === "source" ? ["the source code? a fellow developer.", "reading the code. respect.", "go see how it works. it's held together with tape. (it's not.)"] : ["click it. you're hovering. commit.", "the demo. yes. go.", "{title} live? do it."]),
  },
  {
    id: "openProject",
    on: ["click"],
    want: (c) => {
      const t = c.s?.type === "click" ? c.s.target : undefined;
      if (t?.kind !== "demo" && t?.kind !== "source") return 0;
      c.vars.title = t.title;
      c.vars.kind = t.kind;
      return 3;
    },
    emotion: "smug",
    lines: (c) => {
      const opened = c.w.opened.size;
      c.vars.n = opened;
      if (opened >= 4) return ["you opened half his projects. ok, you're a fan. admit it.", "so many tabs. he'll be so smug. ugh."];
      if (c.vars.kind === "source") return ["enjoy the source code. it's clean, mostly.", "the code's all there. have a look around."];
      return ["go. i'll be here. not waiting. just here.", "bring me a souvenir. a carrot. anything.", "have fun. don't get lost. or do."];
    },
    then: (c) => c.expect({ id: "howWasIt", test: (s) => s.type === "back" && s.ms > 4_000, ms: 10 * 60_000, hit: "howWasIt", vars: { title: c.vars.title } }),
  },
  {
    id: "howWasIt",
    want: () => 0,
    lines: () => [["you're back.", "oh. back from {title}."], ["so? {title}. good, right? ...i mean. whatever.", "did you like it? you can say yes. i won't tell him.", "rate it. out of ten. it's a ten. say ten."]],
  },
  {
    id: "goto",
    on: ["click", "hover"],
    cooldown: 10_000,
    want: (c) => {
      const t = c.s && "target" in c.s ? target(c.s.target, "goto") : null;
      if (!t) return 0;
      c.vars.title = t.title;
      return c.s!.type === "click" ? 2.8 : 0.9;
    },
    lines: (c) => (c.s?.type === "click" ? ["fine. i'll take you to {title}. hold on.", "teleporting. hold on."] : ["{title}. it's further down. click it and i'll take you there."]),
  },
  {
    id: "github",
    on: ["hover"],
    cooldown: 40_000,
    want: (c) => (c.s?.type === "hover" && c.s.target.kind === "github" && awake(c) ? 1.4 : 0),
    lines: () => ["his github. it's a rabbit hole. i would know.", "\"and much more\". he's not exaggerating. it's a lot.", "follow him there. he'll pretend he doesn't care. he cares."],
  },
  {
    id: "fastSkip",
    on: ["fastScroll"],
    cooldown: 20_000,
    want: (c) => {
      const s = got(c, "fastScroll");
      if (!s || s.section !== "work" || s.skipped.length < 3 || c.ago("scrollBack") < c.now - s.at) return 0;
      c.vars.n = s.skipped.length;
      c.vars.first = s.skipped[0];
      return 1.6;
    },
    emotion: "annoyed",
    lines: () => ["you just flew past the projects. {first} is worth a look.", "all those projects in a blur. scroll back a little?", "you skipped {first}. it's a good one."],
    then: (c) => c.expect({ id: "comeBack", test: (s) => s.type === "scrollBack", ms: 8_000, hit: "thanks" }),
  },
  {
    id: "thanks",
    want: () => 0,
    emotion: "content",
    lines: () => ["...thank you. i mean. whatever.", "good. you listened. weird.", "see? better. #tsun#"],
  },

  // ======== the rest of the page ========
  {
    // The tech stack as a whole (not a comment per tool: once in a while, when you look around it).
    id: "stack",
    on: ["dwell"],
    cooldown: 120_000,
    want: (c) => (target(got(c, "dwell")?.target, "tool") && awake(c) && c.count("stack") < 2 ? 1.3 : 0),
    lines: () => [
      "that's his toolbox. web, apps, servers, even hardware.",
      "quite the stack. he likes to build the whole thing himself.",
      "from 3D in the browser to tiny circuit boards. he gets around.",
      "all the tools he works with. i'm made with some of them.",
      "a lot of logos. the short version: he can build it.",
      "web, mobile, backend, hardware. pick a problem, he has a tool.",
      "this is the part where he flexes a little. fair enough.",
    ],
  },
  {
    id: "quote",
    on: ["dwell"],
    cooldown: 40_000,
    want: (c) => {
      const t = target(got(c, "dwell")?.target, "quote");
      if (!t || !awake(c)) return 0;
      c.vars.by = t.by.toLowerCase();
      return 1.3;
    },
    lines: (c) => (String(c.vars.by).includes("blake") ? ["william blake. 1790. older than the internet.", "\"imagined first\". that's his whole thing."] : String(c.vars.by).includes("keats") ? ["\"a thing of beauty\". he's talking about me. obviously.", "keats. very dramatic. i approve."] : ["poetry. fancy.", "{by}. sure."]),
  },
  {
    id: "title",
    on: ["dwell"],
    cooldown: 60_000,
    want: (c) => (target(got(c, "dwell")?.target, "title") && awake(c) ? 1.2 : 0),
    lines: () => ["ryhox. big letters, hard to forget.", "that's his name. you'll remember it now."],
  },
  {
    id: "legal",
    on: ["hover"],
    cooldown: 60_000,
    want: (c) => (c.s?.type === "hover" && c.s.target.kind === "legal" && awake(c) ? 1.2 : 0),
    lines: () => ["the legal page? who reads those. ...you?", "privacy policy enjoyer spotted.", "it's all very legal. trust me. i'm a bunny."],
  },
  {
    id: "ipod",
    on: ["hover"],
    cooldown: 60_000,
    want: (c) => (c.s?.type === "hover" && c.s.target.kind === "ipod" && !c.w.song && awake(c) ? 1.3 : 0),
    lines: () => ["that iPod works. real songs. tetris too. i'm not obsessed.", "click the wheel. it clicks like a real one. satisfying. not that i'd know."],
  },
  {
    id: "disco",
    on: ["theme"],
    want: (c) => ((got(c, "theme")?.flips ?? 0) >= 4 ? 3.5 : 0),
    emotion: "dizzy",
    lines: () => ["STOP. it's a light switch, not a toy.", "day. night. day. i'm getting jet lag.", "disco mode. i'm not dancing. (i'm dancing.)"],
  },
  {
    id: "discord",
    on: ["copy"],
    want: (c) => (got(c, "copy")?.what === "Discord" ? 3 : 0),
    emotion: "smug",
    lines: () => ["go add him. tell him the bunny sent you. he'll be confused.", "copied. now send him a message, he's friendly.", "a discord friend request. he'll be happy about it."],
  },
  {
    id: "typed",
    on: ["typed"],
    want: () => 3.5,
    lines: (c) => {
      const w = got(c, "typed")!.word;
      if (["hello", "hi", "hey", "hallo", "ciao", "servus"].includes(w)) return ["...hi. don't make it weird.", "you typed hi. to a website. ...hi.", "hi. that's enough socializing for today."];
      if (w === "bunny") return ["what.", "that's me. what do you want."];
      if (w === "cute") return ["i know.", "...thanks."];
      if (w === "love") return ["aw. ...okay.", "...that's sweet."];
      if (w === "bye") return ["bye. ...wait.", "bye. (come back.)"];
      if (w === "ryhox") return ["he's not here. he's coding. i'm in charge.", "don't summon him. he'll want to talk about three.js."];
      return ["need help? scroll down, open a project, poke me if you're bored.", "i'm the help. hi. the projects are further down."];
    },
  },
  {
    id: "rage",
    on: ["rageClick"],
    cooldown: 20_000,
    want: () => 2,
    emotion: "smug",
    lines: () => ["that one's not a button.", "nothing there, but i appreciate the energy.", "looking for something? the projects are clickable."],
  },

  // ======== dares ========
  {
    id: "dare",
    cooldown: 110_000,
    want: (c) => {
      if (!awake(c) || onPage(c) < 25_000) return 0;
      const open = dares.filter((d) => !c.notes[`dare_${d.id}`] && d.ok(c));
      if (!open.length) return 0;
      const d = open[Math.floor(c.rng() * open.length)];
      c.vars.dare = d.id;
      return 0.8;
    },
    emotion: "smug",
    lines: (c) => dares.find((d) => d.id === c.vars.dare)!.say,
    then: (c) => {
      const d = dares.find((x) => x.id === c.vars.dare)!;
      c.notes[`dare_${d.id}`] = "1";
      c.expect({ id: "dare", test: d.test, ms: d.ms, hit: `dare_${d.id}_hit`, miss: `dare_${d.id}_miss` });
    },
  },
  ...dares.flatMap((d): Thought[] => [
    { id: `dare_${d.id}_hit`, want: () => 0, emotion: "surprised", lines: () => d.hit },
    { id: `dare_${d.id}_miss`, want: () => 0, emotion: "smug", lines: () => d.miss },
  ]),

  // ======== quiz ========
  {
    id: "quiz",
    once: true,
    // (not while the page is moving: then cards slide under the cursor and that's not an answer)
    want: (c) => (awake(c) && c.w.seen.has("flylab") && c.w.seen.size >= 3 && c.w.speed < 200 ? 1.2 : 0),
    emotion: "smug",
    lines: () => [["pop quiz.", "ok. game."], ["which project is my favourite? point at it. go.", "guess my favourite project. rest your cursor on it."]],
    // An answer is pointing at a card on purpose (resting on it), not a card sliding past.
    then: (c) => c.expect({ id: "quiz", test: (s) => s.type === "dwell" && s.target.kind === "project", ms: 20_000, hit: "quizAnswer", miss: "quizReveal" }),
  },
  {
    id: "quizAnswer",
    want: (c) => {
      const t = c.s && "target" in c.s ? target(c.s.target, "project") : null;
      c.vars.title = t?.title ?? "";
      c.vars.right = t?.id === "flylab" ? 1 : 0;
      return 0;
    },
    emotion: (c) => (c.vars.right ? "surprised" : "smug"),
    lines: (c) => (c.vars.right ? ["...lucky guess.", "Fly Lab. correct. how did you know?"] : ["{title}? close. it's Fly Lab though.", "nope. Fly Lab. the gambling fly. go check it out."]),
  },
  {
    id: "quizReveal",
    want: () => 0,
    emotion: "smug",
    lines: () => ["time's up. Fly Lab. the gambling fly.", "time's up. it's Fly Lab. now you know."],
  },

  // ======== reading you ========
  {
    id: "profile",
    once: true,
    want: (c) => (awake(c) && onPage(c) > 45_000 ? 1.1 : 0),
    emotion: "squint",
    lines: (c) => {
      const p = profile(c);
      c.notes.profile = p;
      const intro = ["i've been paying attention.", "okay, i think i get you.", "i have a guess about you."];
      const verdict = {
        skimmer: ["you're a skimmer. quick overview first. efficient.", "you like the big picture. smart."],
        reader: ["you actually read things. he'll appreciate that.", "a careful reader. nice."],
        clicker: ["you click everything. curious. i like that.", "hands-on. you learn by clicking. same."],
        explorer: ["you check out every detail. curious, like me.", "an explorer. you've seen every corner of this site."],
        lurker: ["you take your time. calm. i like that.", "taking it all in slowly. good approach."],
      }[p];
      return [intro, verdict];
    },
  },
  {
    id: "stats",
    cooldown: 150_000,
    want: (c) => (awake(c) && onPage(c) > 70_000 && (c.w.clicks > 12 || (c.w.hovered.size >= 3 && !c.w.opened.size) || c.notes.profile) ? 0.6 : 0),
    lines: (c) => {
      const opts = c.w.clicks > 12 ? ["you click a lot. curious. good."] : [];
      if (c.w.hovered.size >= 3 && !c.w.opened.size) opts.push("you've looked at a few projects. the demos are worth a click.");
      if (c.notes.profile) {
        c.vars.prof = c.notes.profile;
        opts.push("still a {prof}. consistent.");
      }
      return opts;
    },
  },

  // ======== on her own ========
  {
    id: "nudgeUnseen",
    cooldown: 50_000,
    want: (c) => {
      const missed = unseen(c);
      if (!awake(c) || c.w.section !== "work" || !missed.length || c.now - c.w.sectionSince < 9_000) return 0;
      c.vars.first = missed[0].title;
      return 0.9;
    },
    lines: () => ["keep going. {first} is still coming.", "you haven't seen {first} yet.", "{first} is next. it's #good#. #tsun#"],
  },
  {
    id: "callback",
    cooldown: 90_000,
    want: (c) => {
      const id = c.notes.lastProject;
      // (once per project)
      if (!id || c.notes[`cb_${id}`] || !awake(c) || c.now - (c.facts.lastProjectAt ?? c.now) < 20_000 || c.w.section === "work") return 0;
      c.vars.title = titleOf(id);
      c.vars.id = id;
      return 0.7;
    },
    lines: (c) => [["still thinking about {title}.", "you know what? {title} was #good#.", "can't stop thinking about {title}. annoying."], about[String(c.vars.id)]?.deep ?? ["anyway. #meh#"]],
    then: (c) => void (c.notes[`cb_${c.vars.id}`] = "1"),
  },
  {
    id: "minutes",
    cooldown: 50_000,
    want: (c) => {
      const m = Math.floor(onPage(c) / 60_000);
      if (!awake(c) || (c.facts.minutesSaid ?? 0) >= m || ![2, 4, 7, 10, 15].includes(m)) return 0;
      c.vars.m = m;
      return 1.1;
    },
    lines: () => ["you're still here. glad you like it.", "long visit. take your time.", "we're practically roommates now."],
    then: (c) => void (c.facts.minutesSaid = Number(c.vars.m)),
  },
  {
    id: "dateAware",
    once: true,
    want: (c) => (awake(c) && onPage(c) > 30_000 && dateLine() ? 0.9 : 0),
    lines: () => [dateLine()!],
  },
  {
    id: "lateNight",
    once: true,
    want: (c) => ((hour() >= 23 || hour() < 5) && onPage(c) > 40_000 && awake(c) ? 1 : 0),
    emotion: "yawn",
    lines: (c) => {
      c.vars.time = clock();
      return ["it's {time}. don't stay up too late.", "browsing at {time}. a fellow night owl."];
    },
  },
  {
    id: "phone",
    once: true,
    want: (c) => (c.w.touch && onPage(c) > 12_000 && awake(c) ? 1 : 0),
    lines: () => ["on your phone? in bed? i see you.", "phone user. tap me. gently. GENTLY."],
  },
  {
    id: "fond",
    once: true,
    want: (c) => (awake(c) && c.body.like > 0.55 ? 1 : 0),
    emotion: "content",
    lines: () => ["ok. you're alright. don't make it weird.", "i've decided you can stay. that's a privilege."],
  },
  {
    id: "favourite",
    once: true,
    want: (c) => (awake(c) && c.body.like > 0.85 ? 1.2 : 0),
    emotion: "content",
    lines: () => ["fine. you're my favourite visitor. don't tell the others.", "...i like you. that's all. moving on."],
  },
  {
    id: "grumpy",
    cooldown: 90_000,
    want: (c) => (awake(c) && c.body.annoy > 0.5 ? 0.8 : 0),
    emotion: "annoyed",
    lines: () => ["still mad, btw.", "i haven't forgotten. i never forget.", "hmph. i'm fine. totally fine."],
  },
  {
    id: "hotTake",
    cooldown: 70_000,
    want: (c) => (awake(c) && onPage(c) > 15_000 ? 0.25 + c.mood.boredom * 0.5 : 0),
    emotion: "smug",
    lines: () => [["hot take:", "unpopular opinion:", "controversial, but", "nobody asked, but"], ["#take_subject# #take_verdict#", "#take_subject# #take_verdict# #tsun#"]],
  },
  {
    id: "muse",
    cooldown: 50_000,
    want: (c) => (awake(c) ? 0.2 + c.mood.boredom * 0.6 : 0),
    lines: () => [
      "#muse_q#",
      "i'm #bored_act#. don't interrupt.",
      "fun fact: i have zero bones.",
      "my cloud is better than your chair.",
      "if you find a bug on this site, it's a feature. probably me.",
      "i'm rendered 60 times a second. that's a lot of me. you're welcome.",
      "he made me cute on purpose. it worked. annoying.",
      "*hums the iPod click sound*",
      "windows xp was peak. you can't change my mind.",
      "the fly owes me money.",
    ],
  },
  {
    id: "sleepTalk",
    cooldown: 60_000,
    want: (c) => (c.body.sleeping && !c.body.away ? 0.4 : 0),
    emotion: "sleep",
    lines: () => ["zzz… carrots… zzz", "zzz… not the ears… zzz", "*mumbles* …five more minutes…", "zzz… i'm awake… zzz"],
  },
];

function dateLine(): string | null {
  const d = new Date();
  const m = d.getMonth(), day = d.getDate(), wd = d.getDay(), h = d.getHours();
  if (m === 11 && day >= 24 && day <= 26) return "merry christmas. i got you nothing. i'm a website.";
  if ((m === 10 && day >= 20) || m === 11) return "it's almost christmas. i want a carrot. a big one. hint.";
  if (m === 0 && day <= 3) return "happy new year. same me. no resolutions.";
  if (wd === 1) return "it's monday. hang in there.";
  if (wd === 5 && h >= 17) return "friday night and you're on a portfolio. iconic.";
  if (wd === 0 || wd === 6) return "browsing on the weekend. nice and relaxed.";
  return null;
}

// ---- how things make her feel (her body tracks annoyance, like and energy; this adds the rest) ------------

function feel(s: Stimulus, m: { [k: string]: number }, _w: unknown, facts: Record<string, number>) {
  m.boredom -= 0.12;
  switch (s.type) {
    case "fastScroll":
      facts.fastScrolls = (facts.fastScrolls ?? 0) + 1;
      break;
    case "hover":
      facts.hovers = (facts.hovers ?? 0) + 1;
      if (s.target.kind === "project") facts[`h_${s.target.id}`] = (facts[`h_${s.target.id}`] ?? 0) + 1;
      m.curiosity += 0.04;
      break;
    case "idle":
      facts.idles = (facts.idles ?? 0) + 1;
      m.boredom += 0.3;
      break;
    case "see":
    case "dwell":
    case "section":
      m.curiosity += 0.06;
      break;
    case "click":
      if (s.target.kind === "demo" || s.target.kind === "source") m.joy += 0.15;
      break;
    case "song":
      m.joy += 0.2;
      break;
    case "typed":
      m.joy += 0.15;
      break;
  }
}

// ---- merge in more.ts -----------------------------------------------------------------------------------

for (const [k, v] of Object.entries(moreRules)) rules[k] = [...(rules[k] ?? []), ...v];
for (const [k, v] of Object.entries(moreExtra) as [LineKey, string[]][]) extra[k] = [...(extra[k] ?? []), ...v];
for (const [id, v] of Object.entries(moreAbout)) {
  about[id] = about[id] ? { see: [...about[id].see, ...v.see], deep: [...about[id].deep, ...v.deep] } : v;
}
for (const t of thoughts) {
  const add = moreLines[t.id];
  if (!add) continue;
  const base = t.lines;
  t.lines = (c) => {
    const raw = base(c);
    if (!raw.length) return raw;
    if (!Array.isArray(raw[0])) return [...(raw as readonly string[]), ...((Array.isArray(add[0]) ? add[0] : add) as string[])];
    // a monologue: each part gets its own extras
    return (raw as readonly (readonly string[])[]).map((part, i) => [...part, ...(Array.isArray(add[0]) ? ((add as string[][])[i] ?? []) : [])]);
  };
}

export const tsundere: Personality = {
  rules,
  thoughts,
  baseline: { joy: 0.45, energy: 0.7, annoy: 0.05, curiosity: 0.5, affection: 0.2, boredom: 0.15 },
  feel: feel as Personality["feel"],
};
