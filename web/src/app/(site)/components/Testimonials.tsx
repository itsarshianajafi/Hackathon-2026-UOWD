"use client";

import Image from "next/image";
import { useState } from "react";
import { IconButton } from "./ui";

const quotes = [
  {
    text: "Aanya was an incredible agent. Patient, sharp and genuinely invested in finding us the right neighbourhood — not just the right price. She was available morning, noon and night. We'd recommend ESTARO to anyone.",
    name: "Rohan & Meera K.",
    role: "Bought their first home",
  },
  {
    text: "We had a deadline, two kids and zero time. ESTARO found us the right home before it was even listed, handled the paperwork and had the keys in our hands within weeks.",
    name: "Daniel Okafor",
    role: "Relocated for work",
  },
  {
    text: "The staging, the photography, the pricing strategy — everything felt considered. We sold above asking in eleven days, and the whole process was calm from start to finish.",
    name: "Sophia Laurent",
    role: "Sold a family apartment",
  },
];

export default function Testimonials() {
  const [i, setI] = useState(0);
  const go = (d: number) => setI((v) => (v + d + quotes.length) % quotes.length);

  return (
    <section className="bg-paper px-5 pt-[14vh] pb-[18vh] md:px-10">
      <h2 data-reveal-lines className="text-[clamp(2.2rem,4vw,4rem)] leading-[1] font-medium tracking-[-0.045em]">
        Don&apos;t Take <span className="text-mute">Our Word for It.</span>
      </h2>

      <div className="mt-12 grid gap-10 md:grid-cols-12">
        <div className="relative aspect-[16/11] overflow-hidden md:col-span-7">
          <div data-parallax="8" className="absolute inset-x-0 -top-[10%] h-[120%]">
            <Image src="/images/dxb-testimonial.webp" alt="Two ESTARO clients chatting on the Dubai Marina promenade" fill sizes="(min-width:768px) 58vw, 100vw" className="object-cover" />
          </div>
        </div>

        <div className="flex flex-col md:col-span-5 md:pl-6">
          <div className="flex items-center justify-between border-b border-ink/10 pb-5">
            <span className="font-serif text-6xl leading-none text-ink/80">&ldquo;</span>
            <div className="flex gap-2">
              <IconButton label="Previous testimonial" onClick={() => go(-1)} flip />
              <IconButton label="Next testimonial" onClick={() => go(1)} />
            </div>
          </div>

          <div className="relative mt-8 grid">
            {quotes.map((q, k) => (
              <figure
                key={q.name}
                aria-hidden={k !== i}
                className={`col-start-1 row-start-1 transition-[opacity,transform,filter] duration-700 ease-out ${
                  k === i ? "translate-y-0 opacity-100 blur-0" : "pointer-events-none translate-y-4 opacity-0 blur-sm"
                }`}
              >
                <blockquote className="font-serif text-[clamp(1.15rem,1.6vw,1.5rem)] leading-[1.4] text-ink/90">{q.text}</blockquote>
                <figcaption className="mt-8 flex items-end justify-between text-[13px]">
                  <span>
                    <span className="block font-medium">{q.name}</span>
                    <span className="text-mute">{q.role}</span>
                  </span>
                  <span className="tracking-[0.2em] text-ink" aria-label="5 out of 5 stars">★★★★★</span>
                </figcaption>
              </figure>
            ))}
          </div>

          <p className="mt-auto pt-10 text-[12px] tabular-nums text-mute">
            0{i + 1} / 0{quotes.length}
          </p>
        </div>
      </div>
    </section>
  );
}
