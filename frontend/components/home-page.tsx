"use client";

// Batool's SKYTRACE home page, ported from her Vite/React version into Next.js.
// Design, copy, assets and the scroll-linked telescope are hers; only the routing (next/link),
// asset paths and a reduced-motion fallback changed.
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { Brand } from "./brand";

const TELESCOPE_RATIO = 1035 / 1520; // height / width of telescope.webp

type TelescopeMotionBounds = {
  startTop: number;
  endTop: number;
  endScroll: number;
  startX: number;
  endX: number;
  endScale: number;
};

const initialMotionBounds: TelescopeMotionBounds = {
  startTop: 100,
  endTop: 760,
  endScroll: 520,
  startX: 110,
  endX: 0,
  endScale: 1,
};

function HomeHeader() {
  return (
    <header className="home-header">
      <Brand />
      <nav className="home-nav" aria-label="Main navigation">
        <Link href="/" aria-current="page">Home</Link>
        <Link href="/explore">Explorer</Link>
      </nav>
    </header>
  );
}

function HomeFooter() {
  return (
    <footer className="home-footer">
      <Brand className="footer-brand" />
      <nav className="footer-links" aria-label="Footer navigation">
        <Link href="/">Home</Link>
        <Link href="/explore">Explorer</Link>
      </nav>
    </footer>
  );
}

export function HomePage() {
  const heroRef = useRef<HTMLElement>(null);
  const storyVisualRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const reduceMotion = useReducedMotion();
  const [motionBounds, setMotionBounds] = useState(initialMotionBounds);

  useLayoutEffect(() => {
    const measureMotionPath = () => {
      const hero = heroRef.current;
      const storyVisual = storyVisualRef.current;
      if (!hero || !storyVisual) return;

      const isMobile = window.innerWidth <= 640;
      const baseWidth = isMobile
        ? Math.min(window.innerWidth * 0.86, 440)
        : Math.min(Math.max(window.innerWidth * 0.35, 320), 500);
      const baseHeight = baseWidth * TELESCOPE_RATIO;
      const visualRect = storyVisual.getBoundingClientRect();
      const storyCenter = window.scrollY + visualRect.top + visualRect.height / 2;
      const startCenter = hero.getBoundingClientRect().height * (isMobile ? 0.22 : 0.19);
      const preferredEndScroll = storyCenter - window.innerHeight * 0.48;
      // Never place the end of the animation beyond the furthest the page can scroll.
      const maximumScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const endScroll = Math.max(1, Math.min(preferredEndScroll, maximumScroll));
      const anchoredRight = window.innerWidth * (isMobile ? 0.06 : 0.12);
      const anchoredCenter = window.innerWidth - anchoredRight - baseWidth / 2;
      const startCenterX = window.innerWidth * (isMobile ? 0.76 : 0.78);
      const endCenterX = window.innerWidth * (isMobile ? 0.68 : 0.71);

      setMotionBounds({
        startTop: startCenter - baseHeight / 2,
        endTop: storyCenter - baseHeight / 2,
        endScroll,
        startX: startCenterX - anchoredCenter,
        endX: endCenterX - anchoredCenter,
        endScale: isMobile ? 0.62 : 1,
      });
    };

    measureMotionPath();
    window.addEventListener("resize", measureMotionPath);
    const resizeObserver = new ResizeObserver(measureMotionPath);
    if (heroRef.current) resizeObserver.observe(heroRef.current);
    if (storyVisualRef.current) resizeObserver.observe(storyVisualRef.current);

    return () => {
      window.removeEventListener("resize", measureMotionPath);
      resizeObserver.disconnect();
    };
  }, []);

  // Reduced motion: the telescope stays in its final place and the text is simply shown.
  const range = reduceMotion ? [0, 1] : [0, motionBounds.endScroll];
  const telescopeX = useTransform(scrollY, range, reduceMotion ? [motionBounds.endX, motionBounds.endX] : [motionBounds.startX, motionBounds.endX]);
  const telescopeY = useTransform(scrollY, range, reduceMotion ? [motionBounds.endTop, motionBounds.endTop] : [motionBounds.startTop, motionBounds.endTop]);
  const telescopeScale = useTransform(scrollY, range, reduceMotion ? [motionBounds.endScale, motionBounds.endScale] : [0.14, motionBounds.endScale]);
  const storyOpacity = useTransform(
    scrollY,
    reduceMotion ? [0, 1] : [motionBounds.endScroll * 0.72, motionBounds.endScroll],
    reduceMotion ? [1, 1] : [0, 1],
  );

  return (
    <main className="site-shell sky-home">
      <div className="space-backdrop" aria-hidden="true" />
      <motion.img
        className="shared-telescope"
        src="/skytrace/telescope.webp"
        alt=""
        aria-hidden="true"
        style={{ x: telescopeX, y: telescopeY, scale: telescopeScale }}
      />
      <HomeHeader />
      <section ref={heroRef} className="hero" aria-labelledby="hero-title">
        <img className="earth-art" src="/skytrace/earth.webp" alt="" />
        <div className="hero-copy">
          <h1 id="hero-title">
            <span className="headline-first">The Sky Is</span>
            <span className="headline-second">Never Still.</span>
          </h1>
          <p>Beyond what the eye can see, the universe is always changing. Explore its hidden story through NASA SPHEREx.</p>
          <Link href="/explore" className="primary-cta">
            Start Exploring <span aria-hidden="true">→</span>
          </Link>
        </div>
        <a className="scroll-cue" href="#powered" aria-label="Scroll to learn about SPHEREx">
          <span className="chevron-arrow" aria-hidden="true" />
        </a>
      </section>
      <section className="story" id="powered" aria-labelledby="story-title">
        <motion.div ref={storyVisualRef} className="story-visual" aria-hidden="true" />
        <motion.div className="story-copy" style={{ opacity: storyOpacity }}>
          <div className="home-eyebrow">POWERED BY SPHEREx</div>
          <h2 id="story-title">See What Time<br /><span>Reveals.</span></h2>
          <p>NASA&apos;s SPHEREx observes the sky in infrared light, revealing what our eyes cannot see. SKYTRACE brings these observations together across time, helping you spot changes, investigate moving-object candidates, and uncover the stories hidden between them.</p>
        </motion.div>
      </section>
      <HomeFooter />
    </main>
  );
}
