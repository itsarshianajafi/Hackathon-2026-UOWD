"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ScrollTrigger } from "../lib/gsap";
import { Arrow, Label, Pill } from "./ui";

const services = [
  {
    word: "Buy",
    img: "/images/dxb-buy.webp",
    text: "Buy with confidence. Agents backed by mortgage, legal and valuation experts negotiate the right price — and know what a good deal looks like.",
  },
  {
    word: "Sell",
    img: "/images/dxb-sell.webp",
    text: "Sell sooner, sell higher. Professional staging, sharp pricing, well-run viewings and agents who keep going until the right buyer signs.",
  },
];

export default function Services() {
  const [active, setActive] = useState(0);
  const rows = useRef<(HTMLAnchorElement | null)[]>([]);

  useEffect(() => {
    const triggers = rows.current.map((row, i) =>
      ScrollTrigger.create({
        trigger: row,
        start: "top 55%",
        end: "bottom 55%",
        onToggle: (self) => self.isActive && setActive(i),
      }),
    );
    return () => triggers.forEach((t) => t.kill());
  }, []);

  return (
    <section id="services" className="relative bg-night px-5 pt-[18vh] pb-[12vh] text-white md:px-10">
      <div className="grid items-start gap-6 md:grid-cols-12">
        <Label className="text-white/50 md:col-span-3">Services</Label>
        <h2 data-reveal-lines className="text-[clamp(2.2rem,3.8vw,3.8rem)] leading-[1] font-medium tracking-[-0.045em] md:col-span-6 md:text-center">
          How ESTARO
          <br />
          <span className="text-white/40">Can Help You</span>
        </h2>
      </div>

      <div className="mt-[9vh] border-t border-white/10">
        {services.map((s, i) => {
          const on = active === i;
          return (
            <a
              key={s.word}
              href="#contact"
              ref={(el) => {
                rows.current[i] = el;
              }}
              onMouseEnter={() => setActive(i)}
              className="relative grid grid-cols-12 items-center gap-y-4 overflow-hidden border-b border-white/10 py-8 md:min-h-[26vh] md:py-0"
            >
              <div
                className="absolute inset-0 transition-[clip-path] duration-[900ms] ease-[cubic-bezier(.7,0,.2,1)]"
                style={{ clipPath: on ? "inset(0% 0% 0% 0%)" : "inset(50% 0% 50% 0%)" }}
              >
                <Image
                  src={s.img}
                  alt=""
                  fill
                  sizes="100vw"
                  className={`object-cover transition-transform duration-[1400ms] ease-out ${on ? "scale-100" : "scale-110"}`}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/35 to-black/55" />
              </div>

              <div className="relative col-span-12 flex gap-4 md:col-span-4">
                <span className="grid size-7 shrink-0 place-items-center rounded-full border border-white/40 text-[10px] tabular-nums">
                  0{i + 1}
                </span>
                <p className={`max-w-[34ch] text-[13px] leading-snug transition-colors duration-500 ${on ? "text-white" : "text-white/60"}`}>
                  {s.text}
                </p>
              </div>

              <h3 className="relative col-span-9 text-[clamp(4rem,10vw,10rem)] leading-[0.95] font-medium tracking-[-0.06em] md:col-span-6 md:text-center">
                <span className="relative inline-block">
                  {s.word}
                  <span
                    className="absolute -bottom-[0.06em] left-[0.04em] h-[0.035em] w-[calc(100%-0.08em)] origin-left bg-white transition-transform duration-700 ease-[cubic-bezier(.7,0,.2,1)]"
                    style={{ transform: on ? "scaleX(1)" : "scaleX(0)" }}
                  />
                </span>
              </h3>

              <span
                className={`relative col-span-3 justify-self-end transition-[color,transform] duration-500 md:col-span-2 ${
                  on ? "translate-x-0 text-white" : "-translate-x-3 text-white/30"
                }`}
              >
                <Arrow className="size-[clamp(2rem,4vw,4rem)]" />
              </span>
            </a>
          );
        })}
      </div>

      <div className="mt-[12vh] grid gap-8 md:grid-cols-12">
        <p data-fill-words className="text-[clamp(1.5rem,2.4vw,2.4rem)] leading-[1.12] font-medium tracking-[-0.035em] md:col-span-7">
          Our certified advisors guide you through every stage of property <span className="text-white/45">with local knowledge and support you can rely on.</span>
        </p>
        <div className="md:col-span-12">
          <Pill variant="outline">Get Started with ESTARO</Pill>
        </div>
      </div>
    </section>
  );
}
