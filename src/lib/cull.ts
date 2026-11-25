/** While the page scrolls, what's well off screen isn't drawn at all (visibility: hidden: still laid out exactly
 *  where it is, so nothing moves or re-measures). The browser otherwise keeps painting and re-layering
 *  everything within a few screens of the window, every frame: on a slow PC that was a third of each frame.
 *  (Not opacity 0 or a clip-path: the browser still composites all that's inside, and both came out slower.)
 *
 *  Hidden things can't be focused, read out by a screen reader or found with find in page, so this only runs
 *  once the page is used with a mouse or trackpad (from its first move, when nothing is scrolling yet). The
 *  moment a key is pressed (Tab, Ctrl+F, the arrows, a screen reader's keys) or the keyboard goes elsewhere
 *  (the find bar), everything is drawn again and stays so until the mouse is used again. (Not on a timer once
 *  the scrolling stops: drawing it all back in one go was a stall, every time.) While scrolling, hiding is
 *  one piece per frame (a whole section switching re-styles all that's inside it); what comes near is shown
 *  at once. */
export class Cull {
  private els: HTMLElement[] = [];
  private off: boolean[] = [];
  private test: ((i: number) => boolean) | null = null;

  constructor() {
    listen();
    all.add(this);
  }

  set(els: HTMLElement[]) {
    this.show();
    this.els = els;
    this.off = els.map(() => false);
  }

  /** isOff(i): element i is far enough off screen to skip. */
  update(isOff: (i: number) => boolean, all = false) {
    this.test = isOff;
    if (!enabled) return;
    let hid = false;
    for (let i = 0; i < this.els.length; i++) {
      const o = isOff(i);
      if (o === this.off[i] || (o && hid && !all)) continue;
      if (o) hid = true;
      this.set1(i, o);
    }
  }

  /** Once it's allowed to: everything far away hidden in one go (nothing is scrolling yet then). */
  start() {
    if (this.test) this.update(this.test, true);
  }

  isOff(el: HTMLElement) {
    const i = this.els.indexOf(el);
    return i >= 0 && this.off[i];
  }

  /** Everything drawn again. */
  show() {
    this.off.forEach((o, i) => o && this.set1(i, false));
  }

  /** Done with it (everything drawn again). */
  dispose() {
    this.show();
    all.delete(this);
  }

  private set1(i: number, off: boolean) {
    this.off[i] = off;
    this.els[i].style.visibility = off ? "hidden" : "";
  }
}

const all = new Set<Cull>();
let enabled = false;
let listening = false;
function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  // (Not on touch screens: a finger's fling scrolls natively, ahead of the script, and could show a block
  // before it's drawn again.)
  if (window.matchMedia("(pointer: coarse)").matches) return;
  const on = () => {
    if (enabled || !document.hasFocus()) return;
    enabled = true;
    all.forEach((c) => c.start());
  };
  const off = () => {
    if (!enabled) return;
    enabled = false;
    all.forEach((c) => c.show());
  };
  window.addEventListener("wheel", on, { passive: true, capture: true });
  window.addEventListener("pointermove", (e) => e.pointerType !== "touch" && on(), { passive: true, capture: true });
  // (a key on its own like Shift for sideways scrolling or Ctrl for zoom doesn't count)
  window.addEventListener("keydown", (e) => !["Shift", "Control", "Alt", "Meta"].includes(e.key) && off(), { capture: true });
  // (the find bar or another window taking the keyboard)
  window.addEventListener("blur", off);
}
