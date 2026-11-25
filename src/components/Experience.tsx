"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { gsap } from "gsap";
import SmoothScroll from "./SmoothScroll";
import Motion from "./Motion";
import ActionFx from "./ActionFx";
import IPod from "./IPod";
import CloudPass from "./CloudPass";
import MiniPlayer from "./MiniPlayer";
import TabTitle from "./TabTitle";
import Safe from "./Safe";
import Mascot from "./mascot/Mascot";
import { intro } from "@/lib/intro";
import { gpuReady } from "@/lib/gpu";
import { profile } from "@/content";
import LoaderClouds, { loaderClouds } from "./LoaderClouds";

const Scene = dynamic(() => import("./three/Scene"), { ssr: false });
// (without a graphics card: the sky as two still pictures, drawn in a worker, no three.js on the page)
const BakedSky = dynamic(() => import("./three/BakedSky"), { ssr: false });

// The loader: the name in chrome hidden behind the sky's clouds (LoaderClouds.tsx), the percentage and a bar at the
// bottom. From the very first paint the clouds are there (their first frame as a still picture, drawn by the
// script in page.tsx, until the live ones take over from exactly that frame). As the page loads they part around
// the name, the near ones first, and it comes out from behind them. At 100%, all at once: you push forward
// through what's left (the clouds rush past and clear into the open sky, the page's own), the name settles onto
// the real title, the nav drops in. Without a graphics card the still clouds part instead (globals.css).

export default function Experience({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const loader = useRef<HTMLDivElement>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  // Scroll choreography is built while the loader is still up (not at the reveal, which must stay smooth).
  const [motionSetup, setMotionSetup] = useState(false);
  const onMotionReady = useCallback(() => setMotionSetup(true), []);
  const onSceneReady = useCallback(() => setSceneReady(true), []);

  // How far loading is (0..1): only ever forward. What's shown follows it smoothly (fast when loading jumps
  // ahead, slow when it crawls): the bar, the percentage and how far the clouds have parted.
  const forge = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const pct = useRef<HTMLSpanElement>(null);
  const progress = useRef(0);
  const advance = useCallback((p: number) => {
    if (p > progress.current) progress.current = Math.min(1, p);
  }, []);
  // At 100%: the burst can start.
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    let shown = 0;
    let last = performance.now();
    let text = "";
    let opened = -1;
    let gone = false;
    let raf = requestAnimationFrame(function tick(now) {
      const dt = Math.min(0.1, (now - last) / 1000) || 1 / 60;
      last = now;
      const target = progress.current;
      // (eases towards where loading is, and never slower than a crawl, so the end always comes)
      if (shown < target) shown = Math.min(target, shown + Math.max((target - shown) * (1 - Math.exp(-dt / 0.28)), dt * 0.12));
      if (target - shown < 0.002) shown = target;
      if (bar.current) bar.current.style.transform = `scaleX(${shown.toFixed(3)})`;
      const t = `${Math.round(shown * 100)}%`;
      if (t !== text && pct.current) pct.current.textContent = text = t;
      // (parting slowly at first: the name comes out bit by bit; at 100% it's all there, framed by clouds still,
      // for the push through them to blow away)
      loaderClouds.open = 0.72 * shown ** 1.25;
      // The still clouds: gone once the live ones are drawn over them; without a graphics card they part
      // themselves (a few steps a second at most: they're redrawn each time).
      const v = veil.current;
      if (v && loaderClouds.ready && !gone) {
        gone = true;
        v.style.opacity = "0";
      } else if (v && !loaderClouds.ready && "lite" in document.documentElement.dataset) {
        const o = Math.round(loaderClouds.open * 50) / 50;
        if (o !== opened) v.style.setProperty("--open", String((opened = o)));
      }
      if (shown >= 1) {
        setLanded(true);
        return;
      }
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  // (the sky's models and shaders: the quarter after the graphics check)
  const onSkyProgress = useCallback((p: number) => advance(0.24 + 0.24 * (p / 100)), [advance]);
  const onSetupStep = useCallback((done: number, total: number) => advance(0.5 + 0.42 * (done / total)), [advance]);

  // The 3D layers mount once it's known whether WebGL is drawn in software (asked off the main thread,
  // gpu.ts). Without a graphics card some things are drawn lighter (globals.css: the tech stack's glass).
  const [gpu, setGpu] = useState<"" | "soft" | "hard">("");
  useEffect(() => {
    let alive = true;
    gpuReady().then((g) => {
      if (!alive) return;
      advance(0.24);
      if (g.soft) document.documentElement.dataset.lite = "";
      setGpu(g.soft ? "soft" : "hard");
    });
    return () => {
      alive = false;
    };
  }, [advance]);

  // The first steps, and a slow floor so the forging never looks stuck while something takes its time.
  useEffect(() => {
    advance(0.06);
    document.fonts?.ready.then(() => advance(0.14));
    const born = performance.now();
    const t = window.setInterval(() => advance(0.84 * (1 - Math.exp(-(performance.now() - born) / 3200))), 250);
    return () => window.clearInterval(t);
  }, [advance]);
  useEffect(() => {
    if (sceneReady) advance(0.5);
  }, [sceneReady, advance]);

  // The loader never gets stuck: if the sky hasn't reported ready after a while (a GPU that never finishes,
  // a canvas that couldn't start), the page comes in anyway; same if the scroll setup never reports back.
  useEffect(() => {
    const t = window.setTimeout(() => setSceneReady(true), Math.max(0, 9000 - performance.now()));
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!sceneReady) return;
    const t = window.setTimeout(() => setMotionSetup(true), 2500);
    return () => window.clearTimeout(t);
  }, [sceneReady]);


  // Everything set up: loading reaches 100% and the last letter drops into place.
  useEffect(() => {
    if (motionSetup) advance(1);
  }, [motionSetup, advance]);

  // At 100%, all at once: you push forward through the clouds (they rush past you, the nearest fastest, and
  // clear), the loader's sky gives way to the page's own, the name settles onto the real title, the bar goes and
  // the nav drops in.
  useEffect(() => {
    if (!landed) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lite = "lite" in document.documentElement.dataset;

    const reveal = () => {
      intro.at = performance.now() / 1000;
      setRevealed(true);
      if (reduced) return;
      // (The sky settling in: not without a graphics card, where scaling the whole screen every frame is the
      // heaviest thing the intro would do, gpu.ts.)
      if (!lite) gsap.fromTo(".scene", { scale: 1.12 }, { scale: 1, duration: 1.8, ease: "expo.out", clearProps: "transform" });
      gsap.from(".nav > *", { yPercent: -160, autoAlpha: 0, duration: 1, stagger: 0.08, ease: "expo.out", delay: 0.1 });
    };

    const sky = loader.current?.querySelector<HTMLElement>(".loader-sky") ?? null;
    const tl = gsap.timeline();
    if (!reduced) {
      // "Done": the 100% and its full bar give a little punch, and right at its top you shoot forward through the
      // clouds: faster and faster, the near ones streaking past, out into the open sky.
      tl.to(".loader-progress", { scale: 1.15, duration: 0.18, ease: "power3.out" }, 0).to(loaderClouds, { burst: 1, duration: 1.05, ease: "none" }, 0.16);
    }
    // (the page's own things, the nav, the iPod, the cloud rider, only as you come out of the clouds: started with
    // the push, all that setting up made it stutter)
    tl.add(reveal, reduced ? 0 : 0.85)
      .to(".loader-progress", { autoAlpha: 0, y: 12, scale: 0.9, duration: reduced ? 0.01 : 0.35, ease: "power2.in" }, reduced ? 0 : 0.2)
      // (the loader's sky gives way to the page's own, as the clouds clear)
      .to(sky, { autoAlpha: 0, duration: reduced ? 0.01 : 0.7, ease: "power2.inOut" }, reduced ? 0 : 0.45)
      .to(veil.current, { autoAlpha: 0, scale: 1.25, duration: reduced ? 0.01 : 0.8, ease: "power2.in" }, 0)
      .add(() => void (loaderClouds.burst = 1), reduced ? 0 : 1.21)
      .add(() => {
        if (loader.current) loader.current.style.display = "none";
        // Only now can the page be scrolled: a scroll while the loader was still going moved the real title away
        // from the loader's copy of it, and there were two names on the screen.
        document.documentElement.classList.remove("is-loading");
      });
    return () => {
      tl.kill();
    };
  }, [landed]);

  return (
    <>
      <div ref={root} className={revealed ? "app is-ready" : "app"}>
        <SmoothScroll />
        <Motion ready={sceneReady} onReady={onMotionReady} onStep={onSetupStep} />
        <ActionFx ready={motionSetup} />
        <div className="scene" aria-hidden>
          <Safe
            onError={() => {
              // (no sky, so nothing to draw the capsules' glass: their CSS glass instead, globals.css)
              document.documentElement.dataset.lite = "";
              onSceneReady();
            }}
          >
            {gpu === "hard" ? <Scene eventSource={root} onReady={onSceneReady} onProgress={onSkyProgress} /> : gpu === "soft" ? <BakedSky onReady={onSceneReady} /> : null}
          </Safe>
        </div>
        {/* The flight through the clouds between About and the work (over the page, under the nav). */}
        {gpu ? <CloudPass /> : null}
        <TabTitle />
        <div className="progress" aria-hidden>
          <div className="progress-fill" />
        </div>
        {/* While everything loads: the sky, the name over the real title (laid out exactly like it, .forge in
            globals.css), the clouds in front of it and the progress at the bottom. */}
        <div ref={loader} className="loader" aria-hidden>
          <div className="loader-sky" />
          <div ref={forge} className="forge">
            <div className="hero-title forge-title">
              <span className="hero-word">
                {Array.from(profile.handle).map((c, i) => (
                  <span key={i} className="forge-letter" style={{ "--i": i } as CSSProperties}>
                    <span className="char-mask">
                      <span className="char" data-c={c}>
                        {c}
                      </span>
                    </span>
                  </span>
                ))}
              </span>
            </div>
          </div>
          {/* (the clouds' first frame: drawn by the script in page.tsx; their average colour under it until then) */}
          <div ref={veil} className="loader-veil">
            {/* (sized and drawn by that script before the page's scripts start: its size is expected to differ) */}
            <canvas className="loader-still" suppressHydrationWarning />
          </div>
          {gpu === "hard" ? <LoaderClouds /> : null}
          <div className="loader-progress">
            <span ref={pct} className="loader-pct">
              0%
            </span>
            <span className="loader-bar">
              <span ref={bar} className="loader-bar-fill" />
            </span>
          </div>
        </div>
        {children}
      </div>
      {/* Outside the app root: presses on the iPod never reach the 3D scenes behind it. */}
      <Safe>{gpu ? <IPod ready={revealed} /> : null}</Safe>
      <MiniPlayer />
      {/* The cloud rider who hangs around the page (mascot/brain.ts). */}
      <Safe>{gpu ? <Mascot ready={revealed} /> : null}</Safe>
    </>
  );
}
