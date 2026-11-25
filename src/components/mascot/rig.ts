import * as THREE from "three";
import type { Geo, Out } from "./brain";
import { drawFace, FACE, type Expr } from "./face";
import { makeCloud } from "./cloud";

// Her body, without React: the model (made in Blender: rig, 30 actions, colours baked into its vertices) plus
// everything that makes her feel alive on top of the actions: her face drawn live, her head turning to what
// she looks at, her ears and hair swinging after her when she moves, and her cloud. Driven one frame at a time
// by what her brain decided (brain.ts). The same code runs in a worker (mascot.worker.ts, so drawing her costs
// the page nothing) or, where a worker can't draw, on the page (MascotModel.tsx).

export const MODEL = "/models/mascot.glb";

/** What a frame needs from the page: her brain's output and the screen. */
export type FrameIn = { out: Out; S: number; W: number; H: number; night: number };

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

type Gltf = { scene: THREE.Group; animations: THREE.AnimationClip[] };

export class MascotRig {
  /** Everything to add to the scene: her cloud, then her. */
  readonly root = new THREE.Group();
  readonly durations: Record<string, number>;
  private readonly cloudGroup = new THREE.Group();
  private readonly model = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<string, THREE.AnimationAction>;
  private readonly faceTex: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly bones: Record<string, THREE.Bone | undefined>;
  private readonly pts: Record<string, THREE.Vector3>;
  private readonly cloud: ReturnType<typeof makeCloud>;
  // live state between frames
  private readonly st = {
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
    },
  };

  constructor(gltf: Gltf, faceCanvas: HTMLCanvasElement | OffscreenCanvas) {
    const scene = gltf.scene;
    // The Blender cloud isn't used: hers is drawn like the page's own sky (cloud.ts).
    const old = scene.getObjectByName("WX_Cloud");
    old?.removeFromParent();

    const canvas = faceCanvas;
    canvas.width = FACE.W;
    canvas.height = FACE.H;
    // (a page canvas, or an OffscreenCanvas in the worker: both draw the same)
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const faceTex = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
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
    this.mixer = mixer;
    this.actions = actions;
    this.durations = durations;
    this.faceTex = faceTex;
    this.ctx = ctx;
    this.bones = bones;
    this.pts = pts;
    this.cloud = cloud;
    this.cloudGroup.add(cloud.group);
    this.model.add(scene);
    this.root.add(this.cloudGroup, this.model);
  }

  /** One frame: pose, place and dress her for what her brain decided; returns where her body is on screen. */
  frame(dt: number, inp: FrameIn): Geo {
    const s = this.st;
    const g = this.model;
    const o = inp.out;
    const S = inp.S;
    const W = inp.W, H = inp.H;
    s.t += dt;

    // ---- animation: our own cross-fades, with the weights always adding up to 1 (three's own fades let
    // the rest pose bleed in mid-blend, which made her flick towards a T-pose or spin her head)
    if (o.seq !== s.seq) {
      s.seq = o.seq;
      const next = this.actions[o.anim];
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
    const hb = this.bones.head;
    if (hb && s.headBaseSet) hb.quaternion.copy(s.headBase);
    // (same for the floppy bones: back to the action's pose before the springs are added again)
    const floppy = [
      this.bones.spine, this.bones.earL, this.bones.earL2, this.bones.earL3, this.bones.earR, this.bones.earR2, this.bones.earR3,
      this.bones.tuftL, this.bones.tuftL2, this.bones.tuftR, this.bones.tuftR2, this.bones.tail,
      this.bones.armLu, this.bones.armLl, this.bones.armRu, this.bones.armRl, this.bones.legL, this.bones.legR, this.bones.footL, this.bones.footR,
    ].filter((x): x is THREE.Bone => !!x);
    for (const fb of floppy) {
      const q = s.jig.base.get(fb);
      if (q) fb.quaternion.copy(q);
    }
    this.mixer.update(dt);
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
    const b = this.bones;
    if (b.head) {
      const hx = o.x, hy = o.y - 1.9 * S;
      const tx = THREE.MathUtils.clamp((o.look.x - hx) / 420, -1, 1);
      const ty = THREE.MathUtils.clamp((o.look.y - hy) / 380, -1, 1);
      s.look.lerp(new THREE.Vector2(tx * o.look.w, ty * o.look.w), 1 - Math.exp(-dt * 4));
      tmpE.set(s.look.y * 0.4, s.look.x * 0.62, -s.look.x * 0.1, "YXZ");
      addWorldRotation(b.head, tmpQ2.setFromEuler(tmpE).clone());
    }
    // ---- secondary motion: nothing on her is rigid. Ears, tufts and tail trail behind every turn and swerve,
    // and her arms and legs a little (fully when she's flying through the air).
    {
      const j = s.jig;
      const step = Math.max(dt, 1e-3);
      let dRoll = o.roll - j.roll;
      dRoll = Math.atan2(Math.sin(dRoll), Math.cos(dRoll));
      j.roll = o.roll;
      j.omega = j.omega * 0.7 + clamp(dRoll / step, -30, 30) * 0.3;
      j.ax = j.ax * 0.8 + clamp((vx - j.vx) / step, -30000, 30000) * 0.2;
      j.vx = vx;
      const flying = o.anim === "Air" || o.anim === "Tumble" || o.anim === "Fall";
      const loose = flying ? 1 : 0.3; // riding: only a hint of it on her limbs
      // inertia: lagging behind her turning and her sideways speeding up / slowing down. Things hanging down
      // (arms, legs, tail) and things sticking up (ears, tufts) trail to opposite sides when she's pushed
      // sideways; upside down (held by the feet) that flips.
      const up = Math.cos(o.roll) >= 0 ? 1 : -1;
      const lag = -j.omega * 0.14 - j.ax * 0.0002 * up;
      const lagUp = -j.omega * 0.14 + j.ax * 0.0002 * up;
      const sp = (name: string, target: number, k: number, c: number) => spring((j.sp[name] ??= { a: 0, v: 0 }), target, k, c, dt);
      const ear = sp("ear", clamp(lagUp * 1.5, -1.2, 1.2), 70, 5.5);
      const earR = sp("earR", clamp(lagUp * 1.3, -1.2, 1.2), 62, 5); // (a little out of step)
      const tuft = sp("tuft", clamp(lagUp * 1.1, -1, 1), 95, 7);
      const tail = sp("tail", clamp(lag, -1, 1), 80, 6);
      const armL = sp("armL", clamp(lag * 0.8 * loose, -1.4, 1.4), 55, 6);
      const armR = sp("armR", clamp(lag * 0.8 * loose, -1.4, 1.4), 50, 5.5);
      const legL = sp("legL", clamp(lag * 0.6 * loose, -1.3, 1.3), 48, 5);
      const legR = sp("legR", clamp(lag * 0.6 * loose, -1.3, 1.3), 44, 4.6);
      const spine = sp("spine", clamp(lag * 0.2 * loose, -0.5, 0.5), 90, 10);

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

    }

    // ---- face (only redrawn when something on it changes)
    const f = s.face;
    const lx = Math.round(s.look.x * 6) / 6, ly = Math.round(-s.look.y * 6) / 6;
    const blinkQ = Math.round(o.blink * 8) / 8;
    if (f.expr !== o.expr || f.blink !== blinkQ || f.lx !== lx || f.ly !== ly || o.expr === "dizzy") {
      f.expr = o.expr; f.blink = blinkQ; f.lx = lx; f.ly = ly;
      drawFace(this.ctx, { expr: o.expr, blink: blinkQ, lookX: lx, lookY: ly, t: s.t });
      this.faceTex.needsUpdate = true;
    }

    // ---- the cloud
    const cg = this.cloudGroup;
    if (cg) {
      const bob = Math.sin(s.t * 1.7) * 0.06 * S;
      cg.position.set(o.cloud.x - W / 2, H / 2 - o.cloud.y + bob, 0);
      const q = THREE.MathUtils.clamp(o.cloud.squash, -0.25, 0.3);
      cg.scale.set(S * (1 + q), S * (1 - q), S);
      cg.rotation.z = o.cloud.tilt;
      this.cloud.set(s.t, inp.night);
      // she bobs with it while she's riding
      if (Math.abs(o.cloud.x - o.x) < 2 && Math.abs(o.cloud.y - o.y) < 2) g.position.y += bob - q * 0.4 * S;
    }

    // ---- where her body is on screen (hit areas, speech bubble)
    g.updateMatrixWorld(true);
    const project = (v: THREE.Vector3) => ({ x: v.x + W / 2, y: H / 2 - v.y });
    const wp = (bn: THREE.Object3D | undefined, p: THREE.Vector3) => project(bn ? bn.localToWorld(tmpV.copy(p)) : tmpV.set(0, 0, 0));
    const head = wp(b.head, this.pts.head), body = wp(b.hips, this.pts.body);
    const eL = wp(b.earL3, this.pts.earL), eR = wp(b.earR3, this.pts.earR);
    return {
      head: { x: head.x, y: head.y, r: 1.3 * S },
      body: { x: body.x, y: body.y, r: 0.75 * S },
      ears: [{ x: eL.x, y: eL.y, r: 0.55 * S }, { x: eR.x, y: eR.y, r: 0.55 * S }],
      feet: [wp(b.footL, this.pts.footL), wp(b.footR, this.pts.footR)].map((f) => ({ x: f.x, y: f.y, r: 0.42 * S })),
    };
  }

  dispose() {
    this.cloud.group.removeFromParent();
    this.cloud.dispose();
    this.mixer.stopAllAction();
  }
}
