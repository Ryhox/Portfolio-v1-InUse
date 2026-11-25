// The sky's shader (Backdrop.tsx).

// Most capsules the glass can draw at once.
export const MAX_GLASS = 24;

export const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

export const fragment = /* glsl */ `
  uniform float uTime;
  uniform float uScroll;
  uniform float uNight;
  uniform float uFloor;
  // Behind the tech stack the clouds spread evenly over the whole sky (0..1, straight from the scroll).
  uniform float uDense;
  // Phones (PHONE defined): one octave of cloud detail less (on a small screen the finest one breaks the
  // clouds into specks), and round gradient noise (see noise()).
  uniform vec2 uRes;
  // The tech stack's capsules: centre x, y and half width, height, in CSS px from the top left.
  uniform vec4 uGlass[${MAX_GLASS}];
  // and how much of each is there (it fades in with its capsule).
  uniform float uGlassA[${MAX_GLASS}];
  uniform int uGlassN;
  // Their bounds (min x, min y, max x, max y), so the rest of the sky skips them in one test.
  uniform vec4 uGlassBox;
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uLow;
  // Always 0. Added to every loop count, so the counts aren't known when the shader is compiled: on Windows
  // (ANGLE on D3D11) the shader compiler otherwise unrolls every loop and inlines every call into one huge
  // straight line, and compiling the sky took over ten seconds, freezing the page while it loaded.
  uniform int uLoop;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  // Value noise: random values on a square grid, blended. Cheap, and right for a big screen, but its
  // contours follow the grid, so a narrow phone screen (a few big cells across) shows clouds with straight
  // edges, squares and triangles. Phones get gradient noise instead (a random slope at each grid point),
  // whose contours are round; scaled to the same spread, so the sky has as much cloud.
  vec2 slope(vec2 i) {
    // (Each grid point wrapped into a small range first: further down the page the coordinates get big,
    // and some phone GPUs lose the precision the hash needs there.)
    i = mod(i, 289.0);
    return vec2(hash(i), hash(i + vec2(31.7, 17.3))) * 2.0 - 1.0;
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    // (which one is decided when the shader is built: a screen only compiles the noise it uses)
    #ifdef PHONE
      vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
      float a = dot(slope(i), f);
      float b = dot(slope(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
      float c = dot(slope(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
      float d = dot(slope(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
      return clamp(0.5 + 1.5 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y), 0.0, 1.0);
    #else
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    #endif
  }
  float fbm(vec2 p, int n) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < n + uLoop; i++) {
      s += a * noise(p);
      p = mat2(1.6, 1.2, -1.2, 1.6) * p;
      a *= 0.5;
    }
    // Fewer octaves (the frosted look): the fine detail's average stands in, so there's as much cloud.
    return s + a * (1.0 - pow(0.5, float(5 - n)));
  }

  float fbm(vec2 p) {
    return fbm(p, 5);
  }

  // Cumulus: big shapes where the clouds are, billowy detail on top of them.
  float cloud(vec2 p, int n) {
    float base = fbm(p * 0.55, n);
    float puff = fbm(p * 1.8 + vec2(base * 1.6, 0.0), n);
    return base * 0.72 + puff * 0.42;
  }
  // One layer: x = coverage (soft at the edges), y = sunlight reaching it (how much cloud lies between it
  // and the sun, up and to the right). Clear sky costs one lookup. n = octaves (5 sharp, fewer = frosted);
  // frost also softens the edges, around the same middle.
  vec2 cumulus(vec2 p, float cover, int steps, int n, float frost) {
    if (cover <= 0.001) return vec2(0.0);
    float lo = 1.0 - cover;
    float d = cloud(p, n);
    float w = mix(0.16, 0.11, uDense);
    float soft = mix(w, 0.36, frost);
    float a = smoothstep(lo + (w - soft) * 0.5, lo + (w + soft) * 0.5, d);
    if (a <= 0.0) return vec2(0.0);
    float depth = 0.0;
    for (int i = 1; i <= steps + uLoop; i++) {
      depth += max(0.0, cloud(p + vec2(0.035, 0.1) * float(i), n) - lo);
    }
    return vec2(a, exp(-depth * 3.2));
  }

  // The hill's ridge, like the classic wallpaper: one big smooth swell, high from the left edge, topping out
  // a little left of centre, then one long slope down to the horizon on the right.
  float ridge(float X) {
    float s = X < 0.3 ? 0.78 : 0.5;
    float a = (X - 0.3) / s;
    return 0.04 + 0.22 * exp(-a * a);
  }
  // Far blue hills, just peeking over the horizon at the right where the slope runs out.
  float ridgeFar(float X) {
    float a = (X - 0.95) / 0.09, b = (X - 0.86) / 0.05;
    return 0.075 + 0.05 * exp(-a * a) + 0.025 * exp(-b * b);
  }

  vec3 skyAt(vec2 uv, int n, float frost) {
    float aspect = uRes.x / uRes.y;
    float night = uNight;

    // Sky: deep at the top, a lighter (still blue) haze toward the horizon.
    vec3 day = mix(uLow, uMid, smoothstep(0.0, 0.55, uv.y));
    day = mix(day, uTop, smoothstep(0.45, 1.0, uv.y));
    vec3 dark = mix(vec3(0.11, 0.16, 0.34), vec3(0.04, 0.07, 0.19), smoothstep(0.0, 0.6, uv.y));
    dark = mix(dark, vec3(0.02, 0.035, 0.11), smoothstep(0.5, 1.0, uv.y));
    vec3 col = mix(day, dark, night);

    // The sun, up in the corner, and the moon's glow at night.
    vec2 q = vec2(uv.x * aspect, uv.y);
    float sun = length(q - vec2(0.84 * aspect, 1.08));
    col += vec3(1.0, 0.97, 0.9) * (exp(-sun * sun * 2.2) * 0.3) * (1.0 - night);
    float moon = length(q - vec2(0.19 * aspect, 0.79));
    col += vec3(0.55, 0.66, 1.0) * exp(-moon * moon * 10.0) * 0.22 * night;

    // Two layers of cloud, wide and puffy, clear near the horizon and building up higher. They rise as
    // you scroll down (parallax) and drift across on their own, the near layer faster. The far layer is
    // smaller, fainter and takes on the sky's blue (air in between).
    // On a tall, narrow (phone) screen the clouds are drawn a little finer, so more than a slice of one
    // crosses it, but they stay big, soft shapes.
    float t = uTime;
    float k = clamp(0.62 / aspect, 1.0, 1.3);
    vec2 far = vec2(q.x * 0.75 + t * 0.005, q.y * 1.25 - uScroll * 0.2) * 2.4 * k;
    vec2 near = vec2(q.x * 0.6 + t * 0.011 + 7.3, q.y - uScroll * 0.5 + 2.1) * 1.35 * k;
    // Behind the tech stack, as much cloud low down as up high (the same amount the top of the sky has).
    // Over the hill at the end, a few more fair-weather clouds up high.
    float end = smoothstep(1.8, 1.0, uFloor / uRes.y);
    vec2 cf = cumulus(far, mix(0.36 * smoothstep(0.14, 0.5, uv.y), 0.36, uDense) + end * 0.03, 1, n, frost);
    vec2 cn = cumulus(near, mix(0.42 * smoothstep(0.24, 0.62, uv.y), 0.42, uDense) + end * 0.06 * smoothstep(0.45, 0.7, uv.y), n < 5 ? 1 : 3, n, frost);
    vec3 belly = vec3(0.6, 0.68, 0.8);
    vec3 sunlit = vec3(1.0, 0.995, 0.98);
    vec3 cloudFar = mix(mix(mix(belly, sunlit, cf.y), col, 0.3), mix(vec3(0.07, 0.11, 0.25), vec3(0.22, 0.28, 0.5), cf.y), night);
    vec3 cloudNear = mix(mix(belly, sunlit, cn.y), mix(vec3(0.05, 0.08, 0.2), vec3(0.3, 0.36, 0.6), cn.y), night);
    col = mix(col, cloudFar, cf.x * mix(0.7, 0.35, night));
    col = mix(col, cloudNear, cn.x * mix(0.96, 0.5, night));

    // At the very end: a low bank of white cumulus sitting on the horizon on the right, behind the hill.
    if (uFloor < uRes.y * 1.8) {
      float hz = (uFloor - 0.09 * uRes.y) / uRes.y - (1.0 - uv.y);
      float band = smoothstep(-0.01, 0.025, hz) * smoothstep(0.2, 0.06, hz);
      vec2 hp = vec2(q.x * 3.2 * k + t * 0.006 + 3.0, hz * 7.0 + 1.3);
      vec2 ch = cumulus(hp, 0.58 * band * smoothstep(0.35, 0.8, uv.x), 1, n, frost);
      vec3 cloudLow = mix(mix(belly, sunlit, 0.4 + 0.6 * ch.y), mix(vec3(0.05, 0.08, 0.2), vec3(0.3, 0.36, 0.6), ch.y), night);
      col = mix(col, cloudLow, ch.x * mix(0.97, 0.45, night));
    }
    return col;
  }

  // ---------- Liquid Glass (the tech stack's capsules) ----------
  // Signed distance to a capsule (negative inside), in px.
  float pill(vec2 px, vec4 g) {
    float a = max(g.z - g.w, 0.0);
    return length(px - vec2(clamp(px.x, g.x - a, g.x + a), g.y)) - g.w;
  }
  // The sky seen through one capsule: frosted, pulled in from just past the rim (the dome's edge bends
  // hardest, the middle hardly at all), lifted milky, with a thin sheen pooling top-left and bottom-right.
  // Where the rim points (outward), at px:
  vec2 glassNormal(vec2 px, vec4 g) {
    float a = max(g.z - g.w, 0.0);
    vec2 dir = px - vec2(clamp(px.x, g.x - a, g.x + a), g.y);
    float len = length(dir);
    return len > 0.001 ? dir / len : vec2(0.0, -1.0);
  }
  // Where on the screen the glass at px looks (uv):
  vec2 glassLook(vec2 px, vec4 g, float d) {
    float inward = clamp(-d / g.w, 0.0, 1.0);
    float bend = 14.0 * pow(1.0 - inward, 3.0);
    vec2 at = px + glassNormal(px, g) * bend;
    return vec2(at.x / uRes.x, 1.0 - at.y / uRes.y);
  }
  // What it shows, given the (frosted) sky it sees there:
  vec3 glassShade(vec3 c, vec2 px, vec4 g, float d) {
    vec2 n = glassNormal(px, g);
    // Sheen: a 2.5px band inside the rim, brightest where the rim faces the light (45deg, up-left).
    float band = pow(clamp(1.0 + d / 2.5, 0.0, 1.0), 1.5);
    float facing = pow(abs(dot(n, vec2(-0.7071, -0.7071))), 4.0);
    c += band * facing * 0.34;
    // The milky veil (lighter by day).
    c = mix(c, vec3(1.0), mix(0.15, 0.04, uNight));
    return c;
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uRes.x / uRes.y;
    float night = uNight;
    float t = uTime;

    // Which capsule (if any) this pixel is in or right at the edge of.
    vec2 px = vec2(uv.x, 1.0 - uv.y) * uRes;
    float gd = 1e5;
    vec4 gc = vec4(0.0);
    float ga = 0.0;
    if (uGlassN > 0 && px.x > uGlassBox.x && px.y > uGlassBox.y && px.x < uGlassBox.z && px.y < uGlassBox.w) {
      for (int i = 0; i < min(uGlassN, ${MAX_GLASS}) + uLoop; i++) {
        float d = pill(px, uGlass[i]);
        if (d < gd) {
          gd = d;
          gc = uGlass[i];
          ga = uGlassA[i];
        }
      }
    }
    // Anti-aliased over about a pixel at the rim; inside, only the glass is drawn. The plain sky and the sky
    // through the glass come from one call in a two-step loop: one copy of the sky in the compiled shader.
    float cover = gd < 1.0 ? clamp(0.5 - gd, 0.0, 1.0) * ga : 0.0;
    vec3 col = vec3(0.0);
    vec3 glass = vec3(0.0);
    for (int k = 0; k < 2 + uLoop; k++) {
      bool thru = k == 1;
      if (thru ? cover <= 0.0 : cover >= 1.0) continue;
      #ifdef PHONE
        int n = thru ? 3 : 4;
        float frost = thru ? 1.0 : 0.1;
      #else
        int n = thru ? 3 : 5;
        float frost = thru ? 1.0 : 0.0;
      #endif
      vec3 c = skyAt(thru ? glassLook(px, gc, gd) : uv, n, frost);
      if (thru) glass = c;
      else col = c;
    }
    if (cover > 0.0) col = mix(col, glassShade(glass, px, gc, gd), cover);

    // The hill the page ends on. It rises with the last screen (its foot is the floor the footer sits on).
    float y = (1.0 - uv.y) * uRes.y;
    float x = uv.x * uRes.x;
    float H = uRes.y;
    // The hill's size goes by the screen's width (capped by its height), so on a tall, narrow phone it's
    // the same gentle swell as on a wide screen rather than a mountain up to the middle of it.
    float U = min(H, uRes.x * 0.8);
    float X = uv.x;
    if (uFloor < H * 1.8) {
      // (Just a breath of unevenness along the crest: it's a smooth, rolling hill.)
      float wob = (fbm(vec2(X * 4.0, 3.0)) - 0.5) * U * 0.004;
      float farTop = uFloor - ridgeFar(X) * U + (fbm(vec2(X * 22.0, 7.0)) - 0.5) * U * 0.012;
      float nearTop = uFloor - ridge(X) * U + wob;

      // The far hills: blue-violet in the haze.
      float farA = smoothstep(farTop - 1.2, farTop + 1.2, y);
      if (farA > 0.0) {
        float fd = clamp((y - farTop) / (U * 0.05), 0.0, 1.0);
        vec3 farDay = mix(mix(vec3(0.46, 0.52, 0.72), vec3(0.36, 0.44, 0.62), fd), uLow, 0.35);
        vec3 farNight = mix(vec3(0.05, 0.08, 0.16), vec3(0.03, 0.06, 0.12), fd);
        col = mix(col, mix(farDay, farNight, night), farA);
      }

      // The hill: vivid yellow-green on the crest, deepening down the slope, big cloud shadows sweeping
      // over it.
      float nearA = smoothstep(nearTop - 1.2, nearTop + 1.2, y);
      if (nearA > 0.0) {
        float d = (y - nearTop) / U;
        float slope = (ridge(X - 0.01) - ridge(X + 0.01)) * 50.0;
        float lit = clamp(0.55 + slope * 1.8, 0.0, 1.0);
        // Ground coordinates: wide across, squeezed toward the crest (it's farther away up there).
        vec2 g = vec2(X * aspect * 7.0, log(1.0 + d * 30.0) * 5.0);
        float patches = fbm(g * 0.6 + 2.0);
        // Grass blades: tied to the hill (they scroll with it, not stuck on the screen), and coarse enough
        // that they never shimmer into a grain like dust on the glass.
        float yh = y - uFloor;
        float blades = noise(vec2(x * 0.42, yh * 0.085)) * 0.55 + noise(vec2(x * 0.16, yh * 0.032)) * 0.45;
        // Wind: a faint breeze across the grass. Cloud shadows: big, soft, darker sweeps drifting over it.
        float wind = sin(g.x * 1.3 - g.y * 0.9 - t * 1.4 + patches * 5.0) * 0.5 + 0.5;
        float shade = smoothstep(0.46, 0.7, fbm(vec2(g.x * 0.11 + t * 0.02, g.y * 0.28)));

        vec3 grass = mix(vec3(0.5, 0.77, 0.12), vec3(0.33, 0.61, 0.08), smoothstep(0.0, 0.14, d));
        grass = mix(grass, vec3(0.16, 0.41, 0.05), smoothstep(0.12, 0.5, d));
        grass *= 0.8 + lit * 0.3;
        grass *= 0.9 + patches * 0.2;
        grass *= 0.94 + blades * 0.09;
        grass += vec3(0.03, 0.035, 0.0) * wind * (1.0 - smoothstep(0.0, 0.3, d));
        grass *= 1.0 - shade * 0.34;
        // A touch of light along the crest, and air between us and the far part of the hill.
        grass += vec3(0.07, 0.08, 0.02) * exp(-d * 260.0) * lit;
        grass = mix(grass, uLow, exp(-d * 40.0) * 0.12);

        vec3 moonlit = mix(vec3(0.06, 0.15, 0.15), vec3(0.015, 0.05, 0.06), smoothstep(0.0, 0.35, d));
        moonlit *= 0.85 + patches * 0.3 + blades * 0.08;
        moonlit += vec3(0.04, 0.09, 0.08) * wind * (1.0 - smoothstep(0.0, 0.3, d));
        moonlit += vec3(0.1, 0.24, 0.26) * exp(-d * 220.0);

        col = mix(col, mix(grass, moonlit, night), nearA);
      }
    }

    // Written as sRGB; the renderer expects linear light.
    gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(2.2)), 1.0);
    #include <colorspace_fragment>
  }
`;
