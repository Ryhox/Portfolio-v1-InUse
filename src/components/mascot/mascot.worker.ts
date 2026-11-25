/// <reference lib="webworker" />
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { FACE } from "./face";
import { MascotRig, type FrameIn } from "./rig";
import { compileInBackground, drawOnce } from "../three/compile";

// Draws her off the page's main thread: the page sends what her brain decided each frame, this poses her,
// renders her into the page's canvas (handed over as an OffscreenCanvas) and sends back where her body is on
// screen (for the spots that take the pointer, and her speech balloon). Set up exactly like the page's own
// canvas was (MascotStage.tsx): the same camera, lights and renderer settings, so she looks the same.

export type ToWorker =
  | { type: "init"; canvas: OffscreenCanvas; width: number; height: number; dpr: number; url: string }
  | { type: "size"; width: number; height: number; dpr: number }
  | { type: "frame"; dt: number; in: FrameIn };
export type FromWorker =
  | { type: "loaded"; durations: Record<string, number> }
  | { type: "ready" }
  | { type: "geo"; geo: ReturnType<MascotRig["frame"]> }
  | { type: "failed"; message: string };

const post = (m: FromWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

let renderer: THREE.WebGLRenderer | null = null;
let camera: THREE.OrthographicCamera | null = null;
let scene: THREE.Scene | null = null;
let rig: MascotRig | null = null;

function size(width: number, height: number, dpr: number) {
  if (!renderer || !camera) return;
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  camera.left = -width / 2;
  camera.right = width / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
}

async function init(m: Extract<ToWorker, { type: "init" }>) {
  renderer = new THREE.WebGLRenderer({ canvas: m.canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  // (as the page's canvas: "flat", colours out in sRGB)
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  camera.position.set(0, 0, 2000);
  camera.lookAt(0, 0, 0);
  size(m.width, m.height, m.dpr);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#eef3ff", "#9aaeff", 1.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.45);
  key.position.set(-300, 600, 800);
  const fill = new THREE.DirectionalLight("#cfdcff", 0.45);
  fill.position.set(500, 200, 300);
  scene.add(key, fill);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(m.url);
  rig = new MascotRig(gltf, new OffscreenCanvas(FACE.W, FACE.H));
  scene.add(rig.root);
  post({ type: "loaded", durations: rig.durations });

  // Compile her shaders in the background, then draw her once (compile.ts): all of it now, while the page's
  // loader is still up.
  await compileInBackground(renderer, scene, camera);
  drawOnce(renderer, scene, camera);
  renderer.clear();
  post({ type: "ready" });
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === "init") {
    init(m).catch((err: unknown) => post({ type: "failed", message: String(err) }));
  } else if (m.type === "size") {
    size(m.width, m.height, m.dpr);
  } else if (m.type === "frame") {
    if (!rig || !renderer || !scene || !camera) return;
    const geo = rig.frame(m.dt, m.in);
    renderer.render(scene, camera);
    post({ type: "geo", geo });
  }
};
