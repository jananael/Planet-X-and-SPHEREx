import Link from "next/link";

// Batool's SKYTRACE logo, shared by every page. The image has a dark space background;
// `mix-blend-mode: screen` (in CSS) drops it so only the white/purple wordmark shows.
export function Brand({ className = "" }: { className?: string }) {
  return (
    <Link className={`brand ${className}`.trim()} href="/" aria-label="SKYTRACE home">
      <img src="/skytrace/logo.webp" alt="SKYTRACE" width={720} height={240} />
    </Link>
  );
}
