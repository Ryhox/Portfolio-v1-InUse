// How far above the bottom of the contact section the floor is (the foot of the hill the page ends on; the
// footer sits on the grass below it). On phones the footer stacks into more lines.
export const floorLift = (vw: number) => (vw < 900 ? 112 : 64);

// Shared, mutable scroll state read inside the render loop (no React re-renders).
export const scroll = {
  y: 0,
  velocity: 0,
  vh: 1,
  // Document-space tops (px) of [data-section="name"] elements (the sky's colours change by section).
  anchors: {} as Record<string, number>,
  // Document-space y (px) of the floor the page ends on (the foot of the hill, see Backdrop).
  floor: Infinity,
};

// How thick the clouds are behind the tech stack, 0..1 (set by the scroll in Motion.tsx, eased in Backdrop.tsx),
// so its Liquid Glass always has cloud edges sliding under it to bend.
// `glass`: the tech stack's capsules, whose Liquid Glass the sky draws under them (Stack.tsx registers them),
// `glassNear`: whether the tech stack is within a screen or so (only then does the sky look for them).
// `glassMoved`: the capsules' layout may have changed (they came near, or the stack resized): measure again.
export const sky = { dense: 0, glass: [] as HTMLElement[], glassNear: false, glassMoved: true };

export function measureSections() {
  const els = Array.from(document.querySelectorAll<HTMLElement>("[data-section]"));
  scroll.anchors = {};
  for (const el of els) {
    scroll.anchors[el.dataset.section!] = el.getBoundingClientRect().top + window.scrollY;
  }
  scroll.vh = window.innerHeight;
  const contact = document.querySelector<HTMLElement>(".contact");
  scroll.floor = contact ? contact.getBoundingClientRect().bottom + window.scrollY - floorLift(window.innerWidth) : Infinity;
}
