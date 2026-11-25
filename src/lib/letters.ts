// Per-letter markup for two effects on the project panels (ProjectActions.tsx): the labels of the buttons roll
// letter by letter on hover, and the browser bars type their address one letter at a time. That's 1100 or so
// little elements, about half of the whole page, and sent in the HTML they all had to be parsed, styled, laid
// out and hydrated while the page loaded. So the HTML carries the plain words and the letters are built here,
// once the page is in (Motion.tsx), a few words at a time whenever the browser is idle: nothing needs them
// before a project is pointed at, and built during the setup they doubled what it had to measure.

const span = (text: string) => {
  const s = document.createElement("span");
  s.textContent = text;
  return s;
};

function build(el: HTMLElement) {
  const roll = el.dataset.letters === "roll";
  const frag = document.createDocumentFragment();
  Array.from(el.textContent ?? "").forEach((c, i) => {
    let s: HTMLSpanElement;
    if (roll) {
      // (two copies stacked, for the roll; spaces kept as no-break spaces so they keep their width)
      const ch = c === " " ? " " : c;
      s = document.createElement("span");
      s.className = "act-ch";
      s.append(span(ch), span(ch));
    } else s = span(c);
    s.style.setProperty("--i", String(i));
    frag.append(s);
  });
  el.replaceChildren(frag);
  delete el.dataset.letters;
}

/** Builds them a few words at a time, whenever the browser is idle. Returns a cancel. */
export function buildLettersSoon() {
  const todo = Array.from(document.querySelectorAll<HTMLElement>("[data-letters]"));
  // (Safari has no idle callback: a short timeout there)
  const hasIdle = typeof window.requestIdleCallback === "function";
  const idle = (cb: () => void) => (hasIdle ? window.requestIdleCallback(cb, { timeout: 1500 }) : window.setTimeout(cb, 60));
  const unidle = (id: number) => (hasIdle ? window.cancelIdleCallback(id) : window.clearTimeout(id));
  let id = 0;
  const next = () => {
    todo.splice(0, 4).forEach(build);
    if (todo.length) id = idle(next);
  };
  id = idle(next);
  return () => unidle(id);
}
