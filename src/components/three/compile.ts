import type { Camera, Object3D, WebGLRenderer } from "three";

// Getting a 3D layer's shaders ready without freezing the page (used on the page and in the workers).

/** Compile every shader in the scene in the background (KHR_parallel_shader_compile). Never waits longer than
 *  `ms`: compileAsync can hang for good (a lost GPU context, a driver that never reports the program done). */
export async function compileInBackground(renderer: WebGLRenderer, scene: Object3D, camera: Camera, ms = 5000) {
  let t: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.resolve().then(() => renderer.compileAsync(scene, camera)),
    new Promise((done) => (t = setTimeout(done, ms))),
  ]).catch(() => undefined);
  clearTimeout(t);
}

/** Draw the scene once with everything shown and nothing culled: ANGLE on D3D11 finishes part of the work
 *  (a skinned model's vertex layout, some pixel shaders) only at the first real draw. Done while the loader
 *  is up, that moment can't be seen. */
export function drawOnce(renderer: WebGLRenderer, scene: Object3D, camera: Camera) {
  const saved: [Object3D, boolean, boolean][] = [];
  scene.traverse((o) => {
    saved.push([o, o.visible, o.frustumCulled]);
    o.visible = true;
    o.frustumCulled = false;
  });
  try {
    renderer.render(scene, camera);
  } catch {
    // (a frame that can't be drawn: it'll compile on its first real frame instead)
  }
  for (const [o, v, f] of saved) {
    o.visible = v;
    o.frustumCulled = f;
  }
}
