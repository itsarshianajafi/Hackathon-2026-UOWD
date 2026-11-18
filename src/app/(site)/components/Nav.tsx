"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Pill } from "./ui";

const links = [
  { label: "Buy", href: "#services" },
  { label: "Sell", href: "#services" },
  { label: "Agents", href: "#agents" },
  { label: "Resources", href: "#blog" },
  { label: "About", href: "#about" },
];

export default function Nav() {
  const [hidden, setHidden] = useState(false);
  const [solid, setSolid] = useState(false);
  const last = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setSolid(y > 40);
      setHidden(y > 200 && y > last.current);
      last.current = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-[100] transition-[transform,background-color,backdrop-filter] duration-500 ease-[cubic-bezier(.2,.7,.2,1)] ${
        hidden ? "-translate-y-full" : "translate-y-0"
      } ${solid ? "bg-white/70 backdrop-blur-xl" : "bg-transparent"}`}
    >
      <nav className="flex h-[72px] items-center justify-between px-5 md:px-10">
        <a href="#top" aria-label="Estaro Real Estate — home" className="block">
          <Image src="/brand/estaro-logo.png" alt="Estaro Real Estate" width={2016} height={744} priority className="h-10 w-auto md:h-11" />
        </a>
        <ul className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <li key={l.label}>
              <a href={l.href} className="group relative text-[13px] tracking-[-0.01em] text-ink/80 transition-colors hover:text-ink">
                {l.label}
                <span className="absolute -bottom-1 left-0 h-px w-full origin-right scale-x-0 bg-ink transition-transform duration-500 group-hover:origin-left group-hover:scale-x-100" />
              </a>
            </li>
          ))}
        </ul>
        <Pill href="/dashboard" size="sm" arrow={false}>
          Dashboard
        </Pill>
      </nav>
    </header>
  );
}
