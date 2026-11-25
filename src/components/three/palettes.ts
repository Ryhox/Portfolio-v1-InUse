// The sky's colours (Backdrop.tsx, and its still pictures in sky.worker.ts): top / middle / low per section,
// a clear blue day, a little brighter every section down. Plain numbers, so the still pictures can be asked
// for without loading three.js on the page.

export type Rgb = [number, number, number];

const rgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const pal = (a: string, b: string, c: string): Rgb[] => [rgb(a), rgb(b), rgb(c)];

export const PALETTES: Record<string, Rgb[]> = {
  hero: pal("#2f7fe2", "#5ea8ef", "#a4d2f7"),
  intro: pal("#2f7fe2", "#5ea8ef", "#a4d2f7"),
  work: pal("#3587e5", "#66aff1", "#acd7f8"),
  // The end: the deep, saturated blue of the classic wallpaper, still light at the horizon.
  contact: pal("#1c57d2", "#3b80e6", "#79b2f1"),
};
