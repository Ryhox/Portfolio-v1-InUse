import { projects, type ProjectId, type Stat } from "./content";

// The numbers under each project (content.ts), with the live ones brought up to date: the downloads on Modrinth
// and on CurseForge, added up. Fetched on the server when the page is built and again every hour after that
// (page.tsx), so visitors' browsers never ask either site. If one doesn't answer in time, its last known count
// below stands in, so the total never drops or leaves a gap, and the page never waits on them.

const HOUR = 3600;

// Last known downloads (2026-11-25), per site and slug.
const LAST: Record<string, number> = {
  "modrinth:projectile.preview": 12422,
  "curseforge:projectile-preview": 1872,
};

async function json(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "ryhox.dev" },
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

// 14294 → "14.3k", 980 → "980"
const short = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 1 : 2).replace(/\.?0+$/, "")}k` : String(n));

export async function getStats(): Promise<Record<ProjectId, Stat[]>> {
  const entries = await Promise.all(
    projects.map(async (p) => {
      const stats = await Promise.all(
        p.stats.map(async (s) => {
          if (!s.live) return s;
          const [m, c] = await Promise.all([s.live.modrinth ? modrinth(s.live.modrinth) : 0, s.live.curseforge ? curseforge(s.live.curseforge) : 0]);
          return m + c > 0 ? { ...s, value: short(m + c) } : s;
        }),
      );
      return [p.id, stats] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<ProjectId, Stat[]>;
}
