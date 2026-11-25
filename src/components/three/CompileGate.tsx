"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { compileInBackground, drawOnce } from "./compile";

// A canvas's first frame compiles every shader in it, all at once, on the main thread: on Windows (ANGLE on
// D3D11) that's a page freeze of a second or two, right when the thing appears. So a canvas starts with
// frameloop "never" and this compiles its scene in the background first (compile.ts), then says so; the
// canvas then starts drawing. Mount it after whatever it has to wait for (inside the same Suspense, after the
// model), so the scene is complete when it compiles.
//
// `warm`: also draw it once (compile.ts), so that freeze happens now: mount the canvas while the loader is
// still up (out of sight) and it happens behind it.
export default function CompileGate({ onDone, warm = false }: { onDone: () => void; warm?: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let alive = true;
    compileInBackground(gl, scene, camera).then(() => {
      if (!alive) return;
      if (warm) drawOnce(gl, scene, camera);
      onDone();
      // (a canvas that draws on demand: its first frame)
      requestAnimationFrame(() => alive && invalidate());
    });
    return () => {
      alive = false;
    };
  }, [gl, scene, camera, invalidate, onDone, warm]);
  return null;
}
