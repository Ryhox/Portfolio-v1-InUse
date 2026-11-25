// The loader's first frame as still pictures (public/loader/still-*.webp): the clouds exactly as the live shader
// (LoaderClouds.tsx) draws them before they part, so the very first paint is already the clouds, and so is the
// loader without a graphics card (Experience.tsx). Drawn by that same shader, in Chrome (its headless screenshot,
// on a transparent page), wide and tall, by day and by night.
// Run after changing the clouds: npm run loader-still   (needs puppeteer-core: installed, or PUPPETEER=path to
// its entry file; CHROME=path/to/chrome if it isn't in the usual place)
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const CHROME =
  process.env.CHROME ||
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));
if (!CHROME) throw new Error("Chrome not found: set CHROME");

const src = fs.readFileSync("src/components/LoaderClouds.tsx", "utf8");
const grab = (name) => src.match(new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`))[1];
const vertex = grab("vertex");
const fragment = grab("fragment");

// wide: any screen from about square to ultra-wide (shown height-fit, centred); tall: phones (billows finer, as
// fineFor gives a tall screen), wide enough for an upright tablet.
const SHOTS = [
  { name: "wide", w: 2400, h: 930, fine: 1 },
  { name: "tall", w: 1100, h: 1222, fine: 1.25 },
];
const OUT = "public/loader";
fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loader-still-"));
const { default: puppeteer } = await import(process.env.PUPPETEER ? pathToFileURL(process.env.PUPPETEER).href : "puppeteer-core");
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--enable-gpu", "--ignore-gpu-blocklist"] });

for (const shot of SHOTS) {
  for (const [theme, night] of [
    ["day", 0],
    ["night", 1],
  ]) {
    const html = `<!doctype html><html><body style="margin:0;background:transparent"><canvas id="c" width="${shot.w}" height="${shot.h}"></canvas><script>
      const gl = document.getElementById("c").getContext("webgl", { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true });
      const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); return x; };
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, ${JSON.stringify(vertex)}));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, ${JSON.stringify(fragment)}));
      gl.linkProgram(p); gl.useProgram(p);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const l = gl.getAttribLocation(p, "p"); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
      const u = (n) => gl.getUniformLocation(p, n);
      gl.uniform2f(u("uRes"), ${shot.w}, ${shot.h});
      gl.uniform1f(u("uTime"), 0); gl.uniform1f(u("uOpen"), 0); gl.uniform1f(u("uBurst"), 0);
      gl.uniform1f(u("uNight"), ${night}); gl.uniform1f(u("uPhone"), 0); gl.uniform1f(u("uFine"), ${shot.fine});
      gl.viewport(0, 0, ${shot.w}, ${shot.h});
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    </script></body></html>`;
    const page = path.join(tmp, `${shot.name}-${theme}.html`);
    const png = path.join(tmp, `${shot.name}-${theme}.png`);
    fs.writeFileSync(page, html);
    const tab = await browser.newPage();
    await tab.setViewport({ width: shot.w, height: shot.h, deviceScaleFactor: 1 });
    await tab.goto(pathToFileURL(page).href);
    await tab.screenshot({ path: png, omitBackground: true });
    await tab.close();
    const file = `${OUT}/still-${shot.name}-${theme}.webp`;
    await sharp(png).webp({ quality: 74, alphaQuality: 80, effort: 6 }).toFile(file);
    console.log(file, fs.statSync(file).size);
  }
}
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
