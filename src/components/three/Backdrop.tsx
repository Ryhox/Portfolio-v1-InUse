"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { floorLift, scroll, sky } from "@/lib/scroll";
import { currentTheme, theme } from "@/lib/theme";
import { fragment, MAX_GLASS, vertex } from "./sky";
import { PALETTES as RGB } from "./palettes";

// The sky behind the whole page: a clear blue day sky with two layers of drifting cumulus, lit by a soft
// sun (bright white tops, blue-grey bellies, see-through edges). The air right above the horizon stays
// clear and blue; the clouds build up higher, and rise past as you scroll (the near layer faster). At the
// very bottom the page comes to rest on a big rolling green hill, the classic desktop-wallpaper kind: a far
// ridge in the haze, then the hill itself, sunlit along its crest, wind rolling through the grass and cloud
// shadows sliding over it. In dark mode it's night: the blue deepens to ink, the clouds and the hill go dark
// and moonlit.
//
// Behind the tech stack the clouds even out to the same amount as the top of the sky, set by the scroll
// alone (no thick bank, no speed-up), so that part always looks the same.
//
// It also draws the tech stack's Liquid Glass (Stack.tsx): right under each capsule it shows the same sky,
// frosted, pulled in at the rim like a drop of glass, with a sheen where the light hits. Same pass, no copies.


// top / middle / low per section (palettes.ts), as vectors for the shader.
const PALETTES: Record<string, THREE.Vector3[]> = Object.fromEntries(
  Object.entries(RGB).map(([name, p]) => [name, p.map((c) => new THREE.Vector3(...c))]),
);

// Single fullscreen backdrop, so its uniforms can live at module scope and be animated per frame.
const uniforms = {
  uTime: { value: 0 },
  uScroll: { value: 0 },
  uNight: { value: currentTheme() === "dark" ? 1 : 0 },
  uFloor: { value: 1e5 },
  uDense: { value: 0 },
  uRes: { value: new THREE.Vector2(1, 1) },
  uGlass: { value: Array.from({ length: MAX_GLASS }, () => new THREE.Vector4()) },
  uGlassA: { value: new Array<number>(MAX_GLASS).fill(1) },
  uGlassN: { value: 0 },
  uLoop: { value: 0 },
  uGlassBox: { value: new THREE.Vector4() },
  uTop: { value: PALETTES.hero[0].clone() },
  uMid: { value: PALETTES.hero[1].clone() },
  uLow: { value: PALETTES.hero[2].clone() },
};

// Where each capsule sits in the page (document px, before any transform), measured once per layout change.
// Each frame then adds the scroll and GSAP's own transforms (read from its cache, not the page), so finding
// the glass never makes the browser lay the page out again in the middle of a frame.
type CapBox = { el: HTMLElement; cap: HTMLElement; gx: number; gy: number; w: number; h: number; lx: number; ly: number };
let caps: CapBox[] = [];
const inPage = (el: HTMLElement) => {
  let x = el.offsetWidth / 2;
  let y = el.offsetHeight / 2;
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return [x, y];
};
function measureCaps() {
  caps = sky.glass.flatMap((el) => {
    const cap = el.parentElement;
    if (!cap) return [];
    const [gx, gy] = inPage(el);
    const [lx, ly] = inPage(cap);
    return [{ el, cap, gx, gy, w: el.offsetWidth, h: el.offsetHeight, lx, ly }];
  });
}
const num = (el: HTMLElement, p: string) => Number(gsap.getProperty(el, p)) || 0;
// A capsule's drop-in (Motion.tsx): how far it has faded in, risen and grown, from GSAP's own values.
const dropIn = (cap: HTMLElement) => {
  if (cap.style.visibility === "hidden") return { a: 0, y: 0, s: 1 };
  const o = cap.style.opacity;
  return { a: o ? Math.min(1, Math.max(0, parseFloat(o))) : 1, y: num(cap, "y"), s: num(cap, "scaleX") || 1 };
};

/** One frame of the sky: palette for the section on screen, time, scroll, day / night, the floor, the
 *  clouds behind the tech stack and where its capsules are (for their glass). */
function tickSky(dt: number, elapsed: number, width: number, height: number) {
  // Blend toward the palette of whichever section fills the screen.
  const probe = scroll.y + scroll.vh * 0.5;
  let pal = PALETTES.hero;
  for (const [name, colors] of Object.entries(PALETTES)) {
    const top = scroll.anchors[name];
    if (top !== undefined && probe >= top) pal = colors;
  }
  const k = 1 - Math.exp(-3 * Math.min(dt, 1 / 30));
  uniforms.uTop.value.lerp(pal[0], k);
  uniforms.uMid.value.lerp(pal[1], k);
  uniforms.uLow.value.lerp(pal[2], k);
  uniforms.uTime.value = elapsed;
  uniforms.uScroll.value = scroll.y / Math.max(1, scroll.vh);
  // Day and night ease into each other over about a second when the theme flips.
  const night = currentTheme() === "dark" ? 1 : 0;
  uniforms.uNight.value += (night - uniforms.uNight.value) * (1 - Math.exp(-4 * Math.min(dt, 1 / 30)));
  theme.night = uniforms.uNight.value;
  // Screen y of the floor (px from the top): the cloud bank sits right under the footer's floor line.
  uniforms.uFloor.value = Math.min(1e5, scroll.floor - scroll.y);
  // Behind the tech stack the clouds spread evenly, following the scroll exactly (no easing over time, so
  // it's the same sky at the same spot every time).
  uniforms.uDense.value = sky.dense;
  uniforms.uRes.value.set(width, height);

  // Where the capsules are this frame (after the scroll and the GSAP updates, so the glass and the capsule
  // on top always land in the same frame). Only while the tech stack is near.
  let n = 0;
  const box = uniforms.uGlassBox.value.set(1e9, 1e9, -1e9, -1e9);
  if (sky.glassNear) {
    if (sky.glassMoved || caps.length !== sky.glass.length) {
      sky.glassMoved = false;
      measureCaps();
    }
    const vh = height;
    for (const c of caps) {
      if (n >= MAX_GLASS) break;
      // (Well off the screen: skipped before reading anything about it.)
      const near = c.ly - scroll.y;
      if (near + c.h < -120 || near - c.h > vh + 120) continue;
      // Not in yet (it fades in with the scroll, Motion.tsx): no glass.
      const drop = dropIn(c.cap);
      if (drop.a <= 0) continue;
      // Its row slot (drop-in: y + scale about its own centre), then the capsule's lean (hover: x, y, stretch).
      const s = drop.s;
      const gx = c.gx + num(c.el, "x");
      const gy = c.gy + num(c.el, "y");
      const x = c.lx + num(c.cap, "x") + (gx - c.lx) * s;
      const y = c.ly + drop.y + (gy - c.ly) * s - scroll.y;
      const hw = (c.w / 2) * s * (num(c.el, "scaleX") || 1);
      const hh = (c.h / 2) * s * (num(c.el, "scaleY") || 1);
      if (y + hh < -2 || y - hh > vh + 2) continue;
      uniforms.uGlassA.value[n] = drop.a;
      uniforms.uGlass.value[n++].set(x, y, hw, hh);
      box.set(Math.min(box.x, x - hw - 2), Math.min(box.y, y - hh - 2), Math.max(box.z, x + hw + 2), Math.max(box.w, y + hh + 2));
    }
  }
  uniforms.uGlassN.value = n;
}

/** The sky's two still pictures drawn on the page (BakedSky.tsx asks a worker first; this is for browsers
 *  where a worker can't draw WebGL): the top of the page with its clouds, and the last screen with the hill.
 *  Returns their object URLs (the caller frees them). */
export async function bakeSky(width: number, height: number, night: number) {
  // At the very bottom of the page the floor sits this far down the screen (see measureSections).
  const contact = document.querySelector(".contact");
  const docH = document.documentElement.scrollHeight;
  const below = contact ? docH - (contact.getBoundingClientRect().bottom + window.scrollY) : 0;
  const endFloor = height - below - floorLift(width);
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  // (as the page's canvas: "flat", colours out in sRGB)
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, depthWrite: false, depthTest: false, toneMapped: false, uniforms, defines: skyDefines() });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.Camera();
  const u = uniforms;
  const shot = async (pal: THREE.Vector3[], scrolled: number, floor: number) => {
    u.uTop.value.copy(pal[0]);
    u.uMid.value.copy(pal[1]);
    u.uLow.value.copy(pal[2]);
    u.uTime.value = 30;
    u.uScroll.value = scrolled;
    u.uNight.value = night;
    u.uFloor.value = floor;
    u.uDense.value = 0;
    u.uRes.value.set(width, height);
    u.uGlassN.value = 0;
    renderer.render(scene, camera);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/webp", 1));
    return blob ? URL.createObjectURL(blob) : "";
  };
  try {
    const top = await shot(PALETTES.hero, 0, 1e5);
    const end = await shot(PALETTES.contact, (docH - height) / height, endFloor);
    return { top, end };
  } finally {
    material.dispose();
    mesh.geometry.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

const skyDefines = (): Record<string, string> => (window.matchMedia("(pointer: coarse)").matches ? { PHONE: "" } : {});

/** Keeps the capsules' places measured. */
function useCapsMeasured() {
  // Re-measure whenever the layout can have moved (ScrollTrigger re-measures on resize, fonts, images).
  useEffect(() => {
    const again = () => measureCaps();
    ScrollTrigger.addEventListener("refresh", again);
    window.addEventListener("resize", again);
    document.fonts?.ready.then(again);
    return () => {
      ScrollTrigger.removeEventListener("refresh", again);
      window.removeEventListener("resize", again);
    };
  }, []);
}

export default function Backdrop() {
  useCapsMeasured();

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        uniforms,
        defines: skyDefines(),
      }),
    [],
  );

  useFrame((state, dt) => tickSky(dt, state.clock.elapsedTime, state.size.width, state.size.height));

  return (
    <mesh frustumCulled={false} renderOrder={-1000} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
