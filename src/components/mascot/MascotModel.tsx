"use client";
/* eslint-disable react-hooks/immutability -- the brain is driven imperatively, frame by frame. */

import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import type { Brain } from "./brain";
import type { World } from "./world";
import { MascotRig, MODEL } from "./rig";

// Her body drawn on the page (where the browser can't draw her in a worker, MascotStage.tsx): the same rig,
// driven here every frame by her brain.

export default function MascotModel({ brain, world, onFrame }: { brain: Brain; world: World; onFrame: (brain: Brain) => void }) {
  const gltf = useGLTF(MODEL);
  const size = useThree((s) => s.size);
  const rig = useMemo(() => new MascotRig(gltf, document.createElement("canvas")), [gltf]);

  useEffect(() => {
    brain.durations = rig.durations;
    // (brain.start(): once she comes to life, MascotStage)
    return () => rig.dispose();
  }, [brain, rig]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    world.update(dt);
    brain.update(dt);
    brain.geo = rig.frame(dt, { out: brain.out, S: brain.S, W: size.width, H: size.height, night: world.night });
    onFrame(brain);
  });

  return <primitive object={rig.root} />;
}

useGLTF.preload(MODEL);
