"use client";

import { useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { scroll, sky } from "@/lib/scroll";
import { lenis } from "./SmoothScroll";
import { cloudPass } from "./CloudPass";
import { softwareGL } from "@/lib/gpu";
import { Cull } from "@/lib/cull";
import { buildLettersSoon } from "@/lib/letters";

gsap.registerPlugin(ScrollTrigger);

// All scroll choreography for the DOM layer. Runs once `ready` flips (after the preloader).
// `onStep`: how far the setup is (steps done, of how many), for the loader (Experience.tsx).
export default function Motion({ ready, onReady, onStep }: { ready: boolean; onReady?: () => void; onStep?: (done: number, total: number) => void }) {
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    let dead = false;
    // Set up in steps, one task each, with a breath for the browser in between: all at once it held the page
    // for half a second in one go while it loaded (slow phones felt it, and it was the longest task the page
    // had). Everything is still made inside the one GSAP context, so it is all undone together.
    const ctx = gsap.context(() => {});
    let steps = 0;
    const next = () => {
      onStep?.(Math.min(++steps, 32), 32);
      return new Promise<void>((r) => window.setTimeout(r, 0));
    };
    const aboutOffs: (() => void)[] = [];
    let watchVideos = () => {};
    let mm!: gsap.MatchMedia;
    let gallery: gsap.core.Tween | null = null;
    // The gallery's cards: where one sits on the screen now (left edge, width), from what the slide measured.
    let galleryAt: ((el: HTMLElement) => { left: number; width: number } | null) | null = null;
    let gallerySync: (() => void) | null = null;
    let cancelLetters = () => {};
    const run = async () => {
      // The clips get their posters first (page.tsx: not fetched with the page).
      await next();
      if (dead) return;
      for (const v of document.querySelectorAll<HTMLVideoElement>("video[data-poster]")) {
        v.poster = v.dataset.poster!;
        delete v.dataset.poster;
      }
      await next();
      if (dead) return;
      ctx.add(() => {
        mm = gsap.matchMedia();

        // ---------- Project videos: load + play only near the viewport, pause off-screen ----------
        // The AV1 cut where the device decodes it in hardware, the H.264 clip everywhere else. (A browser that
        // can only decode AV1 in software still says it can play it, and then a laptop without AV1 hardware
        // spends its CPU decoding video while you scroll the gallery.)
        const AV1 = 'video/mp4; codecs="av01.0.05M.08"';
        let av1 = false;
        if (document.createElement("video").canPlayType(AV1) !== "") {
          navigator.mediaCapabilities
            ?.decodingInfo({ type: "file", video: { contentType: AV1, width: 1280, height: 800, bitrate: 2_000_000, framerate: 30 } })
            .then((r) => (av1 = r.supported && r.powerEfficient))
            .catch(() => undefined);
        }
        const clipOf = (v: HTMLVideoElement) => (av1 && v.dataset.av1) || v.dataset.src || "";
        const videos = gsap.utils.toArray<HTMLVideoElement>(".panel-img");
        // Starting a clip (spinning up its decoder) is a hitch, so they start one at a time, as they come on
        // screen, and pause as soon as they're off it.
        const queue: HTMLVideoElement[] = [];
        let starting = 0;
        const startNext = () => {
          starting = 0;
          const v = queue.shift();
          if (!v) return;
          if (!v.src && v.dataset.src) v.src = clipOf(v);
          v.play().catch(() => undefined);
          if (queue.length) starting = window.setTimeout(startNext, 180);
        };
        const io = new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              const v = e.target as HTMLVideoElement;
              if (e.isIntersecting) {
                if (v.paused && !queue.includes(v)) queue.push(v);
              } else {
                const i = queue.indexOf(v);
                if (i >= 0) queue.splice(i, 1);
                if (!v.paused) v.pause();
              }
            }
            if (queue.length && !starting) starting = window.setTimeout(startNext, 0);
          },
          // Only the clips on screen play; the rest wait, paused (decoding several at once is too much for a
          // modest laptop, and the gallery stuttered). Each starts just before it comes in (its poster isn't
          // quite its first frame, and the switch shouldn't be seen), so it's never more than one or two.
          { rootMargin: "15%" },
        );
        // (Without a graphics card the clips don't play: each project shows its poster, still. Every video frame
        // drawn and blended in software made the gallery stutter, gpu.ts.)
        // (watched from the end of the warm-up behind the loader: it passes every clip, and each would start)
        watchVideos = () => {
          if (!softwareGL()) videos.forEach((v) => io.observe(v));
        };
        // Quietly buffer every clip in the background shortly after the intro, so they are instant later
        // (desktop only: on phones / data saver they load just before they scroll into view).
        const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
        const coarse = window.matchMedia("(pointer: coarse)").matches;
        const buffer = window.setTimeout(() => {
          if (saveData || coarse || softwareGL()) return;
          videos.forEach((v) => {
            if (!v.src && v.dataset.src) {
              v.preload = "auto";
              v.src = clipOf(v);
            }
          });
        }, 6000);
        return () => {
          io.disconnect();
          window.clearTimeout(buffer);
          window.clearTimeout(starting);
        };
      });
      await next();
      if (dead) return;
      // (From here on the setup is cut as finely as it goes: one step per quote, per row, per stroke, so no part of
      // it holds the page for long.)
      // ---------- Statement: words light up as you read ----------
      // (Opacity and a small rise only: a live blur on every word had the GPU redraw each one every frame.)
      // Words not read yet are dimmed only as far as they stay readable (3:1 against the sky, the minimum for
      // text this big): the dark ink on the day sky needs more of it than the light ink at night.
      const dim = () => (document.documentElement.dataset.theme === "dark" ? 0.4 : 0.66);
      ctx.add(() => {
        gsap.set(".statement .w", { opacity: dim, y: "0.12em" });
      });
      // (the words dimmed in one step, their trigger made in the next: the first trigger of the setup is the
      // heaviest one)
      await next();
      if (dead) return;
      ctx.add(() => {
        const words = gsap.fromTo(
          ".statement .w",
          { opacity: dim, y: "0.12em" },
          {
            opacity: 1,
            y: 0,
            ease: "none",
            stagger: 0.12,
            immediateRender: false,
            scrollTrigger: { trigger: ".statement", start: "top 82%", end: "bottom 42%", scrub: true, invalidateOnRefresh: true },
          },
        );
        // (the other theme: the dim words take its level)
        const redim = () => {
          const p = words.progress();
          words.invalidate().progress(p);
        };
        window.addEventListener("themechange", redim);
        aboutOffs.push(() => window.removeEventListener("themechange", redim));
      });
      // Highlighter strokes draw in word by word, just after the words light up.
      for (const el of gsap.utils.toArray<HTMLElement>(".statement .mark")) {
        await next();
        if (dead) return;
        ctx.add(() => {
          gsap.fromTo(el, { "--mark": 0 }, { "--mark": 1, ease: "none", scrollTrigger: { trigger: el, start: "top 72%", end: "top 52%", scrub: true } });
        });
      }

      // ---------- Quotes: the lines slide in from alternating sides ----------
      // The first line comes in from the left, the next from the right, and so on, each leaning into its
      // travel and straightening as it lands; one after another as the scroll brings the quote up. (Whole
      // lines, moved as their words: a handful of pieces. Letters tumbling in 3D, one by one, was the most
      // expensive thing on the page.)
      // Which line a word of a quote is on (they wrap with the screen). Words on one line can sit a pixel apart
      // (punctuation, the quote marks), so a line is everything within half a word's height of where it starts;
      // matching exact pixels sent the odd word in from the wrong side.
      const lineIn = (words: HTMLElement[], el: HTMLElement) => {
        const h = el.offsetHeight * 0.5;
        const starts: number[] = [];
        for (const t of words.map((w) => w.offsetTop).sort((a, b) => a - b)) if (!starts.length || t - starts[starts.length - 1] > h) starts.push(t);
        let i = 0;
        while (i + 1 < starts.length && el.offsetTop >= starts[i + 1] - h) i++;
        return i;
      };
      for (const q of gsap.utils.toArray<HTMLElement>(".quote")) {
        await next();
        if (dead) return;
        ctx.add(() => {
          const words = gsap.utils.toArray<HTMLElement>(q.querySelectorAll(".qw"));
          const lineOf = (el: HTMLElement) => lineIn(words, el);
          const side = (el: HTMLElement) => (lineOf(el) % 2 ? 1 : -1);
          // (from the moment the text itself comes in at the bottom until it's just above the middle: all of the
          // motion is on screen)
          const tl = gsap.timeline({
            scrollTrigger: { trigger: q.querySelector(".quote-text"), start: "top 98%", end: "bottom 62%", scrub: 0.6, invalidateOnRefresh: true },
          });
          // One tween per word, placed by its line, each hidden at its start right away (immediateRender). (One
          // staggered tween left the later lines sitting there, already written, until their turn came; then they
          // jumped out to the side and slid back in.)
          words.forEach((w) => {
            tl.fromTo(
              w,
              {
                x: () => side(w) * Math.min(window.innerWidth * 0.45, 640),
                // (leaning forward, into the way it's going)
                skewX: () => side(w) * 12,
                opacity: 0,
              },
              { x: 0, skewX: 0, opacity: 1, ease: "power2.out", duration: 1, immediateRender: true },
              lineOf(w) * 0.22,
            );
          });
        });
        await next();
        if (dead) return;
        ctx.add(() => {
          gsap.from(q.querySelectorAll(".quote-by > *"), {
            y: 20,
            opacity: 0,
            stagger: 0.1,
            duration: 1,
            ease: "expo.out",
            scrollTrigger: { trigger: q, start: "center 62%", toggleActions: "play none none reverse" },
          });
        });
      }

      // ---------- What I do: rows of Liquid Glass capsules (Stack.tsx), scrubbed like pokyhlabs ----------
      // Everything here follows the scroll both ways: the heading's letters rise out of their masks, each row's
      // rule draws across, its title rises, its words come up, and its capsules drop in one after another like
      // drops of glass landing (silently).
      const reducedAll = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const coarseAll = window.matchMedia("(pointer: coarse)").matches;
      if (!reducedAll) {
        await next();
        if (dead) return;
        ctx.add(() => {
          gsap
            .timeline({ scrollTrigger: { trigger: ".skills-heading", start: "top 96%", end: "top 52%", scrub: 1 } })
            .fromTo(".skills-heading .char", { yPercent: 150, rotate: 10 }, { yPercent: 0, rotate: 0, stagger: 0.035, duration: 0.9, ease: "expo.out" });
        });
        for (const row of gsap.utils.toArray<HTMLElement>(".st-row")) {
          await next();
          if (dead) return;
          ctx.add(() => {
            const caps = row.querySelectorAll<HTMLElement>(".cap");
            const tl = gsap.timeline({
              scrollTrigger: {
                trigger: row,
                start: "top 94%",
                end: "top 46%",
                // With a finger the page moves natively, so any catch-up reads as the capsules floating behind
                // it: there they follow the scroll exactly.
                scrub: coarseAll ? true : 0.9,
              },
            });
            tl.fromTo(row.querySelector(".st-rule"), { scaleX: 0 }, { scaleX: 1, duration: 1, ease: "power2.inOut" }, 0)
              .fromTo(row.querySelectorAll(".st-title .char"), { yPercent: 150 }, { yPercent: 0, stagger: 0.03, duration: 0.7, ease: "expo.out" }, 0.12)
              .fromTo(row.querySelectorAll(".st-line, .ab-proof"), { y: 26, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.08, duration: 0.6, ease: "power3.out" }, 0.28)
              // Drops of glass: one after another each fades in, rises into place and settles to full size, the
              // glass under it with it (Backdrop.tsx). Upright the whole way; continuous, so it stays smooth
              // however fast you scroll.
              .fromTo(
                caps,
                { autoAlpha: 0, y: 30, scale: 0.9 },
                { autoAlpha: 1, y: 0, scale: 1, stagger: 0.09, duration: 0.6, ease: "power3.out" },
                0.38,
              );
          });
        }
      }
      await next();
      if (dead) return;
      ctx.add(() => {
        const end = document.querySelector(".st-end .st-rule");
        if (end && !reducedAll) gsap.fromTo(end, { scaleX: 0 }, { scaleX: 1, ease: "power2.inOut", scrollTrigger: { trigger: end, start: "top 96%", end: "top 70%", scrub: 0.9 } });

        // The clouds thicken behind the tech stack while it's on screen (Backdrop.tsx), for its glass to bend.
        ScrollTrigger.create({
          trigger: ".skills",
          start: "top 85%",
          end: "bottom 15%",
          onUpdate: (self) => {
            const p = self.progress;
            sky.dense = Math.max(0, Math.min(1, p / 0.12, (1 - p) / 0.12));
          },
          onLeave: () => (sky.dense = 0),
          onLeaveBack: () => (sky.dense = 0),
        });

        // "Seen in" links fly to the project, wherever it sits in the (sideways) gallery.
        const gotoProject = (e: Event) => {
          const a = e.currentTarget as HTMLAnchorElement;
          const panel = document.getElementById(`project-${a.dataset.goto}`);
          if (!panel || !lenis) return;
          e.preventDefault();
          e.stopPropagation();
          const workPin = ScrollTrigger.getAll().find((st) => st.pin === document.querySelector(".work"));
          const track = document.querySelector<HTMLElement>(".work-track");
          if (workPin && track) {
            const distance = track.scrollWidth - window.innerWidth;
            const center = panel.offsetLeft + panel.offsetWidth / 2 - window.innerWidth / 2;
            lenis.scrollTo(workPin.start + Math.min(1, Math.max(0, center / distance)) * (workPin.end - workPin.start), { duration: 2 });
          } else lenis.scrollTo(panel.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.14, { duration: 1.8 });
        };
        const gotoLinks = gsap.utils.toArray<HTMLAnchorElement>("[data-goto]");
        gotoLinks.forEach((a) => a.addEventListener("click", gotoProject));
        aboutOffs.push(() => gotoLinks.forEach((a) => a.removeEventListener("click", gotoProject)));
      });
      await next();
      if (dead) return;
      ctx.add(() => {
        // ---------- Work: pinned horizontal gallery ----------
        // Snapping: when you stop just short of a resting point, the page carries on to it. Only ever forward
        // (the way you were scrolling): pulling you back undid a single wheel notch, and the gallery couldn't be
        // moved a notch at a time. Never with reduced motion (the system's "animation effects" off): the page
        // then only moves when you move it. Rebuilt whenever ScrollTrigger re-measures the page.
        mm.add("(min-width: 900px) and (pointer: fine) and (prefers-reduced-motion: no-preference)", () => {
          const l = lenis;
          if (!l) return;
          let points: number[] = [];
          const build = () => {
            const vh = window.innerHeight;
            const vw = window.innerWidth;
            const abs = (sel: string) => {
              const el = document.querySelector(sel);
              return el ? el.getBoundingClientRect().top + window.scrollY : null;
            };
            const next: number[] = [];
            const pin = ScrollTrigger.getAll().find((st) => st.pin === document.querySelector(".work"));
            const track = document.querySelector<HTMLElement>(".work-track");
            if (pin && track) {
              next.push(pin.start);
              const distance = track.scrollWidth - vw;
              document.querySelectorAll<HTMLElement>(".panel, .panel-more").forEach((panel) => {
                const center = panel.offsetLeft + panel.offsetWidth / 2 - vw / 2;
                const p = Math.min(1, Math.max(0, center / distance));
                next.push(pin.start + p * (pin.end - pin.start));
              });
            }
            const contact = abs(".contact");
            if (contact !== null) next.push(contact);
            next.push(document.documentElement.scrollHeight - vh);
            points = next.map(Math.round);
          };
          build();
          ScrollTrigger.addEventListener("refresh", build);
          let dir = 0;
          let lastY = l.scroll;
          let timer = 0;
          let snapping = false;
          const settle = () => {
            // (only after you've actually scrolled somewhere: no direction, no snapping)
            if (snapping || !dir || l.isScrolling === "smooth") return;
            const y = l.scroll;
            const reach = window.innerHeight * 0.22;
            let best: number | null = null;
            for (const p of points) {
              const d = (p - y) * dir;
              // ahead of you (or right where you are), close enough
              if (d < -1 || d > reach) continue;
              if (best === null || Math.abs(p - y) < Math.abs(best - y)) best = p;
            }
            if (best === null || Math.abs(best - y) < 2) return;
            snapping = true;
            l.scrollTo(best, { duration: 0.9, easing: (x: number) => 1 - Math.pow(1 - x, 4), onComplete: () => (snapping = false) });
            // (a wheel turn during the glide takes over from it)
            window.setTimeout(() => (snapping = false), 1000);
          };
          const offScroll = l.on("scroll", () => {
            const y = l.scroll;
            if (Math.abs(y - lastY) > 0.5) dir = Math.sign(y - lastY);
            lastY = y;
            if (snapping) return;
            window.clearTimeout(timer);
            timer = window.setTimeout(settle, 260);
          });
          return () => {
            ScrollTrigger.removeEventListener("refresh", build);
            offScroll();
            window.clearTimeout(timer);
          };
        });

        mm.add("(min-width: 900px)", () => {
          const track = document.querySelector<HTMLElement>(".work-track")!;
          const distance = () => track.scrollWidth - window.innerWidth;
          // The panels more than a quarter screen off to the side aren't drawn (cull.ts). Where
          // each sits along the track (from the track's unmoved left edge) is measured with the page.
          const cards = Array.from(track.children) as HTMLElement[];
          const cull = new Cull();
          let spans: { l: number; r: number }[] = [];
          let base = 0;
          const measureCards = () => {
            cull.set(cards);
            base = track.getBoundingClientRect().left - (Number(gsap.getProperty(track, "x")) || 0);
            spans = cards.map((c) => {
              const r = c.getBoundingClientRect();
              return { l: r.left - base, r: r.right - base };
            });
            gallerySync?.();
          };
          const slide = gsap.to(track, {
            x: () => -distance(),
            ease: "none",
            onUpdate: () => {
              const x = Number(gsap.getProperty(track, "x")) || 0;
              const w = window.innerWidth;
              cull.update((i) => !!spans[i] && (spans[i].r + x < -w * 0.25 || spans[i].l + x > w * 1.25));
              gallerySync?.();
            },
            scrollTrigger: {
              // (Sideways swipes drive it too while it's pinned, SmoothScroll.tsx.)
              id: "work-slide",
              trigger: ".work",
              pin: true,
              start: "top top",
              end: () => "+=" + distance() * 1.1,
              scrub: true,
              invalidateOnRefresh: true,
              onRefresh: measureCards,
            },
          });
          gallery = slide;
          galleryAt = (el) => {
            const sp = spans[cards.indexOf(el)];
            if (!sp) return null;
            return { left: base + sp.l + (Number(gsap.getProperty(track, "x")) || 0), width: sp.r - sp.l };
          };

          // The heading belongs to the gallery and comes up with it: once the clouds' underside has cleared it
          // (CloudPass.tsx), its letters rise out of their masks, scrubbed, done as the gallery pins.
          gsap.fromTo(
            ".work .work-heading .char",
            { yPercent: 150, rotate: 10 },
            {
              yPercent: 0,
              rotate: 0,
              stagger: 0.04,
              ease: "expo.out",
              scrollTrigger: { trigger: ".work", start: "top 40%", end: "top top", scrub: 0.6 },
            },
          );

          // Panels lean into the scroll speed. (Not without a graphics card: there it's all drawn in software, and
          // the projects stay flat, gpu.ts.)
          const panels = gsap.utils.toArray<HTMLElement>(".panel");
          const lean = panels.map((p) => gsap.quickTo(p, "skewX", { duration: 0.9, ease: "power3.out" }));
          // Only while the gallery is on screen, and only when the lean actually changes (re-aiming six tweens at
          // panels nobody can see, every frame of scrolling anywhere on the page, was all cost).
          // (And only at the panels being drawn, cull.ts: one coming back in gets the lean of the moment.)
          const leaning = panels.map(() => 0);
          let still = true;
          const leanTick = () => {
            // (nothing to do away from the gallery once the lean is back to nothing)
            if (still && !slide.scrollTrigger?.isActive) return;
            const s = slide.scrollTrigger?.isActive ? Math.round(gsap.utils.clamp(-3, 3, -scroll.velocity * 0.12) * 20) / 20 : 0;
            still = s === 0;
            panels.forEach((p, i) => {
              if (leaning[i] === s || cull.isOff(p)) return;
              leaning[i] = s;
              lean[i](s);
            });
          };
          if (softwareGL()) return () => cull.dispose();
          gsap.ticker.add(leanTick);
          return () => {
            gsap.ticker.remove(leanTick);
            cull.dispose();
          };
        });
      });
      // On phones the panels come in one after another as they scroll up (a step each, like the rest).
      for (const panel of gsap.utils.toArray<HTMLElement>(".panel")) {
        await next();
        if (dead) return;
        ctx.add(() => {
          mm.add("(max-width: 899px)", () => {
            // (the wipe not without a graphics card, as on desktop)
            if (!softwareGL()) gsap.fromTo(
              panel.querySelector(".panel-media"),
              { clipPath: "inset(20% 10% 20% 10% round 20px)" },
              {
                clipPath: "inset(0% 0% 0% 0% round 20px)",
                ease: "none",
                scrollTrigger: { trigger: panel, start: "top 95%", end: "top 45%", scrub: true },
              },
            );
            gsap.from(panel.querySelector(".panel-label"), {
              y: 22,
              scale: 0.88,
              opacity: 0,
              duration: 0.9,
              ease: "back.out(1.8)",
              scrollTrigger: { trigger: panel, start: "top 70%", toggleActions: "play none none reverse" },
            });
            gsap.from(panel.querySelectorAll(".panel-desc, .panel-meta, .panel-actions > *"), {
              opacity: 0,
              y: 24,
              stagger: 0.08,
              duration: 0.9,
              ease: "expo.out",
              scrollTrigger: { trigger: panel, start: "top 60%", toggleActions: "play none none reverse" },
            });
          });
        });
      }
      await next();
      if (dead) return;
      ctx.add(() => {
        // The gallery's panels come in as it slides. They follow the slide itself (its own update, from where it
        // measured each card): a ScrollTrigger each, positioned along the slide, had the whole page measured again
        // for every one of them whenever anything was measured (the biggest part of the setup, and of every
        // re-measure after). Same start and end points as those had.
        mm.add("(min-width: 900px)", () => {
          const at = galleryAt;
          if (!gallery || !at) return;
          const clamp = gsap.utils.clamp(0, 1);
          // scrubbed: progress from where the card's left edge is (w: screen width); toggled: plays once its left
          // edge is past that share of the screen, plays back when it's not (as "play none none reverse" did)
          type Item = {
            el: HTMLElement;
            scrubs: { tween: gsap.core.Tween; at: (left: number, width: number, w: number) => number }[];
            toggles: { tween: gsap.core.Tween; at: number; on: boolean }[];
          };
          const items: Item[] = [];
          gsap.utils.toArray<HTMLElement>(".panel").forEach((panel) => {
            const media = panel.querySelector(".panel-media");
            const img = panel.querySelector(".panel-drift");
            const title = panel.querySelector(".panel-label");
            const rest = panel.querySelectorAll(".panel-index, .panel-desc, .panel-meta, .panel-actions > *");
            const item: Item = { el: panel, scrubs: [], toggles: [] };
            // Image wipes open from the right (as its left edge goes from the screen's right edge to 40%), then
            // drifts inside its frame (all the way across). (Not without a graphics card: a moving clip and a
            // scaled picture cost an extra full pass per frame in software, gpu.ts.)
            if (!softwareGL()) {
              item.scrubs.push({
                tween: gsap.fromTo(media, { clipPath: "inset(12% 0% 12% 100% round 28px)" }, { clipPath: "inset(0% 0% 0% 0% round 28px)", ease: "none", paused: true }),
                at: (left, _width, w) => (w - left) / (w * 0.6),
              });
              item.scrubs.push({
                tween: gsap.fromTo(img, { xPercent: -4, scale: 1.1 }, { xPercent: 4, scale: 1.02, ease: "none", paused: true }),
                at: (left, width, w) => (w - left) / (w + width),
              });
            }
            // The name's glass label lands as one piece, like a drop of glass; then the rest.
            item.toggles.push({ tween: gsap.from(title, { y: 26, scale: 0.86, opacity: 0, duration: 0.9, ease: "back.out(1.8)", paused: true }), at: 0.7, on: false });
            item.toggles.push({ tween: gsap.from(rest, { opacity: 0, y: 24, stagger: 0.08, duration: 0.9, ease: "expo.out", paused: true }), at: 0.6, on: false });
            items.push(item);
          });

          const more = document.querySelector<HTMLElement>(".panel-more");
          if (more) {
            items.push({
              el: more,
              scrubs: [],
              toggles: [
                { tween: gsap.from(more.querySelectorAll(".char"), { yPercent: 150, rotate: 12, stagger: 0.03, duration: 1.1, ease: "expo.out", paused: true }), at: 0.75, on: false },
                { tween: gsap.from(more.querySelector(".more-link"), { scale: 0.3, rotate: -40, autoAlpha: 0, duration: 1.2, ease: "elastic.out(1, 0.5)", paused: true }), at: 0.65, on: false },
              ],
            });
          }

          const sync = () => {
            const w = window.innerWidth;
            for (const it of items) {
              const p = at(it.el);
              if (!p) continue;
              for (const t of it.toggles) {
                const on = p.left <= w * t.at;
                if (on === t.on) continue;
                t.on = on;
                if (on) t.tween.play();
                else t.tween.reverse();
              }
              for (const sc of it.scrubs) {
                const v = clamp(sc.at(p.left, p.width, w));
                if (sc.tween.progress() !== v) sc.tween.progress(v);
              }
            }
          };
          gallerySync = sync;
          sync();
          return () => {
            if (gallerySync === sync) gallerySync = null;
          };
        });
      });
      await next();
      if (dead) return;
      ctx.add(() => {
        // ---------- About → Work: the flight through the clouds (CloudPass.tsx) ----------
        // After the tech stack's last row has had its moment, the bank rises in through the open sky below it,
        // covers the screen while the page swaps behind it, and is gone by the time the gallery pins (that's a
        // resting point, so you never stop in half a cloud; on phones, where nothing pins, just past the heading).
        ScrollTrigger.create({
          trigger: ".work",
          start: "top 170%",
          end: () => (window.innerWidth >= 900 ? "top top" : "top -20%"),
          invalidateOnRefresh: true,
          onUpdate: (self) => (cloudPass.target = self.progress),
          onLeave: () => (cloudPass.target = 1),
          onLeaveBack: () => (cloudPass.target = 0),
        });
      });
      await next();
      if (dead) return;
      ctx.add(() => {
        // ---------- Contact: giant "Say hi" rises and swells ----------
        gsap.fromTo(
          ".sayhi .char",
          { yPercent: 150, rotate: 14, scale: 0.6 },
          {
            yPercent: 0,
            rotate: 0,
            scale: 1,
            stagger: 0.08,
            ease: "power3.out",
            scrollTrigger: { trigger: ".contact", start: "top 85%", end: "top 15%", scrub: true },
          },
        );
        gsap.from(".contact-links li", {
          y: 60,
          opacity: 0,
          stagger: 0.1,
          duration: 1.1,
          ease: "expo.out",
          scrollTrigger: { trigger: ".contact-links", start: "top 95%", toggleActions: "play none none reverse" },
        });
      });
      await next();
      if (dead) return;
      ctx.add(() => {
        // ---------- Nav hides on the way down, returns on the way up ----------
        // (Only when the direction turns: a new tween on every scroll update was work every frame for nothing.)
        const nav = document.querySelector(".nav");
        // (one tween, re-aimed each time: a new one on every turn read the nav's styles in the middle of a frame)
        const navY = gsap.quickTo(nav, "yPercent", { duration: 0.6, ease: "expo.out" });
        let navDir = 0;
        ScrollTrigger.create({
          start: 120,
          end: "max",
          onUpdate: (self) => {
            if (self.direction === navDir) return;
            navDir = self.direction;
            navY(navDir > 0 ? -140 : 0);
          },
          onLeaveBack: () => {
            navDir = 0;
            navY(0);
          },
        });
      });
      await next();
      if (dead) return;
      ctx.add(() => {
        // ---------- Project media tilts toward the pointer ----------
        // (not without a graphics card, like the lean above)
        const tilts = (softwareGL() ? [] : gsap.utils.toArray<HTMLElement>(".panel")).map((panel) => {
          const media = panel.querySelector<HTMLElement>(".panel-media")!;
          const img = panel.querySelector<HTMLElement>(".panel-drift")!;
          const rx = gsap.quickTo(media, "rotationX", { duration: 0.8, ease: "power3.out" });
          const ry = gsap.quickTo(media, "rotationY", { duration: 0.8, ease: "power3.out" });
          const tx = gsap.quickTo(img, "x", { duration: 0.8, ease: "power3.out" });
          const ty = gsap.quickTo(img, "y", { duration: 0.8, ease: "power3.out" });
          const move = (e: PointerEvent) => {
            // (A mouse only: a finger held on a project on a phone tilted the video inside its frame, and the
            // phone's browser cut its corners off instead of keeping it inside the rounded border.)
            if (e.pointerType === "touch") return;
            const r = media.getBoundingClientRect();
            const nx = (e.clientX - r.left) / r.width - 0.5;
            const ny = (e.clientY - r.top) / r.height - 0.5;
            rx(-ny * 10);
            ry(nx * 12);
            tx(-nx * 30);
            ty(-ny * 20);
          };
          const leave = () => {
            rx(0);
            ry(0);
            tx(0);
            ty(0);
          };
          panel.addEventListener("pointermove", move);
          panel.addEventListener("pointerleave", leave);
          return () => {
            panel.removeEventListener("pointermove", move);
            panel.removeEventListener("pointerleave", leave);
          };
        });
        return () => tilts.forEach((c) => c());
      });
      await next();
      if (dead) return;
      ctx.add(() => {
        // ---------- Magnetic links ----------
        const magnets = gsap.utils.toArray<HTMLElement>("[data-magnetic]");
        const cleanups = magnets.map((el) => {
          const x = gsap.quickTo(el, "x", { duration: 0.6, ease: "elastic.out(1, 0.4)" });
          const y = gsap.quickTo(el, "y", { duration: 0.6, ease: "elastic.out(1, 0.4)" });
          const move = (e: PointerEvent) => {
            const r = el.getBoundingClientRect();
            x((e.clientX - (r.left + r.width / 2)) * 0.35);
            y((e.clientY - (r.top + r.height / 2)) * 0.45);
          };
          const leave = () => {
            x(0);
            y(0);
          };
          el.addEventListener("pointermove", move);
          el.addEventListener("pointerleave", leave);
          return () => {
            el.removeEventListener("pointermove", move);
            el.removeEventListener("pointerleave", leave);
          };
        });
        return () => cleanups.forEach((c) => c());
      });

      // Everything measured once more, together (pins, snap points, the gallery's platform).
      await next();
      if (dead) return;
      ctx.add(() => ScrollTrigger.refresh());

      // ---------- Warm-up, behind the loader ----------
      // The first trip through each part of the page was the slow one: GSAP sets its tweens up the first time
      // they play (reading styles in the middle of a frame), and the GPU builds its surfaces the first time each
      // part is drawn (the gallery stalled for well over a second in total). So the page is run through once
      // now, a frame or two per stop, and back to the top, all behind the loader. (Made 99.9% opaque for it:
      // fully opaque, the browser wouldn't draw what's under it at all.)
      const warm = async () => {
        // (Without a graphics card there are no GPU surfaces to build ahead, and every stop was drawn in
        // software: it only made the loader longer.)
        if (softwareGL()) return;
        // (The fonts in first: one swapping in while the page is scrolled down here would move what's on screen.)
        await document.fonts?.ready;
        if (dead) return;
        const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
        const loader = document.querySelector<HTMLElement>(".loader");
        const l = lenis;
        const go = (y: number) => {
          if (l) l.scrollTo(y, { immediate: true, force: true });
          else window.scrollTo(0, y);
          ScrollTrigger.update();
        };
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (loader) loader.style.opacity = "0.999";
        // (at most 1.2 s: on a very slow PC it gives up early rather than outlast the reveal's safety net)
        const t0 = performance.now();
        for (let y = 0; y < max && !dead && performance.now() - t0 < 1200; y += window.innerHeight * 0.6) {
          go(y);
          await frame();
          await frame();
        }
        if (!dead) {
          go(max);
          await frame();
          await frame();
        }
        go(0);
        // (the clouds the run left on the screen gone at once, not fading out into the reveal)
        cloudPass.snap = true;
        await frame();
        await frame();
        if (loader) loader.style.opacity = "";
      };
      // (Let the refresh (pins, snap points, platform measuring) settle for two frames first.)
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => {
          warm().then(() => {
            if (dead) return;
            watchVideos();
            onReady?.();
            // (the per-letter effects on the project panels, built while the browser is idle, lib/letters.ts)
            cancelLetters = buildLettersSoon();
          });
        });
      });

    };
    void run();
    return () => {
      dead = true;
      cancelLetters();
      aboutOffs.forEach((o) => o());
      cancelAnimationFrame(raf);
      ctx.revert();
    };
  }, [ready, onReady, onStep]);

  return null;
}
