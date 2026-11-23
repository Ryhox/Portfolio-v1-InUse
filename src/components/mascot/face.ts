// Her face, drawn live into a canvas that the head's shader projects onto its front (straight on, like the
// texture it was designed as in Blender). Drawing it here instead of baking it means she can blink, glance
// around and pull every expression without a single extra download.

export type Expr =
  | "neutral"
  | "bored"
  | "annoyed"
  | "angry"
  | "surprised"
  | "content"
  | "sleep"
  | "dizzy"
  | "squint"
  | "smug"
  | "yawn";

export type FaceState = {
  expr: Expr;
  /** 0 = open, 1 = shut (the blink, on top of whatever the expression does to the lids). */
  blink: number;
  /** Where she's looking, -1..1 (moves the highlights in her eyes). */
  lookX: number;
  lookY: number;
  /** Seconds, for anything that wobbles (the dizzy spirals). */
  t: number;
};

// The patch of the head the canvas covers, in the head's own units (x right, z up from the head's centre).
export const FACE = { W: 1024, H: 560, X0: -1.25, X1: 1.25, Z0: -0.95, Z1: 0.4 };

const px = (x: number) => ((x - FACE.X0) / (FACE.X1 - FACE.X0)) * FACE.W;
const py = (z: number) => (1 - (z - FACE.Z0) / (FACE.Z1 - FACE.Z0)) * FACE.H;
const K = FACE.W / (FACE.X1 - FACE.X0);

type P = [number, number];

function catmull(pts: P[], n: number, closed: boolean): P[] {
  const out: P[] = [];
  const N = pts.length;
  const at = (i: number) => (closed ? pts[(i + N) % N] : pts[Math.max(0, Math.min(N - 1, i))]);
  const last = closed ? N : N - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (j: 0 | 1) =>
        0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  if (!closed) out.push(pts[N - 1]);
  return out;
}

const EYE: P[] = [
  [-0.275, 0.165], [-0.1, 0.168], [0.08, 0.152], [0.215, 0.125], [0.255, 0.02], [0.24, -0.11],
  [0.15, -0.2], [0.02, -0.235], [-0.14, -0.21], [-0.245, -0.13], [-0.285, 0.0], [-0.29, 0.11],
];
// The upper lid line, inner corner to outer corner (u: towards the nose).
const LID: P[] = [[0.3, 0.1], [0.22, 0.125], [0.08, 0.152], [-0.1, 0.168], [-0.275, 0.165], [-0.33, 0.158]];
const INK = "#03041a";
const INK_SOFT = "#0a0c33";

function path(ctx: CanvasRenderingContext2D, pts: P[], close = true) {
  ctx.beginPath();
  pts.forEach(([x, z], i) => (i ? ctx.lineTo(px(x), py(z)) : ctx.moveTo(px(x), py(z))));
  if (close) ctx.closePath();
}

// A stroke that tapers from w0 to w1 (in head units) along its points.
function taper(ctx: CanvasRenderingContext2D, pts: P[], w0: number, w1: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  for (let i = 0; i < pts.length - 1; i++) {
    const t = i / Math.max(1, pts.length - 2);
    ctx.lineWidth = (w0 + (w1 - w0) * t) * K;
    ctx.beginPath();
    ctx.moveTo(px(pts[i][0]), py(pts[i][1]));
    ctx.lineTo(px(pts[i + 1][0]), py(pts[i + 1][1]));
    ctx.stroke();
  }
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, z: number, a: number) {
  ctx.beginPath();
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    const X = x + a * Math.sign(c) * c * c * c * c;
    const Z = z + a * Math.sign(s) * s * s * s * s;
    if (i) ctx.lineTo(px(X), py(Z));
    else ctx.moveTo(px(X), py(Z));
  }
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
}

// How far each expression lowers the upper lids (0 open .. 1 shut) and tilts them (inner corner down).
const LIDS: Record<Expr, { lid: number; tilt: number; raise?: number }> = {
  neutral: { lid: 0, tilt: 0 },
  bored: { lid: 0.24, tilt: 0 },
  annoyed: { lid: 0.32, tilt: 0.035 },
  angry: { lid: 0.26, tilt: 0.085 },
  surprised: { lid: 0, tilt: -0.02, raise: 0.035 },
  content: { lid: 1, tilt: 0 },
  sleep: { lid: 1, tilt: 0 },
  dizzy: { lid: 0, tilt: 0 },
  squint: { lid: 0, tilt: 0 },
  smug: { lid: 0.4, tilt: -0.015 },
  yawn: { lid: 0.82, tilt: 0 },
};

function eye(ctx: CanvasRenderingContext2D, side: -1 | 1, st: FaceState) {
  const ecx = side * 0.5, ecz = -0.27;
  const L = (u: number, v: number): P => [ecx - side * u, ecz + v];

  if (st.expr === "dizzy") {
    const pts: P[] = [];
    const turns = 2.6;
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const a = t * turns * Math.PI * 2 * side + st.t * 5 * side;
      pts.push([ecx + Math.cos(a) * 0.19 * t, ecz - 0.03 + Math.sin(a) * 0.17 * t]);
    }
    taper(ctx, pts, 0.012, 0.026, INK);
    return;
  }
  if (st.expr === "squint") {
    // >  <  : the point of each chevron towards the nose
    const pts: P[] = [L(-0.2, 0.13), L(0.16, -0.02), L(-0.2, -0.17)];
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 0.05 * K;
    ctx.strokeStyle = INK;
    path(ctx, pts, false);
    ctx.stroke();
    return;
  }

  const L0 = LIDS[st.expr];
  const shut = Math.min(1, Math.max(0, L0.lid + st.blink * (1 - L0.lid)));
  const drop = shut * 0.4 - (L0.raise ?? 0);
  // The lid curve, lowered and tilted (inner corner down for angry / annoyed).
  const lid = catmull(LID, 6, false).map(([u, v]) => L(u, v - drop - L0.tilt * ((u + 0.3) / 0.6)));

  if (shut < 0.97) {
    const outline = catmull(EYE, 14, true).map(([u, v]) => L(u, v));
    ctx.save();
    path(ctx, outline);
    ctx.clip();
    // everything below the lid line
    path(ctx, [...lid, [lid[lid.length - 1][0], ecz - 0.6], [lid[0][0], ecz - 0.6]]);
    ctx.clip();
    const g = ctx.createLinearGradient(0, py(ecz + 0.17), 0, py(ecz - 0.235));
    g.addColorStop(0, "#030412");
    g.addColorStop(0.45, "#080c3a");
    g.addColorStop(1, "#234bea");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FACE.W, FACE.H);
    const lx = st.lookX * 0.035, lz = st.lookY * 0.03;
    // the sharp light rising from the bottom
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    path(ctx, [L(0.0 + lx, -0.25), L(0.055 + lx, -0.15 + lz), L(0.085 + lx, -0.025 + lz), L(0.115 + lx, -0.15 + lz), L(0.17 + lx, -0.24)]);
    ctx.fill();
    const big = st.expr === "surprised" ? 0.12 : 0.1;
    const [sx, sz] = L(-0.11 + lx, -0.1 + lz);
    sparkle(ctx, sx, sz, big);
    ctx.restore();
  }

  // Lid line, eyeliner wing and the little lash, all riding on the lid.
  if (shut >= 0.97) {
    const smile = st.expr === "content" ? 0.035 : 0.012;
    const closed = catmull(
      [L(0.22, -0.16), L(0.05, -0.16 - smile), L(-0.12, -0.16 - smile), L(-0.27, -0.14)],
      6,
      false,
    );
    taper(ctx, closed, 0.016, 0.026, INK);
    const o = closed[closed.length - 1];
    taper(ctx, [o, [o[0] + side * 0.06, o[1] + 0.02], [o[0] + side * 0.11, o[1] + 0.05]], 0.022, 0.003, INK);
    return;
  }
  taper(ctx, lid.slice(1, -1), 0.012, 0.026, INK);
  const end = lid[lid.length - 2];
  const wing: P[] = [end, [end[0] + side * 0.07, end[1] + 0.015], [end[0] + side * 0.125, end[1] + 0.04], [end[0] + side * 0.165, end[1] + 0.08]];
  taper(ctx, catmull(wing, 5, false), 0.026, 0.003, INK);
  // the little lower lash sits on the outer edge of the eye, so it only shows while the eye is open
  if (shut < 0.15) {
    const lb = L(-0.268, 0.085);
    taper(ctx, [lb, [lb[0] + side * 0.06, lb[1] + 0.012], [lb[0] + side * 0.1, lb[1] + 0.037]], 0.016, 0.003, INK);
  }
}

function blush(ctx: CanvasRenderingContext2D, side: -1 | 1, k: number) {
  const x = px(side * 0.88), y = py(-0.43);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.5);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.135 * K);
  g.addColorStop(0, `rgba(255,135,185,${0.8 * k})`);
  g.addColorStop(0.55, `rgba(255,135,185,${0.55 * k})`);
  g.addColorStop(1, "rgba(255,135,185,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 0.135 * K, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function mouth(ctx: CanvasRenderingContext2D, st: FaceState) {
  const MZ = -0.56;
  ctx.strokeStyle = INK_SOFT;
  ctx.fillStyle = INK_SOFT;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 0.022 * K;
  const arc = (r: number, h: number, a0: number, a1: number, z = MZ, x = 0) => {
    ctx.beginPath();
    for (let a = a0; a <= a1 + 0.01; a += 8) {
      const R = (a * Math.PI) / 180;
      const X = px(x + r * Math.cos(R)), Y = py(z - 0.018 + h * Math.sin(R));
      if (a === a0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    }
    ctx.stroke();
  };
  switch (st.expr) {
    case "annoyed":
    case "bored":
      ctx.beginPath();
      ctx.moveTo(px(-0.045), py(MZ - 0.008));
      ctx.lineTo(px(0.045), py(MZ + 0.004));
      ctx.stroke();
      break;
    case "surprised":
    case "sleep": {
      const r = st.expr === "sleep" ? 0.018 : 0.03;
      ctx.beginPath();
      ctx.ellipse(px(0), py(MZ - 0.01), r * K, r * 1.25 * K, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "yawn": {
      ctx.beginPath();
      ctx.ellipse(px(0), py(MZ - 0.03), 0.06 * K, 0.075 * K, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ff8fb8";
      ctx.beginPath();
      ctx.ellipse(px(0), py(MZ - 0.075), 0.035 * K, 0.025 * K, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "content":
      arc(0.045, -0.024, 15, 165, MZ + 0.012);
      break;
    case "smug":
      ctx.beginPath();
      ctx.moveTo(px(-0.05), py(MZ - 0.006));
      ctx.quadraticCurveTo(px(0.01), py(MZ - 0.02), px(0.06), py(MZ + 0.022));
      ctx.stroke();
      break;
    case "dizzy": {
      ctx.beginPath();
      for (let i = 0; i <= 20; i++) {
        const x = -0.07 + (i / 20) * 0.14;
        const z = MZ - 0.01 + Math.sin(i * 0.95 + st.t * 6) * 0.012;
        if (i) ctx.lineTo(px(x), py(z));
        else ctx.moveTo(px(x), py(z));
      }
      ctx.stroke();
      break;
    }
    case "angry":
    case "squint":
      arc(0.058, 0.034, 20, 160);
      break;
    default:
      arc(0.048, 0.026, 15, 165);
  }
}

export function drawFace(ctx: CanvasRenderingContext2D, st: FaceState) {
  ctx.clearRect(0, 0, FACE.W, FACE.H);
  const k = st.expr === "angry" || st.expr === "content" || st.expr === "squint" ? 1.25 : st.expr === "sleep" ? 0.9 : 1;
  blush(ctx, -1, k);
  blush(ctx, 1, k);
  eye(ctx, -1, st);
  eye(ctx, 1, st);
  mouth(ctx, st);
}
