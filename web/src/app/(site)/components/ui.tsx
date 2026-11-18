import type { ReactNode } from "react";

export function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <path d="M2 8h11M9 3.5 13.5 8 9 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Arrow that exits right while a twin enters from the left (on .btn / .hover-host hover). */
export function ArrowSwap({ className = "size-3.5" }: { className?: string }) {
  return (
    <span className={`arrow-swap ${className}`} aria-hidden>
      <Arrow />
      <Arrow />
    </span>
  );
}

/** Label that rolls up and is replaced by an identical copy (on .btn / .hover-host hover). */
export function RollText({ children }: { children: ReactNode }) {
  return (
    <span className="roll">
      <span>{children}</span>
      <span aria-hidden>{children}</span>
    </span>
  );
}

// fill = colour that rises in on hover; hover:text = label colour over that fill
const pillStyles = {
  dark: "bg-ink text-white [--fill:#ffffff] hover:text-ink hover:shadow-[inset_0_0_0_1px_var(--color-ink)]",
  light: "bg-white text-ink [--fill:var(--color-ink)] hover:text-white",
  outline: "text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.3)] [--fill:#ffffff] hover:text-ink",
  outlineDark: "text-ink shadow-[inset_0_0_0_1px_rgb(18_22_28/0.2)] [--fill:var(--color-ink)] hover:text-white",
} as const;

const sizes = {
  md: "px-5 py-2.5 text-[13px] gap-2",
  sm: "px-4 py-2 text-[12px] gap-1.5",
} as const;

export function Pill({
  children,
  href = "#",
  variant = "dark",
  size = "md",
  arrow = true,
  className = "",
}: {
  children: ReactNode;
  href?: string;
  variant?: keyof typeof pillStyles;
  size?: keyof typeof sizes;
  arrow?: boolean;
  className?: string;
}) {
  return (
    <a href={href} data-magnetic="0.3" className={`btn font-medium tracking-[-0.01em] ${sizes[size]} ${pillStyles[variant]} ${className}`}>
      <span className="btn-fill" aria-hidden />
      <RollText>{children}</RollText>
      {arrow && <ArrowSwap />}
    </a>
  );
}

/** Round icon button (e.g. carousel arrows). */
export function IconButton({
  label,
  onClick,
  flip = false,
  className = "",
}: {
  label: string;
  onClick?: () => void;
  flip?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      data-magnetic="0.4"
      className={`btn size-10 justify-center text-ink shadow-[inset_0_0_0_1px_rgb(18_22_28/0.15)] [--fill:var(--color-ink)] hover:text-white ${className}`}
    >
      <span className="btn-fill" aria-hidden />
      <span className={flip ? "rotate-180" : ""}>
        <ArrowSwap className="size-4" />
      </span>
    </button>
  );
}

/** Text link with a drawn underline + arrow swap. */
export function TextLink({ children, href = "#", className = "" }: { children: ReactNode; href?: string; className?: string }) {
  return (
    <a href={href} className={`hover-host inline-flex items-center gap-2 text-[13px] font-medium ${className}`}>
      <span className="link-line">{children}</span>
      <ArrowSwap />
    </a>
  );
}

export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-[13px] tracking-[-0.01em] ${className}`}>{children}</p>;
}
