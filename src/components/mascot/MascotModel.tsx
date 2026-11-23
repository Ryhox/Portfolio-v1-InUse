"use client";
/* eslint-disable react-hooks/immutability -- three objects, the mixer and the brain are driven imperatively. */

import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Brain } from "./brain";
import type { World } from "./world";
import { drawFace, FACE, type Expr } from "./face";
import { makeCloud } from "./cloud";

export const MODEL = "/models/mascot.glb";

// The model (made in Blender: rig, 30 actions, colours baked into its vertices) plus everything that makes
// her feel alive on top of the actions: her face drawn live, her head turning to what she looks at, her
// ears and hair swinging after her when she moves, and her cloud.

type Frame = (brain: Brain, project: (v: THREE.Vector3) => { x: number; y: number }) => void;

// The head shader: the vertex colours, a soft blue rim (like the Blender material), and the face canvas
// projected straight onto the front of the head (bind-pose positions, so it sticks to the head however it
// moves).
function skinMaterial(opts: { rough: number; face?: THREE.Texture; headY?: number; rim?: number; iri?: number }) {
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: opts.rough,
    metalness: 0,
    sheen: 0.35,
    sheenColor: new THREE.Color("#9fb5ff"),
    sheenRoughness: 0.6,
    iridescence: opts.iri ?? 0,
    iridescenceIOR: 1.35,
  });
  const rim = opts.rim ?? 0.35;
  // (Every one of these shares onBeforeCompile's source, so without its own key three would reuse one program for all.)
  m.customProgramCacheKey = () => `mascot-${opts.face ? "face" : "skin"}-${rim}`;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = { value: rim };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFaceP;\nvarying vec3 vFaceN;")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvFaceN = objectNormal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFaceP = position;");
    let frag = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFaceP;\nvarying vec3 vFaceN;\nuniform float uRim;\nuniform sampler2D uFace;\nuniform float uHeadY;\nuniform float uHasFace;")
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(0.35, 0.5, 1.0) * pow(1.0 - clamp(abs(normal.z), 0.0, 1.0), 2.4) * uRim;",
      );
    if (opts.face) {
      sh.uniforms.uFace = { value: opts.face };
      sh.uniforms.uHeadY = { value: opts.headY ?? 0 };
      sh.uniforms.uHasFace = { value: 1 };
      frag = frag.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  {
    vec2 fuv = vec2((vFaceP.x - (${FACE.X0.toFixed(3)})) / ${(FACE.X1 - FACE.X0).toFixed(3)}, (vFaceP.y - uHeadY - (${FACE.Z0.toFixed(3)})) / ${(FACE.Z1 - FACE.Z0).toFixed(3)});
    float front = smoothstep(0.12, 0.42, normalize(vFaceN).z);
    if (fuv.x > 0.0 && fuv.x < 1.0 && fuv.y > 0.0 && fuv.y < 1.0 && front > 0.0) {
      vec4 f = texture2D(uFace, fuv);
      diffuseColor.rgb = mix(diffuseColor.rgb, f.rgb, f.a * front);
    }
  }`,
      );
    } else {
      sh.uniforms.uFace = { value: null };
      sh.uniforms.uHeadY = { value: 0 };
      sh.uniforms.uHasFace = { value: 0 };
    }
    sh.fragmentShader = frag;
  };
  return m;
}

const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpQ3 = new THREE.Quaternion();
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const clamp = THREE.MathUtils.clamp;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** A damped spring (one angle): it chases its target and overshoots a little, like something floppy. */
type Spring = { a: number; v: number };
function spring(sp: Spring, target: number, k: number, c: number, dt: number) {
  // (two half steps: stable at low frame rates)
  for (let i = 0; i < 2; i++) {
    sp.v += (k * (target - sp.a) - c * sp.v) * (dt / 2);
    sp.a += sp.v * (dt / 2);
  }
  return sp.a;
}

// Rotate a bone by `extra` in world space, after the animation has posed it.
function addWorldRotation(bone: THREE.Object3D, extra: THREE.Quaternion) {
  if (!bone.parent) return;
  bone.parent.getWorldQuaternion(tmpQ);
  bone.getWorldQuaternion(tmpQ2);
  tmpQ2.premultiply(extra);
  bone.quaternion.copy(tmpQ.invert().multiply(tmpQ2));
}

export default function MascotModel({ brain, world, onFrame }: { brain: Brain; world: World; onFrame: Frame }) {
  const gltf = useGLTF(MODEL);
  const size = useThree((s) => s.size);
  const root = useRef<THREE.Group>(null);
  const cloudRef = useRef<THREE.Group>(null);

  const rig = useMemo(() => {
    const scene = gltf.scene;
    // The Blender cloud isn't used: hers is drawn like the page's own sky (cloud.ts).
    const old = scene.getObjectByName("WX_Cloud");
    old?.removeFromParent();

    const canvas = document.createElement("canvas");
    canvas.width = FACE.W;
    canvas.height = FACE.H;
    const ctx = canvas.getContext("2d")!;
    const faceTex = new THREE.CanvasTexture(canvas);
    faceTex.colorSpace = THREE.SRGBColorSpace;
    faceTex.anisotropy = 4;

    let headY = 1.78;
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      meshes.push(m);
      m.frustumCulled = false;
      if (m.name.includes("Head")) {
        m.geometry.computeBoundingBox();
        const b = m.geometry.boundingBox!;
        // the head's centre in its own coordinates (its top is ~0.07 further from it than its bottom)
        headY = (b.min.y + b.max.y) / 2 - 0.07;
      }
    });
    for (const m of meshes) {
      const old = m.material as THREE.Material;
      if (m.name.includes("Head")) m.material = skinMaterial({ rough: 0.46, face: faceTex, headY });
      else if (m.name.includes("Bow")) m.material = skinMaterial({ rough: 0.32, rim: 0.25, iri: 0.6 });
      else m.material = skinMaterial({ rough: 0.5 });
      old.dispose();
    }

    const bone = (n: string) => scene.getObjectByName(n) as THREE.Bone | undefined;
    const bones = {
      head: bone("head"), spine: bone("spine"),
      earL: bone("ear_L1"), earR: bone("ear_R1"), earL3: bone("ear_L3"), earR3: bone("ear_R3"),
      tuftL: bone("tuft_L1"), tuftR: bone("tuft_R1"), hips: bone("hips"), footL: bone("foot_L"), footR: bone("foot_R"),
      // (for the floppy bits: secondary motion on top of the actions)
      earL2: bone("ear_L2"), earR2: bone("ear_R2"), tuftL2: bone("tuft_L2"), tuftR2: bone("tuft_R2"), tail: bone("tail"),
      legL: bone("leg_L"), legR: bone("leg_R"),
      armLu: bone("arm_Lup"), armLl: bone("arm_Llo"), armRu: bone("arm_Rup"), armRl: bone("arm_Rlo"),
    };
    // Points on her body, stored in the bones' own space (read off the rest pose), for hit testing.
    scene.updateMatrixWorld(true);
    const local = (b: THREE.Object3D | undefined, p: THREE.Vector3) => (b ? b.worldToLocal(p.clone()) : p.clone());
    const pts = {
      head: local(bones.head, new THREE.Vector3(0, 1.85, 0.1)),
      body: local(bones.hips, new THREE.Vector3(0, 0.55, 0.15)),
      earL: local(bones.earL3, new THREE.Vector3(-2.05, 3.25, 0.0)),
      earR: local(bones.earR3, new THREE.Vector3(1.6, 3.85, -0.12)),
      footL: local(bones.footL, new THREE.Vector3(-0.5, 0.4, 0.78)),
      footR: local(bones.footR, new THREE.Vector3(0.5, 0.4, 0.78)),
    };

    const mixer = new THREE.AnimationMixer(scene);
    const actions: Record<string, THREE.AnimationAction> = {};
    for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
    const durations: Record<string, number> = {};
    for (const clip of gltf.animations) durations[clip.name] = clip.duration;
    const cloud = makeCloud(17.3);
    const out = { scene, mixer, actions, durations, faceTex, ctx, bones, pts, cloud };
    if (process.env.NODE_ENV !== "production") (window as unknown as { __mascotRig?: unknown }).__mascotRig = out;
    return out;
  }, [gltf]);

  useEffect(() => {
    brain.durations = rig.durations;
    brain.start();
    const c = rig.cloud;
    cloudRef.current?.add(c.group);
    return () => {
      c.group.removeFromParent();
      c.dispose();
      rig.mixer.stopAllAction();
    };
  }, [brain, rig]);

  // live state between frames
  const st = useRef({
    layers: [] as { a: THREE.AnimationAction; w: number; fade: number }[],
    seq: -1,
    face: { expr: "neutral" as Expr, blink: -1, lx: 0, ly: 0, drawnAt: -1 },
    look: new THREE.Vector2(),
    lastX: 0, lastY: 0, vx: 0, vy: 0,
    t: 0,
    headBase: new THREE.Quaternion(),
    headBaseSet: false,
    // secondary motion: the springs, the action's own pose of each floppy bone (restored every frame, like
    // the head), and what drives them
    jig: {
      base: new Map<THREE.Object3D, THREE.Quaternion>(),
      sp: {} as Record<string, Spring>,
      roll: 0, omega: 0, vx: 0, ax: 0,
      nextKick: 0, kickUntil: 0,
      stretch: { a: 0, v: 0 } as Spring,
      wasHeld: false,
    },
  });

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const s = st.current;
    s.t += dt;
    world.update(dt);
    brain.update(dt);
    const o = brain.out;
    const S = brain.S;
    const W = size.width, H = size.height;
    const g = root.current;
    if (!g) return;

    // ---- animation: our own cross-fades, with the weights always adding up to 1 (three's own fades let
    // the rest pose bleed in mid-blend, which made her flick towards a T-pose or spin her head)
    if (o.seq !== s.seq) {
      s.seq = o.seq;
      const next = rig.actions[o.anim];
      if (next) {
        const top = s.layers[s.layers.length - 1];
        if (top && top.a === next && !o.once) {
          // same loop again: nothing to do
        } else {
          s.layers = s.layers.filter((l) => l.a !== next);
          next.reset();
          next.setLoop(o.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
          next.clampWhenFinished = o.once;
          next.timeScale = o.speed;
          next.setEffectiveWeight(0);
          next.play();
          s.layers.push({ a: next, w: s.layers.length ? 0 : 1, fade: Math.max(0.01, o.fade) });
        }
      }
    }
    {
      const L = s.layers;
      const top = L[L.length - 1];
      if (top) {
        top.w = Math.min(1, top.w + dt / top.fade);
        const rest = L.slice(0, -1);
        const sum = rest.reduce((a, l) => a + l.w, 0);
        for (const l of rest) l.w = sum > 0 ? (l.w / sum) * (1 - top.w) : 0;
        for (const l of L) l.a.setEffectiveWeight(l.w);
        for (const l of rest) if (l.w < 0.002) l.a.stop();
        s.layers = L.filter((l) => l === top || l.w >= 0.002);
      }
    }
    // three only writes a bone when its animated value changes, so on a frame where the clip holds still the
    // head would keep last frame's look-turn and the next one would be added on top (the head crept round and
    // snapped back: the flicker and the spins). Put back the clip's own head pose first, every frame.
    const hb = rig.bones.head;
    if (hb && s.headBaseSet) hb.quaternion.copy(s.headBase);
    // (same for the floppy bones: back to the action's pose before the springs are added again)
    const floppy = [
      rig.bones.spine, rig.bones.earL, rig.bones.earL2, rig.bones.earL3, rig.bones.earR, rig.bones.earR2, rig.bones.earR3,
      rig.bones.tuftL, rig.bones.tuftL2, rig.bones.tuftR, rig.bones.tuftR2, rig.bones.tail,
      rig.bones.armLu, rig.bones.armLl, rig.bones.armRu, rig.bones.armRl, rig.bones.legL, rig.bones.legR, rig.bones.footL, rig.bones.footR,
    ].filter((x): x is THREE.Bone => !!x);
    for (const fb of floppy) {
      const q = s.jig.base.get(fb);
      if (q) fb.quaternion.copy(q);
    }
    rig.mixer.update(dt);
    if (hb) {
      s.headBase.copy(hb.quaternion);
      s.headBaseSet = true;
    }
    for (const fb of floppy) {
      const q = s.jig.base.get(fb);
      if (q) q.copy(fb.quaternion);
      else s.jig.base.set(fb, fb.quaternion.clone());
    }

    // ---- place her
    g.visible = o.visible;
    g.position.set(o.x - W / 2, H / 2 - o.y, 0);
    g.scale.setScalar(S);
    g.rotation.set(0, o.yaw, o.roll);
    const vx = (o.x - s.lastX) / Math.max(dt, 1e-3), vy = (o.y - s.lastY) / Math.max(dt, 1e-3);
    s.vx = vx; s.vy = vy; s.lastX = o.x; s.lastY = o.y;

    // ---- her head turns to what she's looking at
    const b = rig.bones;
    if (b.head) {
      const hx = o.x, hy = o.y - 1.9 * S;
      const tx = THREE.MathUtils.clamp((o.look.x - hx) / 420, -1, 1);
      const ty = THREE.MathUtils.clamp((o.look.y - hy) / 380, -1, 1);
      s.look.lerp(new THREE.Vector2(tx * o.look.w, ty * o.look.w), 1 - Math.exp(-dt * 4));
      tmpE.set(s.look.y * 0.4, s.look.x * 0.62, -s.look.x * 0.1, "YXZ");
      addWorldRotation(b.head, tmpQ2.setFromEuler(tmpE).clone());
    }
    // ---- secondary motion: nothing on her is rigid. Ears, tufts and tail trail behind every turn and swerve;
    // held, her arms and legs keep hanging down while she swings (instead of swinging with her like a plank),
    // she kicks and flails now and then, and she stretches when grabbed and squashes when let go.
    {
      const j = s.jig;
      const step = Math.max(dt, 1e-3);
      let dRoll = o.roll - j.roll;
      dRoll = Math.atan2(Math.sin(dRoll), Math.cos(dRoll));
      j.roll = o.roll;
      j.omega = j.omega * 0.7 + clamp(dRoll / step, -30, 30) * 0.3;
      j.ax = j.ax * 0.8 + clamp((vx - j.vx) / step, -30000, 30000) * 0.2;
      j.vx = vx;
      const held = o.grabbing;
      const flying = !held && (o.anim === "Air" || o.anim === "Tumble" || o.anim === "Fall");
      const loose = held || flying ? 1 : 0.3; // riding: only a hint of it on her limbs
      const hang = held ? -o.swing : 0;
      // inertia: lagging behind her turning and her sideways speeding up / slowing down. Things hanging down
      // (arms, legs, tail) and things sticking up (ears, tufts) trail to opposite sides when she's pushed
      // sideways; upside down (held by the feet) that flips.
      const up = Math.cos(o.roll) >= 0 ? 1 : -1;
      const lag = -j.omega * 0.14 - j.ax * 0.0002 * up;
      const lagUp = -j.omega * 0.14 + j.ax * 0.0002 * up;
      // struggling, in little bursts (more when she's cross)
      const cross = o.expr === "angry" ? 1 : o.expr === "annoyed" ? 0.75 : 0.5;
      if (held && !world.reduced) {
        if (s.t > j.nextKick) {
          j.kickUntil = s.t + rnd(0.45, 0.9);
          j.nextKick = j.kickUntil + rnd(0.7, 2.2) / (0.5 + cross);
        }
      } else j.kickUntil = 0;
      const kicking = s.t < j.kickUntil;
      // dangling: her legs and arms always sway a little, like a plush held up (out of step, so it's loose)
      const dangle = held ? 1 : 0;
      const sway = (f: number, ph: number) => dangle * Math.sin(s.t * f + ph);
      const kick = (kicking ? Math.sin(s.t * 19) * 0.6 * cross : 0) + sway(4.2, 0) * 0.22;
      const flail = (kicking ? Math.sin(s.t * 15 + 1.3) * 0.65 * cross : 0) + sway(3.4, 1.1) * 0.18;

      const sp = (name: string, target: number, k: number, c: number) => spring((j.sp[name] ??= { a: 0, v: 0 }), target, k, c, dt);
      // (held, her ears droop a little outwards: gravity on two long floppy ears)
      const droop = held ? 0.28 : 0;
      const ear = sp("ear", clamp(lagUp * 1.5 + hang * 0.35 + droop + sway(2.6, 0.4) * 0.08, -1.2, 1.2), 70, 5.5);
      const earR = sp("earR", clamp(lagUp * 1.3 + hang * 0.35 - droop + sway(2.4, 2) * 0.08, -1.2, 1.2), 62, 5); // (a little out of step)
      const tuft = sp("tuft", clamp(lagUp * 1.1 + hang * 0.3, -1, 1), 95, 7);
      const tail = sp("tail", clamp(lag + hang * 0.45, -1, 1), 80, 6);
      const armL = sp("armL", clamp(lag * 0.8 * loose + hang * 0.75 + flail, -1.4, 1.4), 55, 6);
      const armR = sp("armR", clamp(lag * 0.8 * loose + hang * 0.75 - flail, -1.4, 1.4), 50, 5.5);
      const legL = sp("legL", clamp(lag * 0.6 * loose + hang * 0.8 + kick, -1.3, 1.3), 48, 5);
      const legR = sp("legR", clamp(lag * 0.6 * loose + hang * 0.8 - kick + sway(4.6, 2.2) * 0.12, -1.3, 1.3), 44, 4.6);
      const spine = sp("spine", clamp(hang * 0.18 + lag * 0.2 * loose, -0.5, 0.5), 90, 10);

      const turn = (bn: THREE.Object3D | undefined, a: number) => {
        if (bn && Math.abs(a) > 1e-4) addWorldRotation(bn, tmpQ3.setFromAxisAngle(AXIS_Z, a));
      };
      turn(b.spine, spine);
      turn(b.earL, ear * 0.5); turn(b.earL2, ear * 0.3); turn(b.earL3, ear * 0.2);
      turn(b.earR, earR * 0.5); turn(b.earR2, earR * 0.3); turn(b.earR3, earR * 0.2);
      turn(b.tuftL, tuft * 0.6); turn(b.tuftL2, tuft * 0.4);
      turn(b.tuftR, tuft * 0.6); turn(b.tuftR2, tuft * 0.4);
      turn(b.tail, tail);
      turn(b.armLu, armL); turn(b.armLl, armL * 0.35);
      turn(b.armRu, armR); turn(b.armRl, armR * 0.35);
      turn(b.legL, legL); turn(b.footL, legL * 0.3);
      turn(b.legR, legR); turn(b.footR, legR * 0.3);

      // squash and stretch: pulled long when you grab her, squished when you let go
      if (held && !j.wasHeld) j.stretch.v += 3.2;
      if (!held && j.wasHeld) j.stretch.v -= 2.4;
      j.wasHeld = held;
      const st2 = clamp(spring(j.stretch, 0, 170, 9, dt), -0.18, 0.22);
      g.scale.set(S * (1 - st2 * 0.45), S * (1 + st2), S);
    }

    // ---- face (only redrawn when something on it changes)
    const f = s.face;
    const lx = Math.round(s.look.x * 6) / 6, ly = Math.round(-s.look.y * 6) / 6;
    const blinkQ = Math.round(o.blink * 8) / 8;
    if (f.expr !== o.expr || f.blink !== blinkQ || f.lx !== lx || f.ly !== ly || o.expr === "dizzy") {
      f.expr = o.expr; f.blink = blinkQ; f.lx = lx; f.ly = ly;
      drawFace(rig.ctx, { expr: o.expr, blink: blinkQ, lookX: lx, lookY: ly, t: s.t });
      rig.faceTex.needsUpdate = true;
    }

    // ---- the cloud
    const cg = cloudRef.current;
    if (cg) {
      const bob = Math.sin(s.t * 1.7) * 0.06 * S;
      cg.position.set(o.cloud.x - W / 2, H / 2 - o.cloud.y + bob, 0);
      const q = THREE.MathUtils.clamp(o.cloud.squash, -0.25, 0.3);
      cg.scale.set(S * (1 + q), S * (1 - q), S);
      cg.rotation.z = o.cloud.tilt;
      rig.cloud.set(s.t, world.night);
      // she bobs with it while she's riding
      if (Math.abs(o.cloud.x - o.x) < 2 && Math.abs(o.cloud.y - o.y) < 2) g.position.y += bob - q * 0.4 * S;
    }

    // ---- where her body is on screen (hit areas, speech bubble)
    g.updateMatrixWorld(true);
    const project = (v: THREE.Vector3) => ({ x: v.x + W / 2, y: H / 2 - v.y });
    const wp = (bn: THREE.Object3D | undefined, p: THREE.Vector3) => project(bn ? bn.localToWorld(tmpV.copy(p)) : tmpV.set(0, 0, 0));
    const head = wp(b.head, rig.pts.head), body = wp(b.hips, rig.pts.body);
    const eL = wp(b.earL3, rig.pts.earL), eR = wp(b.earR3, rig.pts.earR);
    brain.geo = {
      head: { x: head.x, y: head.y, r: 1.3 * S },
      body: { x: body.x, y: body.y, r: 0.75 * S },
      ears: [{ x: eL.x, y: eL.y, r: 0.55 * S }, { x: eR.x, y: eR.y, r: 0.55 * S }],
      feet: [wp(b.footL, rig.pts.footL), wp(b.footR, rig.pts.footR)].map((f) => ({ x: f.x, y: f.y, r: 0.42 * S })),
    };
    onFrame(brain, project);
  });

  return (
    <>
      <group ref={cloudRef} />
      <group ref={root}>
        <primitive object={rig.scene} />
      </group>
    </>
  );
}

useGLTF.preload(MODEL);
