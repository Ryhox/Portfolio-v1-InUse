"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { gsap } from "gsap";
import SmoothScroll, { lenis } from "./SmoothScroll";
import Motion from "./Motion";
import ActionFx from "./ActionFx";
import IPod from "./IPod";
import CloudPass from "./CloudPass";
import MiniPlayer from "./MiniPlayer";
import TabTitle from "./TabTitle";
import Mascot from "./mascot/Mascot";
import { intro } from "@/lib/intro";

const Scene = dynamic(() => import("./three/Scene"), { ssr: false });

// The loader stays up at least this long, so the count reads as a count and not a flash.
const MIN_LOAD = 1200;

export default function Experience({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const loader = useRef<HTMLDivElement>(null);
  const count = useRef<HTMLSpanElement>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  // Scroll choreography is built while the loader is still up (not at the reveal, which must stay smooth).
  const [motionSetup, setMotionSetup] = useState(false);
  const onMotionReady = useCallback(() => setMotionSetup(true), []);
  const onSceneReady = useCallback(() => setSceneReady(true), []);

  // Displayed value eases toward the real loading progress.
  const progress = useRef({ v: 0, target: 4, finishing: false, born: 0 });
  const render = useCallback(() => {
    const text = String(Math.round(progress.current.v));
    if (count.current && count.current.textContent !== text) {
      count.current.textContent = text;
      // (The chrome fill is a copy of the letters drawn on top, see .char::after in globals.css.)
      count.current.dataset.c = text;
    }
  }, []);

  const onProgress = useCallback((p: number) => {
    // Assets are most of the wait; shader compilation finishes the last stretch.
    progress.current.target = Math.max(progress.current.target, 8 + p * 0.8);
  }, []);

  useEffect(() => {
    lenis?.stop();
    const p = progress.current;
    p.born = performance.now();
    document.fonts?.ready.then(() => {
      p.target = Math.max(p.target, 14);
    });
    // Only while loading: once the count is finishing, the timeline below drives it and this stops for good.
    const tick = () => {
      if (p.finishing) {
        gsap.ticker.remove(tick);
        return;
      }
      // Never looks stuck: a slow floor that creeps toward 90% while real progress catches up.
      const floor = 90 * (1 - Math.exp(-(performance.now() - p.born) / 1400));
      const target = Math.max(p.target, floor);
      const next = p.v + (target - p.v) * 0.09;
      if (Math.abs(next - p.v) > 0.02) {
        p.v = next;
        render();
      }
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [render]);

  // Everything compiled: count to 100, the number rises out of sight (the way the name comes in), the sky
  // underneath takes over and the name rises into place.
  useEffect(() => {
    if (!motionSetup) return;
    const p = progress.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wait = Math.max(0, MIN_LOAD - (performance.now() - p.born)) / 1000;

    const reveal = () => {
      intro.at = performance.now() / 1000;
      setRevealed(true);
      lenis?.start();
      if (reduced) return;
      gsap.fromTo(".scene", { scale: 1.12 }, { scale: 1, duration: 1.8, ease: "expo.out", clearProps: "transform" });
      gsap.from(".nav > *", { yPercent: -160, autoAlpha: 0, duration: 1, stagger: 0.08, ease: "expo.out", delay: 0.45 });
      gsap.fromTo(".hero-title .char", { yPercent: 150, rotate: 10 }, { yPercent: 0, rotate: 0, duration: 1.3, stagger: 0.07, ease: "expo.out", delay: 0.2 });
    };

    const tl = gsap.timeline({ delay: wait });
    tl.to(p, {
      v: 100,
      duration: 0.45,
      ease: "power2.out",
      onStart: () => {
        p.finishing = true;
      },
      onUpdate: render,
    })
      .to(".loader-num .char", { yPercent: -125, rotate: -8, duration: reduced ? 0.01 : 0.6, ease: "power3.in" }, "+=0.15")
      .to(".loader-sub", { y: -10, autoAlpha: 0, duration: reduced ? 0.01 : 0.35, ease: "power2.in" }, "<")
      .add(reveal, "-=0.1")
      .to(loader.current, {
        autoAlpha: 0,
        duration: reduced ? 0.01 : 0.7,
        ease: "power2.inOut",
        onComplete: () => {
          if (loader.current) loader.current.style.display = "none";
        },
      }, "<");
    return () => {
      tl.kill();
    };
  }, [motionSetup, render]);

  return (
    <>
      <div ref={root} className={revealed ? "app is-ready" : "app"}>
        <SmoothScroll />
        <Motion ready={sceneReady} onReady={onMotionReady} />
        <ActionFx ready={motionSetup} />
        <div className="scene" aria-hidden>
          <Scene eventSource={root} onReady={onSceneReady} onProgress={onProgress} />
        </div>
        {/* The flight through the clouds between About and the work (over the page, under the nav). */}
        <CloudPass />
        <TabTitle />
        <div className="progress" aria-hidden>
          <div className="progress-fill" />
        </div>
        {/* While everything loads: the sky, and the count in the same chrome letters as the name. At 100 it
            rises out of sight and the name rises in. */}
        <div ref={loader} className="loader" aria-hidden>
          <div className="loader-num">
            <span className="char-mask">
              <span ref={count} className="char" data-c="0">
                0
              </span>
            </span>
          </div>
          <p className="loader-sub">loading the sky</p>
        </div>
        {children}
      </div>
      {/* Outside the app root: presses on the iPod never reach the 3D scenes behind it. */}
      <IPod ready={revealed} />
      <MiniPlayer />
      {/* The cloud rider who hangs around the page (mascot/brain.ts). */}
      <Mascot ready={revealed} />
    </>
  );
}
