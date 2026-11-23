import * as THREE from "three";

// Her cloud, drawn the way the sky draws its own (three/Backdrop.tsx): the same value-noise cumulus, sunlit
// white tops, blue-grey bellies, light from the sun up and to the right, see-through soft edges, and the same
// moonlit colours at night. Only it's one small, round cloud, shaped like a seat, that she rides around on.
//
// Two layers: the back (all of it, behind her) and the front (just the lower puffs, in front of her), so she
// sits *in* the fluff rather than on a picture of it.

const vertex = /* glsl */ `
  varying vec2 vP;
  uniform vec4 uBox; // x0, y0, w, h in cloud units (seat at 0,0)
  void main() {
    vP = vec2(uBox.x + uv.x * uBox.z, uBox.y + uv.y * uBox.w);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform float uTime;
  uniform float uNight;
  uniform float uFront;
  uniform float uSeed;
  varying vec2 vP;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      s += a * noise(p);
      p = mat2(1.6, 1.2, -1.2, 1.6) * p;
      a *= 0.5;
    }
    return s;
  }
  float puff(vec2 p, vec2 c, vec2 r) {
    return 1.0 - length((p - c) / r);
  }
  // How much cloud is here: a seat-shaped cluster of puffs (higher at the sides, a dip in the middle where
  // she sits), made billowy by the same two-scale noise as the sky's cumulus.
  float shape(vec2 p) {
    float d = puff(p, vec2(0.0, -0.55), vec2(1.75, 0.62));
    d = max(d, puff(p, vec2(-1.05, -0.28), vec2(0.62, 0.55)));
    d = max(d, puff(p, vec2(1.1, -0.25), vec2(0.66, 0.58)));
    d = max(d, puff(p, vec2(-0.45, -0.12), vec2(0.62, 0.5)));
    d = max(d, puff(p, vec2(0.52, -0.1), vec2(0.6, 0.5)));
    d = max(d, puff(p, vec2(-1.62, -0.55), vec2(0.42, 0.36)));
    d = max(d, puff(p, vec2(1.66, -0.52), vec2(0.42, 0.38)));
    d = max(d, puff(p, vec2(0.0, -0.18), vec2(0.55, 0.32)));
    vec2 q = p * 1.35 + vec2(uSeed, uSeed * 0.37) + vec2(uTime * 0.045, 0.0);
    float base = fbm(q * 0.9);
    float detail = fbm(q * 2.6 + vec2(base * 1.6, 0.0));
    return d + (base - 0.5) * 0.34 + (detail - 0.5) * 0.22;
  }

  void main() {
    float d = shape(vP);
    float a = smoothstep(0.0, 0.16, d);
    // The front layer: only the low puffs, a touch denser, so they read as in front of her.
    if (uFront > 0.5) a *= smoothstep(-0.12, -0.34, vP.y) * smoothstep(0.02, 0.2, d);
    if (a <= 0.001) discard;
    // Sunlight reaching this spot: how much cloud lies towards the sun (up and to the right).
    float depth = 0.0;
    for (int i = 1; i <= 3; i++) depth += max(0.0, shape(vP + vec2(0.07, 0.14) * float(i)));
    float sun = exp(-depth * 1.0);
    vec3 belly = vec3(0.6, 0.68, 0.8);
    vec3 sunlit = vec3(1.0, 0.995, 0.98);
    vec3 col = mix(mix(belly, sunlit, sun), mix(vec3(0.05, 0.08, 0.2), vec3(0.3, 0.36, 0.6), sun), uNight);
    gl_FragColor = vec4(col, a * mix(0.97, 0.62, uNight));
  }
`;

// In cloud units: x -2.3..2.3, y -1.45..0.75 around her seat.
const BOX = new THREE.Vector4(-2.3, -1.45, 4.6, 2.2);

export function makeCloud(seed: number) {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(BOX.z, BOX.w);
  geo.translate(BOX.x + BOX.z / 2, BOX.y + BOX.w / 2, 0);
  const make = (front: boolean) =>
    new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uBox: { value: BOX },
        uTime: { value: 0 },
        uNight: { value: 0 },
        uFront: { value: front ? 1 : 0 },
        uSeed: { value: seed },
      },
    });
  const back = new THREE.Mesh(geo, make(false));
  const front = new THREE.Mesh(geo, make(true));
  // (z in cloud units: behind and in front of her body, which is about 1 unit deep.)
  back.position.z = -2.2;
  front.position.z = 2.2;
  back.renderOrder = 0;
  front.renderOrder = 2;
  group.add(back, front);
  const set = (time: number, night: number) => {
    for (const m of [back, front]) {
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      u.uTime.value = time;
      u.uNight.value = night;
    }
  };
  const dispose = () => {
    geo.dispose();
    (back.material as THREE.Material).dispose();
    (front.material as THREE.Material).dispose();
  };
  return { group, set, dispose };
}
