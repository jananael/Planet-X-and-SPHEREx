import Link from "next/link";

// SKYTRACE wordmark, rebuilt in HTML/SVG from Batool's logo so it sits directly on the page
// background (no image box). Per her brief: SKY white, TRACE pink-purple (T included), the
// custom crossbar-less A with its star, and the observation trail with three points.
export function Brand({ className = "" }: { className?: string }) {
  return (
    <Link className={`brand ${className}`.trim()} href="/" aria-label="SKYTRACE home">
      <span className="wordmark" aria-hidden="true">
        <span className="wordmark-sky">SKY</span>
        <span className="wordmark-trace">
          TR
          <svg className="wordmark-a" viewBox="0 0 100 120" focusable="false">
            <defs>
              <linearGradient id="wm-a" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#c98af5" />
                <stop offset="1" stopColor="#a35cf0" />
              </linearGradient>
            </defs>
            {/* Λ-shaped A without crossbar; the right leg runs a little past the baseline */}
            <path d="M44 4 L58 4 L100 118 L88 118 L51 26 L16 104 L2 104 Z" fill="url(#wm-a)" />
            {/* four-point star inside the A */}
            <path className="wordmark-star" d="M40 62 Q42 80 58 82 Q42 84 40 100 Q38 84 22 82 Q38 80 40 62 Z" />
          </svg>
          CE
        </span>
        <svg className="wordmark-trail" viewBox="0 0 400 60" preserveAspectRatio="none" focusable="false">
          <defs>
            <linearGradient id="wm-trail" x1="0" x2="1">
              <stop offset="0" stopColor="#7c4dff" stopOpacity="0" />
              <stop offset=".55" stopColor="#a66cff" stopOpacity=".85" />
              <stop offset="1" stopColor="#efe4ff" />
            </linearGradient>
          </defs>
          <path d="M8 46 Q170 66 344 8" fill="none" stroke="url(#wm-trail)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="160" cy="53" r="4.5" fill="#a46af5" />
          <circle cx="215" cy="47" r="5" fill="#c79cff" />
          <circle cx="262" cy="38" r="6" fill="#f1e8ff" />
        </svg>
      </span>
    </Link>
  );
}
