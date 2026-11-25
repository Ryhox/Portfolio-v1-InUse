import type { CSSProperties } from "react";
import { hasDemo, type ProjectLinks } from "@/links";

// "Live demo" + "Source code" for a project (behaviour in ActionFx.tsx). A flat fill floods in from
// the exact point the pointer enters and drains out where it leaves; the label is drawn twice so it
// changes colour precisely at the edge of the fill.

// (Each letter becomes its own rolling piece in the browser, lib/letters.ts: the HTML only carries the word.)
function Roll({ text }: { text: string }) {
  return (
    <span className="act-text" data-letters="roll">
      {text}
    </span>
  );
}

function Arrow() {
  return (
    <span className="act-arrow">
      {[0, 1].map((k) => (
        <svg key={k} viewBox="0 0 24 24" aria-hidden>
          <path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ))}
    </span>
  );
}

function Brackets() {
  return (
    <span className="act-code" aria-hidden>
      <span className="act-code-l">&lt;</span>
      <span className="act-code-s">/</span>
      <span className="act-code-r">&gt;</span>
    </span>
  );
}

function Row({ label, code, arrow = true, wet }: { label: string; code?: boolean; arrow?: boolean; wet?: boolean }) {
  return (
    <span className={wet ? "act-row act-wet" : "act-row"} aria-hidden>
      {code ? <Brackets /> : null}
      <Roll text={label} />
      {arrow ? <Arrow /> : null}
    </span>
  );
}

// A browser toolbar that drops in over the picture and types the address: the live site, or the repo.
function Browser({ url, kind }: { url: string; kind: "demo" | "code" }) {
  return (
    <span className={`mfx-browser mfx-browser--${kind}`} aria-hidden>
      <span className="mfx-bar">
        <i />
        <i />
        <i />
        {/* --n: how many letters, so the caret starts blinking once they're all typed. */}
        <span className="mfx-url" style={{ "--n": url.length } as CSSProperties}>
          <svg viewBox="0 0 16 16" aria-hidden>
            <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2M3.5 7h9v6.5h-9z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          {/* (typed letter by letter: each letter becomes its own element in the browser, lib/letters.ts) */}
          <span className="mfx-type" data-letters="type">
            {url}
          </span>
          <span className="mfx-caret" />
        </span>
      </span>
      <span className="mfx-load" />
    </span>
  );
}

// What the buttons do to the project picture: "Live demo" turns it into a browser window loading the
// real URL; "Source code" decodes a few real lines of the project's code out of scrambled characters
// (canvas, see ActionFx) under a browser bar typing the repo's address on GitHub; no demo gets stamped.
export function MediaFx({ links, code }: { links: ProjectLinks; code: { file: string; lines: string[] } }) {
  const host = links.demo ? links.demo.replace(/^https?:\/\//, "").replace(/\/$/, "") : "";
  const repo = links.source.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <>
      {host ? (
        <Browser url={host} kind="demo" />
      ) : (
        <span className="mfx-stamp" aria-hidden>
          <span>No live demo</span>
          {links.elsewhere ? <small>{links.elsewhere.note}</small> : null}
        </span>
      )}
      <canvas className="mfx-code" aria-hidden data-file={code.file} data-code={code.lines.join("\n")} />
      <Browser url={repo} kind="code" />
    </>
  );
}

export default function ProjectActions({ title, links }: { title: string; links: ProjectLinks }) {
  const demo = hasDemo(links);
  return (
    <div className="panel-actions">
      {demo ? (
        <a className="act act--solid" href={links.demo} target="_blank" rel="noreferrer" data-act>
          <span className="sr-only">{`Live demo of ${title} (opens in a new tab)`}</span>
          <span className="act-fill" aria-hidden />
          <Row label="Live demo" />
          <Row label="Live demo" wet />
        </a>
      ) : (
        <span className="act act--none" tabIndex={0} role="note" aria-label={`${title} has no live demo.${links.elsewhere ? ` ${links.elsewhere.note}.` : ""}`}>
          <Row label="No live demo" arrow={false} />
        </span>
      )}
      <a className="act act--line" href={links.source} target="_blank" rel="noreferrer" data-act>
        <span className="sr-only">{`Source code of ${title} on GitHub (opens in a new tab)`}</span>
        <span className="act-fill" aria-hidden />
        <Row label="Source code" code />
        <Row label="Source code" code wet />
      </a>
      {!demo && links.elsewhere ? (
        <p className="act-note">
          {links.elsewhere.note}:{" "}
          <a href={links.elsewhere.href} target="_blank" rel="noreferrer">
            {links.elsewhere.label}
          </a>
        </p>
      ) : null}
    </div>
  );
}
