"use client";

import { useEffect } from "react";
import { gsap } from "gsap";

// Project buttons. The fill grows from where the pointer came in and shrinks toward where it left (the rest
// is CSS, see .act). Hovering a button also takes over the picture above:
// "Live demo" turns it into a browser loading the real address, "Source code" decodes a few real lines of
// the project's code out of scrambled characters, and a project without a demo gets stamped.

const GLYPHS = "<>{}[]()/*=+-;:.#%&@01";

type Overlay = { start: () => void; stop: () => void; dispose: () => void };

// Colours for a tiny highlighter: enough to read as code, nothing more.
const INK = { text: "#c9d6f5", comment: "#7d8fbf", string: "#9be7a6", number: "#ffd479", keyword: "#8ec5ff", call: "#ffffff", dim: "#6478ad" };
const KEYWORDS = new Set(
  "async await const let var function return if else for while new export import from type class public private static final void int double boolean true false null this try catch".split(" "),
);
type Tok = { t: string; c: string };

function highlight(lines: string[]): Tok[][] {
  let inBlock = false;
  return lines.map((line) => {
    if (line.trim() === "…") return [{ t: line, c: INK.dim }];
    const out: Tok[] = [];
    let i = 0;
    while (i < line.length) {
      const rest = line.slice(i);
      if (inBlock || rest.startsWith("/*")) {
        const end = line.indexOf("*/", i + 2);
        inBlock = end < 0;
        const stop = end < 0 ? line.length : end + 2;
        out.push({ t: line.slice(i, stop), c: INK.comment });
        i = stop;
        continue;
      }
      if (rest.startsWith("//")) {
        out.push({ t: rest, c: INK.comment });
        break;
      }
      const ch = line[i];
      if (ch === '"' || ch === "'" || ch === "`") {
        let j = i + 1;
        while (j < line.length && line[j] !== ch) j += line[j] === "\\" ? 2 : 1;
        out.push({ t: line.slice(i, j + 1), c: INK.string });
        i = j + 1;
        continue;
      }
      const num = /^\d+(\.\d+)?/.exec(rest);
      if (num && !/[\w$]/.test(line[i - 1] ?? "")) {
        out.push({ t: num[0], c: INK.number });
        i += num[0].length;
        continue;
      }
      const word = /^[A-Za-z_$][\w$]*/.exec(rest);
      if (word) {
        const w = word[0];
        const call = line.slice(i + w.length).trimStart().startsWith("(");
        out.push({ t: w, c: KEYWORDS.has(w) ? INK.keyword : call ? INK.call : INK.text });
        i += w.length;
        continue;
      }
      out.push({ t: ch, c: INK.text });
      i++;
    }
    return out;
  });
}

function codeFor(media: HTMLElement): Overlay | null {
  const canvas = media.querySelector<HTMLCanvasElement>(".mfx-code");
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return null;
  const file = canvas.dataset.file ?? "";
  const lines = (canvas.dataset.code ?? "").split("\n");
  // The file's path first (dim), a blank line, then the code.
  const rows: Tok[][] = [[{ t: file, c: INK.dim }], [], ...highlight(lines)];
  const longest = Math.max(...rows.map((r) => r.reduce((n, t) => n + t.t.length, 0)));
  let p = 0;
  let target = 0;
  let running = false;
  let last = 0;

  const frame = (time: number) => {
    const dt = last ? Math.min(0.05, time - last) : 1 / 60;
    last = time;
    // Toward the target and stop there (overshooting and stepping back each frame left the wipe hovering a
    // few columns short of the right edge, its scrambled band flickering there).
    if (p < target) p = Math.min(target, p + dt * 2.2);
    else if (p > target) p = Math.max(target, p - dt * 3.2);
    const w = media.clientWidth;
    const h = media.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (p <= 0 && target === 0) {
      running = false;
      gsap.ticker.remove(frame);
      last = 0;
      return;
    }
    // Under the browser bar, sized so the longest line fits across and every line fits above the label.
    const pad = Math.max(20, w * 0.045);
    const top = 50 + Math.max(16, h * 0.06);
    const size = Math.max(9, Math.min(15, (w - pad * 2) / (longest * 0.61), (h - top - 76) / (rows.length * 1.6)));
    ctx.font = `600 ${size}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    ctx.textBaseline = "top";
    const cw = ctx.measureText("M").width;
    const lh = size * 1.6;
    const cols = Math.ceil(w / cw);
    const left = Math.round(pad / cw);
    // The dark sheet wipes in left → right; a band of scrambled characters rides its edge, and behind it the
    // real code is left standing.
    const edge = p * (cols + 16) - 8;
    ctx.fillStyle = "rgba(9, 22, 58, 0.94)";
    ctx.fillRect(0, 0, Math.max(0, Math.min(cols, edge)) * cw, h);
    const band = (c: number) => Math.abs(c - edge) < 2.5;
    const glyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];
    for (let r = 0, y = top; y < h; r++, y += lh) {
      const toks = rows[r];
      let col = left;
      if (toks) {
        for (const tk of toks) {
          // The settled part of this token in one go; anything at the edge scrambles; past it, nothing yet.
          const settled = Math.max(0, Math.min(tk.t.length, Math.ceil(edge - 2.5 - col)));
          if (settled > 0) {
            ctx.fillStyle = tk.c;
            ctx.fillText(tk.t.slice(0, settled), col * cw, y);
          }
          col += tk.t.length;
        }
      }
      // The edge's scramble runs the full height (dim where there's no code, white over code).
      for (let c = Math.max(0, Math.floor(edge - 2.5)); c <= Math.min(cols, Math.ceil(edge + 2.5)); c++) {
        if (!band(c)) continue;
        ctx.fillStyle = toks && c >= left && c < col ? "#fff" : "rgba(170, 195, 255, 0.35)";
        ctx.fillText(glyph(), c * cw, y);
      }
    }
    // Fully in (or out): this is the last frame that needs drawing.
    if (p === target) {
      running = false;
      gsap.ticker.remove(frame);
      last = 0;
    }
  };

  const run = () => {
    if (!running) {
      running = true;
      gsap.ticker.add(frame);
    }
  };
  return {
    start() {
      target = 1;
      run();
    },
    stop() {
      target = 0;
      run();
    },
    dispose() {
      gsap.ticker.remove(frame);
    },
  };
}

export default function ActionFx({ ready }: { ready: boolean }) {
  useEffect(() => {
    if (!ready) return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const offs: (() => void)[] = [];

    // Flood fill.
    for (const el of document.querySelectorAll<HTMLElement>("[data-act]")) {
      const at = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--x", `${e.clientX - r.left}px`);
        el.style.setProperty("--y", `${e.clientY - r.top}px`);
      };
      const enter = (e: PointerEvent) => {
        at(e);
        el.classList.add("is-on");
      };
      const leave = (e: PointerEvent) => {
        at(e);
        el.classList.remove("is-on");
      };
      const focus = () => {
        if (!el.matches(":focus-visible")) return;
        el.style.setProperty("--x", "50%");
        el.style.setProperty("--y", "50%");
        el.classList.add("is-on");
      };
      const blur = () => el.classList.remove("is-on");
      el.addEventListener("pointerenter", enter);
      el.addEventListener("pointerleave", leave);
      el.addEventListener("focus", focus);
      el.addEventListener("blur", blur);
      offs.push(() => {
        el.removeEventListener("pointerenter", enter);
        el.removeEventListener("pointerleave", leave);
        el.removeEventListener("focus", focus);
        el.removeEventListener("blur", blur);
      });
    }

    // The picture reacts to the button you're on.
    if (fine && !reduced) {
      for (const panel of document.querySelectorAll<HTMLElement>(".panel")) {
        const media = panel.querySelector<HTMLElement>(".panel-media");
        if (!media) continue;
        const code = codeFor(media);
        const bind = (sel: string, cls: string, on?: () => void, off?: () => void) => {
          const btn = panel.querySelector<HTMLElement>(sel);
          if (!btn) return;
          const enter = () => {
            panel.classList.add(cls);
            on?.();
          };
          const leave = () => {
            panel.classList.remove(cls);
            off?.();
          };
          btn.addEventListener("pointerenter", enter);
          btn.addEventListener("pointerleave", leave);
          btn.addEventListener("focus", enter);
          btn.addEventListener("blur", leave);
          offs.push(() => {
            btn.removeEventListener("pointerenter", enter);
            btn.removeEventListener("pointerleave", leave);
            btn.removeEventListener("focus", enter);
            btn.removeEventListener("blur", leave);
          });
        };
        bind(".act--solid", "is-demo");
        bind(
          ".act--line",
          "is-code",
          () => code?.start(),
          () => code?.stop(),
        );
        bind(".act--none", "is-none");
        if (code) offs.push(() => code.dispose());
      }
    }
    return () => offs.forEach((o) => o());
  }, [ready]);

  return null;
}
