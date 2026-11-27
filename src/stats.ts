import { projects, type ProjectId, type Stat } from "./content";

// The numbers under each project (content.ts), with the live ones brought up to date: the downloads on Modrinth
// and on CurseForge, added up, and Pokyh's accounts and schools. Fetched on the server when the page is built and
// again every hour after that (page.tsx), so visitors' browsers never ask any of these sites. If one doesn't answer in time, its last known count
// below stands in, so the total never drops or leaves a gap, and the page never waits on them.

const HOUR = 3600;

// Last known downloads (2026-11-25), per site and slug.
const LAST: Record<string, number> = {
  "modrinth:projectile.preview": 12422,
  "curseforge:projectile-preview": 1872,
};

async function json(url: string, headers: Record<string, string> = {}): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "ryhox.dev", ...headers },
      next: { revalidate: HOUR },
      signal: AbortSignal.timeout(4000),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function modrinth(slug: string) {
  const n = (await json(`https://api.modrinth.com/v2/project/${slug}`))?.downloads;
  return typeof n === "number" ? n : (LAST[`modrinth:${slug}`] ?? 0);
}

// (CurseForge's own API needs a key; CFWidget is a free public mirror of its project pages.)
async function curseforge(slug: string) {
  const d = (await json(`https://api.cfwidget.com/minecraft/mc-mods/${slug}`))?.downloads as { total?: unknown } | undefined;
  return typeof d?.total === "number" ? d.total : (LAST[`curseforge:${slug}`] ?? 0);
}

// Pokyh's own numbers: all its accounts (students and parents) and the schools they're at. Its API needs a key
// (POKYH_API_KEY, in .env.local and on the host); it stays on the server, since only the server ever asks.
// Without the key, or if the API doesn't answer, the value in content.ts stands in.
async function pokyh(what: "users" | "schools"): Promise<number | null> {
  const key = process.env.POKYH_API_KEY;
  if (!key) return null;
  const d = await json("https://api.pokyh.com/stats", { "X-API-Key": key });
  const n = what === "users" ? (d?.users as { total?: unknown } | undefined)?.total : d?.schools;
  return typeof n === "number" ? n : null;
}

// 14294 → "14.3k", 980 → "980"
const short = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 1 : 2).replace(/\.?0+$/, "")}k` : String(n));

export async function getStats(): Promise<Record<ProjectId, Stat[]>> {
  const entries = await Promise.all(
    projects.map(async (p) => {
      const stats = await Promise.all(
        p.stats.map(async (s) => {
          if (!s.live) return s;
          if (s.live.pokyh) {
            const n = await pokyh(s.live.pokyh);
            return n !== null && n > 0 ? { ...s, value: short(n) } : s;
          }
          const [m, c] = await Promise.all([s.live.modrinth ? modrinth(s.live.modrinth) : 0, s.live.curseforge ? curseforge(s.live.curseforge) : 0]);
          return m + c > 0 ? { ...s, value: short(m + c) } : s;
        }),
      );
      return [p.id, stats] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<ProjectId, Stat[]>;
}
