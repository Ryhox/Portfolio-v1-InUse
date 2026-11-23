"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const MascotStage = dynamic(() => import("./MascotStage"), { ssr: false });

// The mascot: a little cloud rider who hangs around the page (see brain.ts). Comes in a moment after the
// intro, once the page has settled.
export default function Mascot({ ready }: { ready: boolean }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => setOn(true), 2400);
    return () => window.clearTimeout(t);
  }, [ready]);
  return on ? <MascotStage /> : null;
}
