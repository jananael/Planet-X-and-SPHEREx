import Link from "next/link";

export function Brand() {
  return <Link className="brand" href="/" aria-label="MARS home"><svg viewBox="0 0 58 42" fill="none" aria-hidden="true"><circle cx="29" cy="21" r="13" stroke="currentColor" strokeWidth="1.7" /><ellipse cx="29" cy="21" rx="28" ry="7" transform="rotate(-30 29 21)" stroke="currentColor" strokeWidth="1.7" /><path d="m38 5 4 1-2 4" stroke="currentColor" strokeWidth="1.5" /></svg><span>MARS<span>.</span></span></Link>;
}
