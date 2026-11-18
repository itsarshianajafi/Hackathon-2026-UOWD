import Image from "next/image";
import { ArrowSwap, Label, Pill, RollText, TextLink } from "./ui";

/* ───────────────────────────── Intro ───────────────────────────── */
export function Intro() {
  return (
    <section id="about" className="relative bg-paper pt-[16vh]">
      <div className="grid gap-8 px-5 md:grid-cols-12 md:px-10">
        <Label className="text-mute md:col-span-3">Why ESTARO</Label>
        <p data-fill-words className="text-[clamp(1.6rem,2.7vw,2.75rem)] leading-[1.12] font-medium tracking-[-0.035em] md:col-span-7 md:col-start-5">
          Your life is changing. Don&apos;t just find a property — find the place where it all comes together. We help you move forward with clarity, confidence and the right agent by your side.
        </p>
      </div>

      <div className="mt-[14vh]">
        <div data-expand className="relative h-[70vh] overflow-hidden md:h-[92vh]">
          <div data-parallax="9" className="absolute inset-x-0 -top-[12%] h-[124%]">
            <Image src="/images/dxb-city.webp" alt="Downtown Dubai and the Burj Khalifa at golden hour" fill sizes="100vw" className="object-cover" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────── Chevrons ─────────────────────────── */
const chevrons = ["/images/dxb-woman-window.webp", "/images/dxb-living.webp", "/images/dxb-kitchen.webp", "/images/dxb-keys.webp"];

export function Chevrons() {
  return (
    <section className="overflow-hidden bg-paper px-5 py-[20vh] text-center md:px-10">
      <h2 data-reveal-lines className="text-[clamp(2rem,3.8vw,3.8rem)] leading-[1.02] font-medium tracking-[-0.045em]">
        This isn&apos;t just <span className="text-mute">about property.</span>
      </h2>

      <div data-chevrons className="mt-14 flex justify-center [--w:24vw] md:[--w:16vw]">
        {chevrons.map((src, i) => (
          <div
            key={src}
            className="chevron relative aspect-[4/5] w-[var(--w)] shrink-0 overflow-hidden"
            style={{ marginLeft: i === 0 ? 0 : "calc(var(--w) * -0.2 + 0.9vw)" }}
          >
            <Image src={src} alt="" fill sizes="(min-width:768px) 16vw, 24vw" className="object-cover" />
          </div>
        ))}
      </div>

      <p data-fade-up className="mx-auto mt-14 max-w-[40ch] text-[15px] leading-snug tracking-[-0.01em]">
        It&apos;s about the next chapter. The morning light, the easy commute, the room your kids grow up in.{" "}
        <span className="text-mute">We help you find the space that fits the life you&apos;re building.</span>
      </p>
    </section>
  );
}

/* ───────────────────────────── Steps ───────────────────────────── */
const steps = [
  ["Talk to a real person.", "We pair you with an advisor who listens before they list."],
  ["Get clarity.", "We map what you actually need — not just what happens to be available."],
  ["Move forward.", "We negotiate, handle the paperwork and put the keys in your hand."],
];

export function Steps() {
  return (
    <section className="bg-paper px-5 py-[12vh] md:px-10">
      <div className="grid gap-14 md:grid-cols-12">
        <div className="md:col-span-5">
          <h2 data-reveal-lines className="text-[clamp(2.6rem,4.8vw,4.8rem)] leading-[0.95] font-medium tracking-[-0.05em]">
            Real Estate,
            <br />
            <span className="text-mute">Reimagined.</span>
          </h2>
          <Pill className="mt-8">Start Your Search</Pill>
        </div>

        <div className="md:col-span-6 md:col-start-7">
          <Label className="text-mute">How it works</Label>
          <ol className="mt-6">
            {steps.map(([title, body], i) => (
              <li key={title} data-fade-up className="flex gap-5 border-t border-ink/10 py-6 last:border-b">
                <span className="pt-1 text-[11px] tabular-nums text-mute">0{i + 1}</span>
                <p className="text-[clamp(1.05rem,1.4vw,1.35rem)] leading-snug tracking-[-0.02em]">
                  <span className="font-medium">{title}</span> <span className="text-mute">{body}</span>
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────── For agents ───────────────────────── */
export function Career() {
  return (
    <section id="agents" className="bg-paper px-5 py-[14vh] md:px-10">
      <div className="grid gap-6 md:grid-cols-12">
        <Label className="text-mute md:col-span-3">For Agents</Label>
        <h2 data-reveal-lines className="text-[clamp(2.2rem,4vw,4rem)] leading-[1] font-medium tracking-[-0.045em] md:col-span-8 md:col-start-5 md:text-right">
          Don&apos;t Just Join a Brokerage. <span className="text-mute">Build Your Name.</span>
        </h2>
      </div>

      <div className="mt-12 grid grid-cols-12 items-start gap-4">
        <div data-speed="1.4" className="relative col-span-5 mt-[28vh] aspect-[3/4] overflow-hidden md:col-span-3 md:mt-[36vh]">
          <div data-parallax="10" className="absolute inset-x-0 -top-[12%] h-[124%]">
            <Image src="/images/dxb-agent.webp" alt="An ESTARO agent on a balcony above Dubai Marina" fill sizes="(min-width:768px) 25vw, 42vw" className="object-cover" />
          </div>
        </div>
        <div data-speed="0.4" className="relative col-span-7 aspect-[4/5] overflow-hidden md:col-span-7 md:col-start-6 md:aspect-[16/12]">
          <div data-parallax="8" className="absolute inset-x-0 -top-[10%] h-[120%]">
            <Image src="/images/dxb-palm.webp" alt="Beachfront villas on the Palm Jumeirah" fill sizes="(min-width:768px) 58vw, 58vw" className="object-cover" />
          </div>
        </div>
      </div>

      <div className="mt-14 grid md:grid-cols-12">
        <div className="md:col-span-5 md:col-start-8">
          <p data-fade-up className="text-[15px] leading-relaxed tracking-[-0.01em]">
            At ESTARO, agents aren&apos;t a line item on the brand — they&apos;re partners in it.{" "}
            <span className="text-mute">
              Qualified leads, marketing that looks like this, real mentorship and a genuine share in what we build together.
            </span>
          </p>
          <Pill className="mt-8">Join the Team</Pill>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── Support ─────────────────────────── */
const supports = [
  ["Mortgage Services", "/images/dxb-service-mortgage.webp"],
  ["Property Management", "/images/dxb-service-management.webp"],
  ["Construction & Development", "/images/dxb-service-development.webp"],
];

export function Support() {
  return (
    <section className="bg-night px-5 pt-[6vh] pb-[18vh] text-white md:px-10">
      <div className="grid gap-8 md:grid-cols-12">
        <h2 data-reveal-lines className="text-[clamp(2.2rem,3.8vw,3.8rem)] leading-[1] font-medium tracking-[-0.045em] md:col-span-6">
          Support Beyond
          <br />
          <span className="text-white/40">Buying and Selling</span>
        </h2>
        <div className="md:col-span-4 md:col-start-9">
          <p data-fade-up className="text-[14px] leading-relaxed text-white/70">
            The property market never stands still — and neither do we. From financing to long-term care of your investment, our in-house teams
            keep working for you long after the keys change hands.
          </p>
          <Pill variant="light" className="mt-6">
            Explore Our Services
          </Pill>
        </div>
      </div>

      <div className="mt-[10vh] grid gap-4 md:grid-cols-3">
        {supports.map(([title, src], i) => (
          <a key={title} href="#contact" data-speed={(0.3 + i * 0.35).toFixed(2)} className="group hover-host relative block aspect-[3/4] overflow-hidden">
            <Image src={src} alt="" fill sizes="(min-width:768px) 33vw, 100vw" className="object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-110" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/50" />
            <h3 className="absolute top-5 left-5 max-w-[12ch] text-[clamp(1.4rem,2vw,2rem)] leading-[1] font-medium tracking-[-0.04em]">{title}</h3>
            <span className="btn absolute bottom-5 left-5 gap-2 px-4 py-2 text-[12px] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.4)] backdrop-blur-sm [--fill:#ffffff] group-hover:text-ink">
              <span className="btn-fill" aria-hidden />
              <RollText>Learn More</RollText>
              <ArrowSwap className="size-3" />
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

/* ────────────────────────────── Blog ───────────────────────────── */
const posts = [
  {
    date: "2026-11-04",
    title: "2026 Market Outlook: Where Prices Are Heading Next",
    excerpt: "Rates, supply and demand — our analysts break down what the next twelve months could mean for buyers and sellers.",
    img: "/images/dxb-blog-skyline.webp",
  },
  {
    date: "2026-10-18",
    title: "Buying Before Spring: Is Winter the Smart Move?",
    excerpt: "Fewer buyers, motivated sellers and quieter viewings. Here's when buying in the off-season pays off.",
    img: "/images/dxb-blog-park.webp",
  },
  {
    date: "2026-09-29",
    title: "What Your Budget Buys in Five Different Neighbourhoods",
    excerpt: "From period townhouses to new-build penthouses — the same budget, five very different front doors.",
    img: "/images/dxb-blog-townhouses.webp",
  },
];

export function Blog() {
  return (
    <section id="blog" className="relative bg-paper px-5 pt-[16vh] pb-[14vh] md:px-10">
      <div className="grid gap-8 md:grid-cols-12">
        <h2 data-reveal-lines className="text-[clamp(2.4rem,4.2vw,4.2rem)] leading-[0.98] font-medium tracking-[-0.045em] md:col-span-5">
          Blog &amp;
          <br />
          <span className="text-mute">Resources</span>
        </h2>
        <div className="md:col-span-4 md:col-start-9">
          <p data-fade-up className="text-[14px] leading-relaxed text-ink/70">
            Market reports, neighbourhood guides and honest advice from the people who close deals every day.
          </p>
          <Pill className="mt-5">View Our Blog</Pill>
        </div>
      </div>

      <div className="mt-[10vh]">
        {posts.map((p) => (
          <article key={p.title} className="grid items-center gap-8 border-t border-ink/10 py-10 md:grid-cols-12">
            <div data-fade-up className="md:col-span-4">
              <time className="text-[12px] tabular-nums text-mute">{p.date}</time>
              <h3 className="mt-3 text-[clamp(1.4rem,2vw,2rem)] leading-[1.08] font-medium tracking-[-0.035em]">{p.title}</h3>
              <p className="mt-3 max-w-[42ch] text-[14px] leading-relaxed text-ink/60">{p.excerpt}</p>
              <TextLink href="#blog" className="mt-5">
                Read More
              </TextLink>
            </div>
            <a href="#blog" className="group relative aspect-[16/10] overflow-hidden md:col-span-7 md:col-start-6">
              <div data-parallax="8" className="absolute inset-x-0 -top-[10%] h-[120%] transition-transform duration-[1200ms] ease-out group-hover:scale-105">
                <Image src={p.img} alt="" fill sizes="(min-width:768px) 58vw, 100vw" className="object-cover" />
              </div>
            </a>
          </article>
        ))}
      </div>

      <div className="pointer-events-none sticky bottom-0 -mx-5 mt-4 h-1 md:-mx-10">
        <div data-progress className="h-full origin-left bg-teal" />
      </div>
    </section>
  );
}

/* ─────────────────────────────── CTA ───────────────────────────── */
export function Cta() {
  return (
    <section id="contact" className="relative grid h-svh place-items-center overflow-hidden bg-night px-5 text-center text-white">
      <div data-parallax="12" className="absolute inset-x-0 -top-[14%] h-[128%]">
        <Image src="/images/dxb-cta.webp" alt="A family relaxing on the terrace of their new Dubai villa" fill sizes="100vw" className="object-cover" />
      </div>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative">
        <h2 data-reveal-lines className="text-[clamp(2.2rem,4.4vw,4.6rem)] leading-[1] font-medium tracking-[-0.045em]">
          Find Your Space. <span className="text-white/60">We&apos;ll Help You Get There.</span>
        </h2>
        <Pill variant="light" className="mt-8">
          Talk to an Advisor
        </Pill>
      </div>
    </section>
  );
}

/* ───────────────────────────── Footer ──────────────────────────── */
const footLinks = ["Buy", "Sell", "Agents", "About Us", "Agent Portal"];
const socials = ["Facebook", "Instagram", "YouTube", "LinkedIn"];

export function Footer() {
  return (
    <footer className="bg-night px-5 pt-[12vh] text-white md:px-10">
      <div className="grid gap-12 md:grid-cols-12">
        <form className="md:col-span-5" action="#">
          <p className="text-[clamp(1.2rem,1.6vw,1.6rem)] font-medium tracking-[-0.03em]">Subscribe to our Newsletter</p>
          <label className="mt-6 flex items-center border-b border-white/25 pb-3 focus-within:border-white">
            <span className="sr-only">Email address</span>
            <input type="email" placeholder="Enter email address" className="w-full bg-transparent text-[14px] placeholder:text-white/40 focus:outline-none" />
            <button type="submit" aria-label="Subscribe" data-magnetic="0.5" className="btn hover-host size-9 shrink-0 justify-center text-white [--fill:#ffffff] hover:text-ink">
              <span className="btn-fill" aria-hidden />
              <ArrowSwap className="size-4" />
            </button>
          </label>
        </form>
        <ul className="space-y-2 text-[14px] md:col-span-2 md:col-start-9">
          {footLinks.map((l) => (
            <li key={l}>
              <a href="#top" className="hover-host text-white/80 transition-colors hover:text-white"><span className="link-line">{l}</span></a>
            </li>
          ))}
        </ul>
        <ul className="space-y-2 text-[14px] md:col-span-2">
          {socials.map((l) => (
            <li key={l}>
              <a href="#top" className="hover-host text-white/80 transition-colors hover:text-white"><span className="link-line">{l}</span></a>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-14 grid gap-6 text-[13px] sm:grid-cols-3 md:w-2/3">
        <div>
          <p className="text-white/40">Head Office</p>
          <p className="mt-2 leading-snug">Level 12, Bay Square, Business Bay<br />Dubai, United Arab Emirates</p>
        </div>
        <div>
          <p className="text-white/40">Email Us</p>
          <a href="mailto:hello@estaro.com" className="hover-host mt-2 inline-block"><span className="link-line">hello@estaro.com</span></a>
        </div>
        <div>
          <p className="text-white/40">Call Us</p>
          <a href="tel:+97141234567" className="hover-host mt-2 inline-block"><span className="link-line">+971 4 123 4567</span></a>
        </div>
      </div>

      <div className="mt-[8vh] overflow-hidden pb-10">
        <div data-rise className="flex justify-center">
          <Image
            src="/brand/estaro-logo-white-footer.png"
            alt="Estaro Real Estate"
            width={2142}
            height={870}
            sizes="(min-width:1400px) 760px, 80vw"
            className="h-auto w-[80vw] max-w-[760px] select-none md:w-[52vw]"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 py-6 text-[11px] text-white/45">
        <div className="flex flex-wrap gap-5">
          <a href="#top" className="hover-host transition-colors hover:text-white"><span className="link-line">Terms</span></a>
          <a href="#top" className="hover-host transition-colors hover:text-white"><span className="link-line">Privacy Policy</span></a>
          <a href="#top" className="hover-host transition-colors hover:text-white"><span className="link-line">Fair Housing</span></a>
          <a href="#top" className="hover-host transition-colors hover:text-white"><span className="link-line">Accessibility</span></a>
        </div>
        <p>© 2026 ESTARO Real Estate. Where every space becomes home.</p>
      </div>
    </footer>
  );
}
