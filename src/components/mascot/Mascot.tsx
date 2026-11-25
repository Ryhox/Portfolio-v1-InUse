"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { softwareGL } from "@/lib/gpu";

const load = () => import("./MascotStage");
const MascotStage = dynamic(load, { ssr: false });

// The mascot: a little cloud rider who hangs around the page (see brain.ts). She's downloaded and put together
// (shaders compiled, drawn once) while the loader is still up, out of sight: that's a moment of hard work for
// the browser that used to freeze the page right when she first appeared, mid-read. Then, just after the
// intro, she comes to life and drifts in.
export default function Mascot({ ready }: { ready: boolean }) {
  const [built, setBuilt] = useState(false);
  const [on, setOn] = useState(false);
  // (Without a graphics card she isn't there at all: drawn in software she cost the page too much, gpu.ts.)
  useEffect(() => {
    if (softwareGL()) return;
    let alive = true;
    const t = window.setTimeout(() => {
      load()
        .then(() => alive && setBuilt(true))
        .catch(() => undefined);
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, []);
  useEffect(() => {
    if (!ready || softwareGL()) return;
    const t = window.setTimeout(() => setOn(true), 700);
    return () => window.clearTimeout(t);
  }, [ready]);
  return built || on ? <MascotStage active={on} /> : null;
}
