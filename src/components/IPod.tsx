"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { lenis } from "./SmoothScroll";
import { softwareGL } from "@/lib/gpu";
import * as ipod from "./ipod/os";
import * as player from "./ipod/player";

const loadCanvas = () => import("./ipod/IPodCanvas");
const IPodCanvas = dynamic(loadCanvas, { ssr: false });

// Canvas size when picked up (in the corner it's the same canvas, scaled down and mostly below the edge).
const W = 440;
const H = 725;

// An iPod Classic that really works (see ipod/). On desktop it peeks up from the bottom-right corner (just
// its screen), click it and it comes out; on phones a button brings it up. Wheel, buttons and arrow keys
// drive it.
export default function IPod({ ready }: { ready: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const fab = useRef<HTMLButtonElement>(null);
  const [phone, setPhone] = useState(false);
  // Shown once the intro is over (and, on desktop, once the model is in).
  const [on, setOn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const [live, setLive] = useState("");
  const [playing, setPlaying] = useState(false);
  // The song playing, on Apple Music (previews have to link to the full song).
  const [link, setLink] = useState("");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 899px)");
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // On desktop it's built (downloaded, put together, its shaders compiled) while the loader is still up, out
  // of sight: that's a moment of work for the browser that would otherwise land in the middle of the intro.
  // Then it's just there right after it. (Phones only build it when asked.)
  const [build, setBuild] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(max-width: 899px)").matches || softwareGL()) return;
    let alive = true;
    const t = window.setTimeout(() => {
      loadCanvas()
        .then(() => alive && setBuild(true))
        .catch(() => undefined);
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, []);
  useEffect(() => {
    // (without a graphics card it isn't there at all: drawn in software it cost the page too much, gpu.ts)
    if (!ready || softwareGL()) return;
    const t = window.setTimeout(() => setOn(true), 500);
    return () => window.clearTimeout(t);
  }, [ready]);

  // How big it can be when picked up (fits short and narrow screens).
  useEffect(() => {
    const fit = () => {
      const s = Math.min(1, (window.innerHeight - (phone ? 96 : 24)) / H, (window.innerWidth - 24) / W);
      document.documentElement.style.setProperty("--ipod-open", s.toFixed(3));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [phone]);

  const expand = useCallback(() => {
    setOpen(true);
    setOpened(true);
  }, []);
  const onLoaded = useCallback(() => setLoaded(true), []);

  // Phones only build the 3D iPod once it's first asked for.
  const mounted = phone ? on && opened : on || build;
  useEffect(() => {
    if (mounted && on) ipod.power();
  }, [mounted, on]);

  // What screen readers hear; what's playing.
  useEffect(() => {
    const sync = () => {
      setLive(ipod.describe());
      setPlaying(player.player.playing);
      setLink(player.current()?.link ?? "");
    };
    ipod.os.listeners.add(sync);
    return () => {
      ipod.os.listeners.delete(sync);
    };
  }, []);

  // Picked up: keys drive it, a click elsewhere (or Escape from the main menu) puts it back.
  useEffect(() => {
    if (!open) return;
    box.current?.focus({ preventScroll: true });
    if (phone) lenis?.stop();
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]")) return;
      const r = ipod.key(e.key);
      if (r === false) return;
      e.preventDefault();
      if (r === "root" && e.key === "Escape") setOpen(false);
    };
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || fab.current?.contains(t)) return;
      setOpen(false);
    };
    const keyUp = (e: KeyboardEvent) => ipod.keyUp(e.key);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", keyUp);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", keyUp);
      document.removeEventListener("pointerdown", outside);
      if (phone) lenis?.start();
      ipod.suspend();
    };
  }, [open, phone]);

  // Put away: focus goes back to where it came from.
  const close = () => {
    setOpen(false);
    if (phone) fab.current?.focus({ preventScroll: true });
  };

  const shown = on && (loaded || phone);
  const cls = (base: string, ...mods: [string, boolean][]) => [base, ...mods.filter(([, v]) => v).map(([m]) => m)].join(" ");

  return (
    <>
      {phone ? (
        <button
          ref={fab}
          type="button"
          className={cls("ipod-fab", ["is-on", on], ["is-playing", playing], ["is-hidden", open])}
          onClick={expand}
          aria-label="Open the music player"
          aria-expanded={open}
        >
          <svg viewBox="0 0 24 36" aria-hidden>
            <rect x="1" y="1" width="22" height="34" rx="5" fill="#f7f8fa" stroke="#9aa3b0" strokeWidth="1.2" />
            <rect x="4" y="4" width="16" height="12" rx="1.6" fill="#3f8cf2" />
            <rect x="4" y="4" width="16" height="5" rx="1.6" fill="#8cc6ff" />
            <circle cx="12" cy="25.5" r="6.6" fill="#d3d7dd" />
            <circle cx="12" cy="25.5" r="2.4" fill="#f7f8fa" />
          </svg>
          <span className="ipod-fab-eq" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </button>
      ) : null}
      {phone && open ? <div className="ipod-scrim" onClick={close} aria-hidden /> : null}
      <div
        ref={box}
        className={cls("ipod", ["is-on", shown], ["is-open", open])}
        data-ipod
        data-lenis-prevent={open ? "" : undefined}
        tabIndex={on ? 0 : -1}
        role={open ? "application" : "button"}
        aria-roledescription="music player"
        aria-label={open ? "Music player" : "Pick up the music player"}
        aria-describedby="ipod-help"
        aria-hidden={!on || (phone && !open)}
        onKeyDown={
          open
            ? undefined
            : (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  expand();
                }
              }
        }
      >
        {mounted ? <IPodCanvas open={open} onExpand={expand} onLoaded={onLoaded} /> : null}
        {open ? (
          <button type="button" className="ipod-close" onClick={close} aria-label="Put the music player away">
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
        {open && link ? (
          <a className="ipod-link" href={link} target="_blank" rel="noreferrer">
            Listen on Apple Music <span aria-hidden>↗</span>
          </a>
        ) : null}
        <p id="ipod-help" className="sr-only">
          Up and down arrows turn the click wheel, left and right skip, Enter selects, Escape is the menu button, Space plays or pauses, H is the
          hold switch.
        </p>
        <p className="sr-only" aria-live="polite">
          {open ? live : ""}
        </p>
      </div>
      {!phone && shown && !open ? (
        <p className="ipod-tip" aria-hidden>
          psst, I work
        </p>
      ) : null}
    </>
  );
}
