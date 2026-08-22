import Link from "next/link";

/** The mark: a leaf over the rings of a footprint shrinking toward it. */
export function LogoMark({ className = "h-7 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 56" className={className} aria-hidden="true">
      <path
        d="M2 46 A30 30 0 0 1 62 46"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M11 46 A21 21 0 0 1 53 46"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M20 46 A12 12 0 0 1 44 46"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.3"
      />
      <path d="M32 8 C46 16, 46 34, 32 42 C18 34, 18 16, 32 8 Z" fill="var(--leaf)" />
      <path
        d="M32 42 L32 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M32 26 L40 19 M32 32 L24 25"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  );
}

export function Wordmark({ className = "text-lg" }: { className?: string }) {
  return (
    <span className={`font-display tracking-tight ${className}`}>
      <span className="font-extralight">Icare</span>
      <span className="font-bold">Earth</span>
    </span>
  );
}

/** Header lockup used on every page. */
export default function Logo({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 text-accent transition-opacity hover:opacity-80"
    >
      <LogoMark className={size === "lg" ? "h-9 w-10" : "h-6 w-7"} />
      <Wordmark className={size === "lg" ? "text-2xl" : "text-base"} />
    </Link>
  );
}
