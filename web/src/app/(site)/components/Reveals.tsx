"use client";

import { useEffect } from "react";
import { gsap, ScrollTrigger, SplitText } from "../lib/gsap";

/**
 * Wires up declarative scroll effects anywhere on the page:
 *  data-reveal-lines   headline lines slide up out of a mask
 *  data-fill-words     words brighten from faint to full as you scroll (scrubbed)
 *  data-fade-up        fade + rise on enter
 *  data-parallax="n"   inner image drifts ±n% inside its clipped frame (scrubbed)
 *  data-speed="n"      whole element drifts at a different speed (scrubbed)
 *  data-expand         inset frame expands to full-bleed (scrubbed)
 *  data-chevrons       chevron strip slides in, one after another (scrubbed)
 *  data-rise           element rises out of its overflow-hidden parent (scrubbed)
 *  data-progress       bar fills across its closest <section>
 * Mounted last so the pinned hero's spacing exists before these measure.
 */
export default function Reveals() {
  useEffect(() => {
    let ctx: gsap.Context | undefined;
    let cancelled = false;

    document.fonts.ready.then(() => {
      if (cancelled) return;
      ctx = gsap.context(() => {
        const q = <T extends HTMLElement = HTMLElement>(s: string) => gsap.utils.toArray<T>(s);

        q("[data-reveal-lines]").forEach((el) => {
          SplitText.create(el, {
            type: "lines",
            mask: "lines",
            autoSplit: true,
            onSplit: (self) =>
              gsap.from(self.lines, {
                yPercent: 110,
                duration: 1.2,
                ease: "power4.out",
                stagger: 0.09,
                scrollTrigger: { trigger: el, start: "top 88%" },
              }),
          });
        });

        q("[data-fill-words]").forEach((el) => {
          SplitText.create(el, {
            type: "words",
            autoSplit: true,
            onSplit: (self) =>
              gsap.fromTo(
                self.words,
                { opacity: 0.14 },
                {
                  opacity: 1,
                  ease: "none",
                  stagger: 0.1,
                  scrollTrigger: { trigger: el, start: "top 82%", end: "bottom 48%", scrub: true },
                },
              ),
          });
        });

        q("[data-fade-up]").forEach((el) => {
          gsap.from(el, {
            y: 48,
            opacity: 0,
            duration: 1.2,
            ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 90%" },
          });
        });

        q("[data-parallax]").forEach((el) => {
          const amount = parseFloat(el.dataset.parallax || "10");
          gsap.fromTo(
            el,
            { yPercent: -amount },
            {
              yPercent: amount,
              ease: "none",
              scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: true },
            },
          );
        });

        q("[data-speed]").forEach((el) => {
          const s = parseFloat(el.dataset.speed || "1");
          gsap.fromTo(
            el,
            { y: () => s * 90 },
            {
              y: () => -s * 90,
              ease: "none",
              scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true, invalidateOnRefresh: true },
            },
          );
        });

        q("[data-expand]").forEach((el) => {
          gsap.fromTo(
            el,
            { clipPath: "inset(0% 14% 0% 14% round 18px)" },
            {
              clipPath: "inset(0% 0% 0% 0% round 0px)",
              ease: "none",
              scrollTrigger: { trigger: el, start: "top 92%", end: "top 12%", scrub: true },
            },
          );
        });

        q("[data-chevrons]").forEach((el) => {
          const items = Array.from(el.children);
          gsap.fromTo(
            items,
            { xPercent: (i) => -60 - i * 45, opacity: 0 },
            {
              xPercent: 0,
              opacity: 1,
              ease: "none",
              stagger: 0.12,
              scrollTrigger: { trigger: el, start: "top 95%", end: "center 50%", scrub: true },
            },
          );
        });

        q("[data-rise]").forEach((el) => {
          gsap.fromTo(
            el,
            { yPercent: 100 },
            {
              yPercent: 0,
              ease: "none",
              scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "top 72%", scrub: true },
            },
          );
        });

        q("[data-progress]").forEach((el) => {
          gsap.fromTo(
            el,
            { scaleX: 0 },
            {
              scaleX: 1,
              ease: "none",
              scrollTrigger: { trigger: el.closest("section"), start: "top top", end: "bottom bottom", scrub: true },
            },
          );
        });
      });
      ScrollTrigger.refresh();
    });

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  return null;
}
