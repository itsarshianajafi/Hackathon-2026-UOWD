"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { gsap } from "../lib/gsap";
import { Pill } from "./ui";

/**
 * Pinned, scroll-scrubbed hero.
 * Layers (back → front): sky · headline · building · ESTARO wordmark · cloud bank · white-out.
 * Outer `data-*` wrappers are driven by scroll; inner `.intro-*` wrappers by the load-in
 * animation, so the two timelines never fight over the same transform.
 */
export default function Hero() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // ── Load-in ───────────────────────────────────────────────
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from(".intro-sky", { scale: 1.18, duration: 2.6, ease: "power2.out" }, 0)
        .from(".intro-building", { yPercent: 14, opacity: 0, duration: 2.2 }, 0.1)
        .from(".intro-clouds", { yPercent: 18, duration: 2.6 }, 0)
        .from(".intro-line", { yPercent: 110, duration: 1.3, ease: "power4.out" }, 0.55)
        .from(".intro-fade", { opacity: 0, y: 14, duration: 1, stagger: 0.12 }, 0.95);

      // ── Scroll parallax ──────────────────────────────────────
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: root.current,
          start: "top top",
          end: "+=280%",
          scrub: 1,
          pin: true,
        },
      });

      tl
        // headline drifts up, blurs and fades while the building rises over it
        .to("[data-hero-copy]", { yPercent: -60, opacity: 0, filter: "blur(10px)", duration: 0.24 }, 0)
        // sky: slowest layer
        .to("[data-hero-sky]", { scale: 1.1, yPercent: -3, duration: 1 }, 0)
        // back clouds: slow
        .to("[data-hero-clouds-back]", { yPercent: -6, scale: 1.06, duration: 0.6 }, 0)
        // building: pushes up and towards the camera
        .to("[data-hero-building]", { scale: 1.45, yPercent: -16, duration: 0.6 }, 0)
        // front clouds: fastest
        .to("[data-hero-clouds]", { yPercent: -8, scale: 1.08, duration: 0.6 }, 0)
        // wordmark: thin outline appears over the building…
        .fromTo("[data-hero-logo]", { scale: 0.86 }, { scale: 1, duration: 0.5 }, 0.2)
        .fromTo("[data-logo-outline]", { opacity: 0 }, { opacity: 1, duration: 0.12 }, 0.24)
        // …then fills with the building as the building itself dissolves
        .fromTo("[data-logo-fill]", { opacity: 0 }, { opacity: 1, duration: 0.14 }, 0.4)
        .fromTo("[data-logo-fill]", { backgroundPosition: "50% 72%" }, { backgroundPosition: "50% 63%", duration: 0.5 }, 0.36)
        .to("[data-logo-outline]", { opacity: 0, duration: 0.1 }, 0.52)
        .to("[data-hero-building]", { opacity: 0, duration: 0.16 }, 0.46)
        // cloud banks sweep up and swallow the frame
        .to("[data-hero-clouds-back]", { yPercent: -40, scale: 2.2, duration: 0.36 }, 0.62)
        .to("[data-hero-clouds]", { yPercent: -38, scale: 2.8, duration: 0.38 }, 0.62)
        .to("[data-hero-logo]", { yPercent: -30, opacity: 0, duration: 0.22 }, 0.72)
        .to("[data-hero-white]", { opacity: 1, duration: 0.14 }, 0.86);
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} id="top" className="relative h-svh w-full overflow-hidden bg-[#9dcdee]">
      {/* Sky */}
      <div data-hero-sky className="pointer-events-none absolute inset-0 origin-top will-change-transform">
        <div className="intro-sky absolute inset-0">
          <Image src="/images/sky.webp" alt="" fill priority sizes="100vw" className="object-cover" />
        </div>
      </div>

      {/* Headline */}
      <div data-hero-copy className="absolute inset-x-0 top-[19vh] z-10 flex flex-col items-center px-5 text-center md:top-[17vh]">
        <h1 className="max-w-[14ch] text-[clamp(2.7rem,5.6vw,6rem)] leading-[0.98] font-semibold tracking-[-0.05em] text-[#1b2533] md:max-w-none">
          <span className="block overflow-hidden pb-[0.1em]">
            <span className="intro-line block">Where every space becomes home</span>
          </span>
        </h1>
        <p className="intro-fade mt-3 max-w-[46ch] text-[14px] leading-snug tracking-[-0.01em] text-[#24303e]/80 md:text-[15px]">
          Expert agents. Honest guidance. A clear path to the place that fits your life.
        </p>
        <div className="intro-fade mt-6">
          <Pill href="#about">Explore Properties</Pill>
        </div>
      </div>

      {/* Back clouds (mirrored, slower) */}
      <div data-hero-clouds-back className="pointer-events-none absolute -inset-x-[10%] top-[66vh] z-[15] h-[60vh] origin-bottom opacity-90 will-change-transform md:top-[60vh]">
        <div className="intro-clouds relative h-full w-full -scale-x-100">
          <Image src="/images/clouds-soft.webp" alt="" fill priority sizes="120vw" className="object-cover object-top" />
        </div>
      </div>

      {/* Building (cut-out, transparent sky) */}
      <div
        data-hero-building
        className="pointer-events-none absolute bottom-[14vh] left-1/2 z-20 -ml-[75vw] aspect-[3/2] w-[150vw] origin-[50%_75%] will-change-transform md:bottom-[7vh] md:-ml-[51vh] md:h-[68vh] md:w-auto"
      >
        <div className="intro-building relative h-full w-full">
          <Image
            src="/images/building-cutout.webp"
            alt="An ESTARO residence rising above the clouds at golden hour"
            fill
            priority
            sizes="(min-width: 768px) 102vh, 150vw"
            className="object-contain"
          />
        </div>
      </div>

      {/* Wordmark */}
      <div data-hero-logo className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center pb-[26vh]">
        <div className="relative aspect-[2016/744] w-[88vw] max-w-[1100px] drop-shadow-[0_6px_24px_rgba(20,30,45,0.25)] md:w-[60vw]">
          {/* stage 1: white ghost of the logo over the building */}
          <Image
            data-logo-outline
            src="/brand/estaro-logo-white.png"
            alt=""
            fill
            sizes="(min-width:768px) 60vw, 88vw"
            className="object-contain opacity-0"
          />
          {/* stage 2: logo filled with the building (logo used as a mask) */}
          <div data-logo-fill role="img" aria-label="Estaro Real Estate" className="logo-fill absolute inset-0 opacity-0" />
        </div>
      </div>

      {/* Front cloud bank */}
      <div data-hero-clouds className="pointer-events-none absolute -inset-x-[10%] top-[74vh] z-40 h-[60vh] origin-bottom will-change-transform md:top-[72vh]">
        <div className="intro-clouds relative h-full w-full">
          <Image src="/images/clouds-soft.webp" alt="" fill priority sizes="120vw" className="object-cover object-top" />
        </div>
      </div>

      {/* White-out into the next section */}
      <div data-hero-white className="pointer-events-none absolute inset-0 z-50 bg-paper opacity-0" />
    </section>
  );
}
