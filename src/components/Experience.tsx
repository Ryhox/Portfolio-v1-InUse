"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { gsap } from "gsap";
import SmoothScroll, { lenis } from "./SmoothScroll";
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

const Scene = dynamic(() => import("./three/Scene"), { ssr: false });
// (without a graphics card: the sky as two still pictures, drawn in a worker, no three.js on the page)
const BakedSky = dynamic(() => import("./three/BakedSky"), { ssr: false });

// The loader: the sky, the name in its chrome right where the real title sits, and at the bottom a progress bar
// with the percentage over it. Done: a shine runs across the name and the sky opens up around it (the real title
// is right underneath, letter for letter).

export default function Experience({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const loader = useRef<HTMLDivElement>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  // Scroll choreography is built while the loader is still up (not at the reveal, which must stay smooth).
  const [motionSetup, setMotionSetup] = useState(false);
  const onMotionReady = useCallback(() => setMotionSetup(true), []);
  const onSceneReady = useCallback(() => setSceneReady(true), []);

  // How far loading is (0..1): only ever forward. The bar follows it (a CSS transition); the percentage is
  // rewritten only when it moves on, a few times a second at most, never every frame.
  const forge = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const pct = useRef<HTMLSpanElement>(null);
  const progress = useRef(0);
  const advance = useCallback((p: number) => {
    if (p <= progress.current) return;
    progress.current = Math.min(1, p);
    if (bar.current) bar.current.style.transform = `scaleX(${progress.current.toFixed(3)})`;
    const text = `${Math.round(progress.current * 100)}%`;
    if (pct.current && pct.current.textContent !== text) pct.current.textContent = text;
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

  // No scrolling while the loader is up.
  useEffect(() => {
    lenis?.stop();
  }, []);

  // Everything set up: the bar fills, a shine runs across the name, then the sky opens up from the name
  // outwards (the real sky behind it), the bar goes and the nav drops in. The name stays: the real title is
  // right underneath it, letter for letter.
  useEffect(() => {
    if (!motionSetup) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lite = "lite" in document.documentElement.dataset;
    advance(1);

    const reveal = () => {
      intro.at = performance.now() / 1000;
      setRevealed(true);
      lenis?.start();
      if (reduced) return;
      // (The sky settling in: not without a graphics card, where scaling the whole screen every frame is the
      // heaviest thing the intro would do, gpu.ts.)
      if (!lite) gsap.fromTo(".scene", { scale: 1.12 }, { scale: 1, duration: 1.8, ease: "expo.out", clearProps: "transform" });
      gsap.from(".nav > *", { yPercent: -160, autoAlpha: 0, duration: 1, stagger: 0.08, ease: "expo.out", delay: 0.35 });
    };

    const sky = loader.current?.querySelector(".loader-sky") ?? null;
    // (a moment for the bar to finish filling first)
    const tl = gsap.timeline({ delay: reduced ? 0 : 0.5 });
    if (!reduced) tl.add(() => forge.current?.classList.add("is-shine")).to({}, { duration: 0.7 });
    tl.add(reveal)
      .to(".loader-progress", { autoAlpha: 0, y: 10, duration: reduced ? 0.01 : 0.4, ease: "power2.in" }, "<")
      // (the opening: a soft-edged hole growing from the name; without a graphics card a fade, the cheaper one)
      .to(sky, lite || reduced ? { autoAlpha: 0, duration: reduced ? 0.01 : 0.9, ease: "power2.inOut" } : { "--hole": "130%", duration: 1.5, ease: "power2.inOut", onStart: () => loader.current?.classList.add("is-opening") }, "<")
      .add(() => {
        if (loader.current) loader.current.style.display = "none";
      });
    return () => {
      tl.kill();
    };
  }, [motionSetup, advance]);

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
        {/* While everything loads: the sky, the name right over the real title (laid out exactly like it, .forge
            in globals.css) and the progress at the bottom. */}
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
