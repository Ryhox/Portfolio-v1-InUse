"use client";

import { Suspense, useEffect, type RefObject } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import Backdrop from "./Backdrop";
import TickerDrive from "./TickerDrive";
import { intro } from "@/lib/intro";
import { compileInBackground } from "./compile";

// Touch devices get a lighter render budget (they're usually phones with dense screens and small GPUs).
const COARSE = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
// (Without a graphics card the sky is two still pictures instead: BakedSky.tsx, mounted by Experience.tsx.)

// The sky draws nothing until its shader is compiled: a frame drawn while it's still compiling makes the
// browser finish the compile on the spot (a freeze of a second or more while the page loads).
let compiled = false;

function Ready({ onReady }: { onReady: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    let alive = true;
    const t0 = performance.now();
    // Compile in the background (compile.ts), then reveal once the first real frame is on screen. (The page
    // shows either way after a few seconds.)
    compileInBackground(gl, scene, camera, 4000).then(() => {
      if (process.env.NODE_ENV !== "production") console.info("[scene] shaders ready in", Math.round(performance.now() - t0), "ms");
      compiled = true;
      requestAnimationFrame(() => requestAnimationFrame(() => alive && onReady()));
    });
    return () => {
      alive = false;
    };
  }, [gl, scene, camera, onReady]);
  return null;
}

// Forwards the global three.js loading progress (models on both canvases) to the loader.
function Progress({ onProgress }: { onProgress: (p: number) => void }) {
  const progress = useProgress((s) => s.progress);
  useEffect(() => onProgress(progress), [progress, onProgress]);
  return null;
}

export default function Scene({
  eventSource,
  onReady,
  onProgress,
}: {
  eventSource: RefObject<HTMLElement | null>;
  onReady: () => void;
  onProgress: (p: number) => void;
}) {
  return (
    <Canvas
      className="scene-canvas"
      eventSource={eventSource as RefObject<HTMLElement>}
      eventPrefix="client"
      frameloop="never"
      // Its size is the layout size, not what's on screen: the intro scales the sky in (1.12 to 1), and
      // measuring it on screen made a scroll during the intro resize the canvas (a half-second GPU stall).
      resize={{ offsetSize: true }}
      flat
      // Soft clouds don't need every device pixel.
      // (Phones a little more than one per CSS pixel: their screens are small and at 0.75 the cloud edges smeared.)
      dpr={COARSE ? [1, 1.25] : 1}
      gl={{ antialias: false, powerPreference: "high-performance" }}
    >
      {/* While the loader is up, only tick a few times a second (compile), then full rate. */}
      <TickerDrive ready={() => compiled} active={() => Number.isFinite(intro.at)} />
      <Progress onProgress={onProgress} />
      <Backdrop />
      <Suspense fallback={null}>
        <Ready onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}
