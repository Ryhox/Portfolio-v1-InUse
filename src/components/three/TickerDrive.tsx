"use client";

import { useEffect } from "react";
import { advance, useThree } from "@react-three/fiber";
import { gsap } from "gsap";

// Renders this canvas from the GSAP ticker, right after Lenis has scrolled and ScrollTrigger has
// updated the DOM, so what the sky draws under the page (the tech stack's glass) never lags a frame behind it.
// Until `active()` is true the canvas only ticks a few times per second, leaving the loader smooth.
// `ready`: nothing at all until it says so (its shaders compiled); then a first frame straight away.
export default function TickerDrive({ ready, active }: { ready?: () => boolean; active?: () => boolean }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    let frame = 0;
    let first = true;
    const tick = (time: number) => {
      if (ready && !ready()) return;
      if (first) {
        first = false;
        advance(time, true, get());
        return;
      }
      frame++;
      if (active && !active() && frame % 12 !== 0) return;
      // R3F expects seconds here (it derives the frame delta from it).
      advance(time, true, get());
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [get, ready, active]);
  return null;
}
