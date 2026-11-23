// Her sentence maker: a tiny Tracery-style grammar. A line is built from pieces, so the same thought comes out
// differently every time instead of being one hardcoded string.
//
//   "#hey#, {title} is #good#[ #happy#]"
//
//   #symbol#      a random pick from rules[symbol] (which can contain more #symbols# and {vars})
//   #symbol.cap#  same, first letter uppercase (.up = all caps)
//   {var}         a value from the situation (the project she's looking at, the song, the time...)
//   [text]        maybe: kept half the time
//   a|b|c         inside [ ] or at top level of a rule entry: not special, just write separate entries
//
// Picks avoid what was used recently for that same symbol, so she doesn't repeat herself.

export type Rules = Record<string, string[]>;
export type Vars = Record<string, string | number | null | undefined>;

export class Grammar {
  private recent = new Map<string, string[]>();

  constructor(
    private rules: Rules,
    private rng: () => number = Math.random,
  ) {}

  /** A random option, skipping the ones used recently under the same key. */
  pick<T>(key: string, options: readonly T[]): T {
    if (options.length <= 1) return options[0];
    const used = (this.recent.get(key) ?? []) as T[];
    const fresh = options.filter((o) => !used.includes(o));
    const pool = fresh.length ? fresh : options;
    const choice = pool[Math.floor(this.rng() * pool.length)];
    used.push(choice);
    // Remember most of the list, so she cycles through nearly everything before a repeat.
    const keep = Math.max(1, Math.ceil(options.length * 0.7));
    while (used.length > keep) used.shift();
    this.recent.set(key, used as unknown as string[]);
    return choice;
  }

  expand(template: string | readonly string[], vars: Vars = {}, key = "_"): string {
    const t = typeof template === "string" ? template : this.pick(key, template);
    return tidy(this.fill(t, vars, 0));
  }

  private fill(t: string, vars: Vars, depth: number): string {
    if (depth > 10) return t;
    // Maybe-parts first (innermost), then symbols, then the situation's values.
    let out = t;
    for (let i = 0; i < 4 && /\[[^[\]]*\]/.test(out); i++) {
      out = out.replace(/\[([^[\]]*)\]/g, (_, inner: string) => (this.rng() < 0.5 ? inner : ""));
    }
    out = out.replace(/#(\w+)((?:\.\w+)*)#/g, (_, sym: string, mods: string) => {
      const options = this.rules[sym];
      if (!options?.length) return "";
      let s = this.fill(this.pick(sym, options), vars, depth + 1);
      for (const m of mods.split(".").filter(Boolean)) s = modify(s, m);
      return s;
    });
    out = out.replace(/\{(\w+)\}/g, (_, v: string) => {
      const val = vars[v];
      return val === null || val === undefined ? "" : String(val);
    });
    return out;
  }
}

function modify(s: string, m: string) {
  if (m === "cap") return s.charAt(0).toUpperCase() + s.slice(1);
  if (m === "up") return s.toUpperCase();
  if (m === "low") return s.toLowerCase();
  return s;
}

/** Cleans up the seams left by empty picks: double spaces, space before punctuation. */
function tidy(s: string) {
  return s
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,!?…]|\.(?!\.))/g, "$1")
    .replace(/,([.!?])/g, "$1")
    .replace(/([!?]),/g, "$1")
    .trim();
}
