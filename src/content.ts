import { links, type ProjectLinks } from "./links";

export const profile = {
  handle: "ryhox",
  // The About headline ("==words==" get the highlighter).
  statement: "I build ==playful, tactile== things for the web.",
  note: "Open for freelance, collabs and weird ideas.",
};

// Lines by poets, set big between the sections (the first after the statement, the second before contact).
// Both are long out of copyright; the wording follows the first editions.
export type Quote = { text: string; by: string; work: string };

export const quotes: Quote[] = [
  { text: "What is now proved was once only imagin'd.", by: "William Blake", work: "Proverbs of Hell, 1790" },
  { text: "A thing of beauty is a joy for ever.", by: "John Keats", work: "Endymion, 1818" },
];

export const github = { handle: "Ryhox", href: links.github };

export type ProjectId = keyof typeof links.projects;

type Project = {
  id: ProjectId;
  title: string;
  description: string;
  stack: string;
  video: string;
  poster: string;
  // A smaller AV1 cut of the clip, for browsers that can play it (the H.264 `video` is the fallback).
  av1?: string;
  focus?: string;
  links: ProjectLinks;
  // Its numbers, big, beside the description. Real ones, counted from the project itself (its repo, its README,
  // its users) on 2026-11-25. `live`: refreshed every hour (stats.ts), the mod's downloads from where it is
  // published, Pokyh's accounts and schools from its own API; the value written here stands in until then.
  stats: Stat[];
  // A few real lines from the repo, shown when you point at "Source code": short and plain enough that anyone
  // can follow what they do. Copied as they are (a "…" line marks lines left out).
  code: { file: string; lines: string[] };
};

// (`live.modrinth` / `live.curseforge`: the project's slug there; the downloads on both are added up.
// `live.pokyh`: which of Pokyh's own numbers this is.)
export type Stat = { value: string; label: string; live?: { modrinth?: string; curseforge?: string; pokyh?: "users" | "schools" } };

// Clips are pre-encoded small (H.264, 1120px, no audio, faststart) with a WebP poster for instant paint.
export const projects: Project[] = [
  {
    id: "pokyh",
    title: "Pokyh",
    description: "WebUntis, reimagined: timetable, grades and the cafeteria menu in one installable app.",
    stack: "Next.js · PWA · Push notifications",
    video: "/work/pokyh.mp4",
    av1: "/work/pokyh.av1.mp4",
    poster: "/work/pokyh.webp",
    links: links.projects.pokyh,
    stats: [
      { value: "121", label: "people use it", live: { pokyh: "users" } },
      { value: "8", label: "schools", live: { pokyh: "schools" } },
    ],
    code: {
      file: "lib/grades.ts",
      lines: [
        "export function averageOf(values: number[]): number {",
        "  if (!values.length) return 0;",
        "  return round2(values.reduce((a, b) => a + b, 0) / values.length);",
        "}",
        "",
        "export function gradeClass(value: number): GradeClass {",
        "  if (value >= 9) return 'v-excellent';",
        "  if (value >= 6) return 'v-positive';",
        "  if (value > 4) return 'v-negative';",
        "  return 'v-critical';",
        "}",
      ],
    },
  },
  {
    id: "stargazer",
    title: "Stargazer Islands",
    description: "An explorable Three.js island world. Star the repo and you get your own island in it.",
    stack: "Three.js · React Three Fiber · GLSL",
    video: "/work/stargazer.mp4",
    av1: "/work/stargazer.av1.mp4",
    poster: "/work/stargazer.webp",
    links: links.projects.stargazer,
    stats: [{ value: "65,536", label: "live water cells" }, { value: "44", label: "island types" }],
    code: {
      file: "src/scene/archipelago/archipelago.ts",
      lines: [
        "export function buildIslands(logins: string[]): IslandInstance[] {",
        "  …",
        "  const stars: IslandInstance[] = logins.map((login, rank) => {",
        "    const seed = hashLogin(login.toLowerCase())",
        "    const rng = mulberry32(seed)",
        "    // Three permanent rolls from the username hash: theme (group), the look",
        "    // within it, and the size tier. Order matters, keep it stable.",
        "    let theme = pickWeighted(THEMES, rng)",
        "    let biome = pickWeighted(theme.variants, rng)",
        "    let size = pickWeighted(SIZE_TIERS, rng)",
      ],
    },
  },
  {
    id: "flylab",
    title: "Fly Lab",
    description: "A real fruit-fly connectome, a stubborn little gambler, and a slot machine that never pays.",
    stack: "Connectome simulation · WebGL",
    video: "/work/flylab.mp4",
    av1: "/work/flylab.av1.mp4",
    poster: "/work/flylab.webp",
    links: links.projects.flylab,
    stats: [{ value: "60,001", label: "neurons" }, { value: "151.9M", label: "synapses" }],
    code: {
      file: "src/game/machine.js",
      lines: [
        "/** One spin in seven pays. A real machine is not a fountain and neither is this. */",
        "const WIN_RATE = 0.14;",
        "…",
        "export function rollOutcome(rng = Math.random, { winRate = WIN_RATE, nearMissRate = 0.45 } = {}) {",
        "  if (rng() < winRate) {",
        "    const s = pickWeighted(rng);",
        "    return { reels: [s, s, s], win: true, jackpot: SYMBOLS[s].id === 'seven' };",
        "  }",
      ],
    },
  },
  {
    id: "elsewhere",
    title: "Little Elsewhere",
    description: "A cozy pixel-art idle game about growing a tiny world from a single spring.",
    stack: "TypeScript · React · Canvas 2D",
    video: "/work/elsewhere.mp4",
    av1: "/work/elsewhere.av1.mp4",
    poster: "/work/elsewhere.webp",
    links: links.projects.elsewhere,
    stats: [{ value: "22", label: "buildings" }, { value: "40", label: "achievements" }],
    code: {
      file: "src/art/kit.ts",
      lines: [
        "/** A little paned window. Returns its glow rectangle for night lighting. */",
        "export function windowAt(p: Pix, x: number, y: number, w = 5, h = 5): number[] {",
        "  p.rect(x, y, w, h, PAL.woodDark[1]);",
        "  p.rect(x + 1, y + 1, w - 2, h - 2, PAL.blue[3]);",
        "  p.set(x + 1, y + 1, PAL.blue[4]);",
        "  p.rect(x, y + h, w, 1, PAL.wood[4]);",
        "  return [x + 1, y + 1, w - 2, h - 2, GLOW_LAMPLIT];",
        "}",
      ],
    },
  },
  {
    id: "wieland",
    title: "Wieland AI",
    description: "A locally hosted AI assistant running on Ollama. Private, fast, no cloud required.",
    stack: "JavaScript · Ollama",
    video: "/work/wieland.mp4",
    av1: "/work/wieland.av1.mp4",
    poster: "/work/wieland.webp",
    // Wide recording: keep the prompt box in frame when the panel crops the sides.
    focus: "18% 50%",
    links: links.projects.wieland,
    stats: [],
    code: {
      file: "server/server.js",
      lines: [
        "async function generateChatTitle(",
        "  firstUserMessage,",
        '  model = getModelForPlan("free"),',
        ") {",
        "  const truncated = firstUserMessage.slice(0, 200);",
        "  try {",
        "    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {",
        '      method: "POST",',
        '      headers: { "Content-Type": "application/json" },',
        "  …",
      ],
    },
  },
  {
    id: "projectile",
    title: "Projectile Preview",
    description: "A client-side Fabric mod for Minecraft that shows where your projectiles will land before you shoot or throw.",
    stack: "Java · Fabric",
    video: "/work/projectile.mp4",
    av1: "/work/projectile.av1.mp4",
    poster: "/work/projectile.webp",
    links: links.projects.projectile,
    stats: [{ value: "14.3k", label: "downloads", live: { modrinth: "projectile.preview", curseforge: "projectile-preview" } }],
    code: {
      file: "src/client/…/projectile/TrajectorySim.java",
      lines: [
        "// First integrate the pure physics path, so entities can be gathered in one query.",
        "…",
        "for (int i = 1; i <= steps; i++) {",
        "    if (decayBeforeMove) {",
        "        vel = vel.add(0.0, -gravity, 0.0).scale(drag);",
        "    }",
        "",
        "    pos = pos.add(vel.scale(stepTime));",
        "    path[i] = pos;",
      ],
    },
  },
];

// The About section ("What I do"): one row per trade, with the tools it's done with (their logos live in
// public/logos). `proof` points at the work.
export type Tool = { name: string; logo: string; what: string; url: string };

export type Ability = {
  id: "motion" | "apps" | "data" | "mods";
  title: string;
  line: string;
  tools: Tool[];
  proof: { label: string; project?: ProjectId }[];
};

export const abilities: Ability[] = [
  {
    id: "motion",
    title: "3D & motion",
    line: "Real-time 3D in a browser tab, and pages that move like they mean it.",
    tools: [
      { name: "Three.js", logo: "three", what: "The 3D engine of the web: scenes, lights and cameras, drawn with WebGL.", url: "https://threejs.org" },
      { name: "GSAP", logo: "gsap", what: "Animation timelines and scroll choreography, to the frame.", url: "https://gsap.com" },
      { name: "Lenis", logo: "lenis", what: "Smooth scrolling, so a page glides instead of jumping.", url: "https://lenis.darkroom.engineering" },
    ],
    proof: [{ label: "Stargazer Islands", project: "stargazer" }, { label: "this site" }],
  },
  {
    id: "apps",
    title: "Everyday apps",
    line: "Apps people open every day, on the web and on phones.",
    tools: [
      { name: "JavaScript", logo: "js", what: "The language of the web, running in every browser there is.", url: "https://developer.mozilla.org/docs/Web/JavaScript" },
      { name: "TypeScript", logo: "ts", what: "JavaScript with types, so mistakes show up before anyone else sees them.", url: "https://www.typescriptlang.org" },
      { name: "React", logo: "react", what: "Builds interfaces out of small components that update themselves.", url: "https://react.dev" },
      { name: "Next.js", logo: "next", what: "The React framework this site runs on: routing, rendering, speed.", url: "https://nextjs.org" },
      { name: "Flutter", logo: "flutter", what: "One codebase for real apps on iPhone, Android and the web.", url: "https://flutter.dev" },
    ],
    proof: [{ label: "Pokyh", project: "pokyh" }, { label: "Little Elsewhere", project: "elsewhere" }],
  },
  {
    id: "data",
    title: "Servers & data",
    line: "The servers and the databases behind the apps.",
    tools: [
      { name: "Node.js", logo: "node", what: "JavaScript on the server: APIs, bots and the tools behind the apps.", url: "https://nodejs.org" },
      { name: "PostgreSQL", logo: "postgres", what: "A rock-solid database for data that has to be right.", url: "https://www.postgresql.org" },
      { name: "MySQL", logo: "mysql", what: "The classic open-source SQL database, quick and everywhere.", url: "https://www.mysql.com" },
    ],
    proof: [{ label: "Wieland AI", project: "wieland" }, { label: "Fly Lab", project: "flylab" }],
  },
  {
    id: "mods",
    title: "Mods & hardware",
    line: "Minecraft mods, and code for things that don’t live in a browser.",
    tools: [
      { name: "Java", logo: "java", what: "What Minecraft is made of, and the mods I write for it.", url: "https://dev.java" },
      { name: "C#", logo: "csharp", what: "Microsoft’s language, for Unity games and Windows tools.", url: "https://learn.microsoft.com/dotnet/csharp/" },
      { name: "Arduino", logo: "arduino", what: "Little boards that let code switch, sense and move real things.", url: "https://www.arduino.cc" },
    ],
    proof: [{ label: "Projectile Preview", project: "projectile" }],
  },
];

export const socials = [
  { label: "GitHub", href: links.github },
  { label: "Email", href: links.email },
  // No href: Discord handles are copied to the clipboard.
  { label: "Discord", handle: links.discord },
];
