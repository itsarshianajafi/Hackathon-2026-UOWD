"use client";

import { useEffect } from "react";
import { gsap } from "../lib/gsap";

/** Magnetic pull for every [data-magnetic] element: it drifts toward the cursor and eases back on leave. */
export default function ButtonFx() {
  useEffect(() => {
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!finePointer || reduced) return;

    const cleanups = Array.from(document.querySelectorAll<HTMLElement>("[data-magnetic]")).map((el) => {
      const strength = parseFloat(el.dataset.magnetic || "0.3");
      const xTo = gsap.quickTo(el, "x", { duration: 0.6, ease: "power3.out" });
      const yTo = gsap.quickTo(el, "y", { duration: 0.6, ease: "power3.out" });

      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * strength);
        yTo((e.clientY - (r.top + r.height / 2)) * strength);
      };
      const leave = () => {
        xTo(0);
        yTo(0);
      };

      el.addEventListener("pointermove", move);
      el.addEventListener("pointerleave", leave);
      return () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerleave", leave);
        gsap.set(el, { clearProps: "transform" });
      };
    });

    return () => cleanups.forEach((c) => c());
  }, []);

  return null;
}
