import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strict Mode's dev-only test unmount makes the Liquid Glass library (@samasante/liquid-glass) throw its
  // WebGL context away, and the remount then gets a dead one ("WebGL renderer unavailable"). Production never
  // does that double mount, so this only keeps dev honest to what ships.
  reactStrictMode: false,
  turbopack: {
    resolveAlias: {
      // (14 KB of polyfills for features all supported browsers have: src/lib/no-polyfills.js)
      "next/dist/build/polyfills/polyfill-module": "./src/lib/no-polyfills.js",
      "../build/polyfills/polyfill-module": "./src/lib/no-polyfills.js",
    },
  },
};

export default nextConfig;
