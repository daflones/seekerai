import Link from "next/link";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className={`brand${light ? " brand-light" : ""}`} aria-label="SeekerAi, página inicial">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none">
          <circle cx="14" cy="15" r="9" stroke="currentColor" strokeWidth="2.5" />
          <ellipse cx="15" cy="15" rx="16" ry="5" transform="rotate(-40 15 15)" stroke="currentColor" strokeWidth="1.5" />
          <path d="m21 22 6 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <circle cx="25" cy="5" r="3" fill="currentColor" />
        </svg>
      </span>
      <span>seeker<span className="brand-ai">ai</span><span className="brand-dot">.</span></span>
    </Link>
  );
}
