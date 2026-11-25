"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { abilities, type Tool } from "@/content";
import { sky } from "@/lib/scroll";
import { gpuReady } from "@/lib/gpu";

// What I do: one row per trade, its tools as Liquid Glass capsules (the iOS 26 material: frosted, bending the
// clouds behind through its rim, splitting the colours at the edge). The glass itself is drawn by the sky's
// shader right under each capsule (Backdrop.tsx), so it bends the real clouds in every browser for the cost of
// one pass; the capsule on top carries the rim light, the icon and the name. Point at one and it leans after the
// pointer like a drop of liquid and its row says what the tool is; press it and it gives. The rows come in with
// the scroll (Motion.tsx), and the clouds thicken behind them so there's always something to bend.

function Body({ tool }: { tool: Tool }) {
  return (
    <span className="cap-body">
      <span className="cap-icon">
        {/* eslint-disable-next-line @next/next/no-img-element -- small SVG logos */}
        <img src={`/logos/${tool.logo}.svg`} alt="" width={28} height={28} decoding="async" />
      </span>
      <span className="cap-name">{tool.name}</span>
    </span>
  );
}

export default function Stack() {
  const root = useRef<HTMLDivElement>(null);

  // The sky draws glass under these, while they're near the screen.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let alive = true;
    // (Not on touch screens: there the capsules are their own glass, CSS, so they can't trail the scroll.)
    // (no glass from the sky on touch screens or without a graphics card: there the capsule is its own glass)
    gpuReady().then((g) => {
      if (!alive || g.soft || window.matchMedia("(pointer: coarse)").matches) return;
      sky.glass = Array.from(el.querySelectorAll<HTMLElement>(".glass-cap"));
      sky.glassMoved = true;
      // (Their transforms read once now, while the loader is up: the sky reads them each frame near the tech
      // stack, Backdrop.tsx, and the very first read of each made the browser work out the styles on the spot.)
      for (const cap of sky.glass) {
        gsap.getProperty(cap, "x");
        if (cap.parentElement) gsap.getProperty(cap.parentElement, "x");
      }
    });
    // Each time it comes near (and whenever it changes size) the sky measures where the capsules sit, once.
    const io = new IntersectionObserver(
      ([e]) => {
        sky.glassNear = e.isIntersecting;
        if (e.isIntersecting) sky.glassMoved = true;
      },
      { rootMargin: "50% 0px" },
    );
    io.observe(el);
    const ro = new ResizeObserver(() => (sky.glassMoved = true));
    ro.observe(el);
    return () => {
      alive = false;
      ro.disconnect();
      io.disconnect();
      sky.glass = [];
      sky.glassNear = false;
    };
  }, []);

  // Pointing at a capsule (or tabbing to it): its row's line rolls over to say what the tool is. (No sounds.)
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const offs: (() => void)[] = [];
    const swaps = new Map<HTMLElement, gsap.core.Timeline>();
    const say = (row: HTMLElement, text: string) => {
      const line = row.querySelector<HTMLElement>(".st-line-in");
      if (!line || line.dataset.says === text) return;
      line.dataset.says = text;
      swaps.get(row)?.kill();
      if (reduced) {
        line.textContent = text;
        return;
      }
      swaps.set(
        row,
        gsap
          .timeline()
          .to(line, { yPercent: -60, opacity: 0, duration: 0.14, ease: "power2.in" })
          .add(() => {
            line.textContent = text;
          })
          .fromTo(line, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.45, ease: "expo.out", immediateRender: false }),
      );
    };

    el.querySelectorAll<HTMLAnchorElement>(".glass-cap").forEach((a) => {
      const row = a.closest<HTMLElement>(".st-row")!;
      const trade = row.dataset.line ?? "";
      const what = a.dataset.what ?? "";
      // Like a drop of liquid: it leans after the pointer and stretches the way it's pulled.
      const x = gsap.quickTo(a, "x", { duration: 0.35, ease: "power3.out" });
      const y = gsap.quickTo(a, "y", { duration: 0.35, ease: "power3.out" });
      const sx = gsap.quickTo(a, "scaleX", { duration: 0.5, ease: "elastic.out(1, 0.5)" });
      const sy = gsap.quickTo(a, "scaleY", { duration: 0.5, ease: "elastic.out(1, 0.5)" });
      let pressed = false;
      const move = (e: PointerEvent) => {
        if (e.pointerType === "touch") return;
        const r = a.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        a.style.setProperty("--la", (Math.atan2(ny, nx) * 180) / Math.PI + 90 + "deg");
        if (!fine || reduced || pressed) return;
        x(nx * Math.min(18, r.width * 0.1));
        y(ny * 8);
        sx(1 + Math.abs(nx) * 0.06 - Math.abs(ny) * 0.02);
        sy(1 + Math.abs(ny) * 0.08 - Math.abs(nx) * 0.03);
      };
      // A finger on a capsule is usually the start of a scroll, not a hover or a press: touches get none of
      // that (no squeeze, no line swap, no spring back when the browser takes the scroll), and a
      // tap that really lands gets a quick press instead (in up).
      const touch = (e: PointerEvent) => e.pointerType === "touch";
      const enter = (e: PointerEvent) => {
        if (touch(e)) return;
        a.style.setProperty("--hl", "1");
        say(row, what);
        move(e);
      };
      const leave = (e?: Event) => {
        if (e instanceof PointerEvent && touch(e)) return;
        a.style.setProperty("--hl", "0");
        a.style.removeProperty("--la");
        pressed = false;
        say(row, trade);
        if (reduced) return;
        x(0);
        y(0);
        sx(1);
        sy(1);
      };
      const down = (e: PointerEvent) => {
        if (touch(e)) return;
        pressed = true;
        a.style.setProperty("--hl", "2");
        if (reduced) return;
        sx(0.95);
        sy(0.95);
      };
      const up = (e: PointerEvent) => {
        if (touch(e)) {
          if (reduced) return;
          gsap.fromTo(a, { scaleX: 0.95, scaleY: 0.95 }, { scaleX: 1, scaleY: 1, duration: 0.45, ease: "elastic.out(1, 0.5)", overwrite: "auto" });
          return;
        }
        if (!pressed) return;
        pressed = false;
        a.style.setProperty("--hl", fine ? "1" : "0");
        if (reduced) return;
        sx(1);
        sy(1);
      };
      a.addEventListener("pointermove", move);
      const focus = () => a.matches(":focus-visible") && say(row, what);
      a.addEventListener("pointerenter", enter);
      a.addEventListener("pointerleave", leave);
      a.addEventListener("pointerdown", down);
      a.addEventListener("pointerup", up);
      a.addEventListener("pointercancel", leave);
      a.addEventListener("focus", focus);
      a.addEventListener("blur", leave);
      offs.push(() => {
        a.removeEventListener("pointermove", move);
        a.removeEventListener("pointerenter", enter);
        a.removeEventListener("pointerleave", leave);
        a.removeEventListener("pointerdown", down);
        a.removeEventListener("pointerup", up);
        a.removeEventListener("pointercancel", leave);
        a.removeEventListener("focus", focus);
        a.removeEventListener("blur", leave);
      });
    });
    return () => {
      offs.forEach((o) => o());
      swaps.forEach((t) => t.kill());
    };
  }, []);

  return (
    <div ref={root} className="stack">
      <ol className="st-rows">
        {abilities.map((a, r) => (
          <li key={a.id} className="st-row" data-row={r} data-line={a.line}>
            <i className="st-rule" aria-hidden />
            <div className="st-head">
              <h3 className="st-title" aria-label={a.title}>
                {a.title.split(" ").map((w, wi, all) => (
                  <span key={wi} className="word" aria-hidden>
                    {Array.from(w).map((c, ci) => (
                      <span key={ci} className="char-mask">
                        <span className="char" data-c={c}>
                          {c}
                        </span>
                      </span>
                    ))}
                    {wi < all.length - 1 ? " " : null}
                  </span>
                ))}
              </h3>
              <p className="st-line">
                <span className="st-line-in">{a.line}</span>
              </p>
              <p className="ab-proof">
                <span>Seen in</span>
                {a.proof.map((p) =>
                  p.project ? (
                    <a key={p.label} href={`#project-${p.project}`} data-goto={p.project}>
                      {p.label}
                    </a>
                  ) : (
                    <em key={p.label}>{p.label}</em>
                  ),
                )}
              </p>
            </div>
            <ul className="st-caps" aria-label={`${a.title}: the tools`}>
              {a.tools.map((t) => (
                <li key={t.name} className="cap">
                  <a className="glass-cap" href={t.url} target="_blank" rel="noreferrer" data-what={t.what} aria-label={`${t.name}: ${t.what}`}>
                    <Body tool={t} />
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
        <li className="st-end" aria-hidden>
          <i className="st-rule" />
        </li>
      </ol>
    </div>
  );
}
