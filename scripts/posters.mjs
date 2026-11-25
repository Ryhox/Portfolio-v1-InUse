// Smaller copies of the project posters (public/work/*.webp) for small screens, plus src/posters.json with each
// poster's aspect ratio and the widths made, so the page can pick the smallest copy that still fills its box
// (Motion.tsx). Run after changing a poster: npm run posters
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const DIR = "public/work";
const WIDTHS = [640, 800, 960, 1280];
const out = {};
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".webp") && !/-\d+\.webp$/.test(f)).sort()) {
  const src = path.join(DIR, file);
  const { width, height } = await sharp(src).metadata();
  const sizes = [];
  for (const w of WIDTHS.filter((w) => w < width * 0.9)) {
    await sharp(src).resize({ width: w }).webp({ quality: 74, effort: 6 }).toFile(path.join(DIR, file.replace(/\.webp$/, `-${w}.webp`)));
    sizes.push(w);
  }
  out[`/work/${file}`] = { ar: +(width / height).toFixed(4), sizes };
  console.log(file, `${width}x${height}`, sizes.join(","));
}
fs.writeFileSync("src/posters.json", JSON.stringify(out, null, 2) + "\n");
