"use client";

// Batool's SKYTRACE home page, ported from her Vite/React version into Next.js.
// Design, copy and assets are hers. Telescope behaviour (team decision): a small, still
// telescope beside the Earth in the hero, and a large one that fades and slides in once
// when the "See What Time Reveals" section scrolls into view.
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Brand } from "./brand";

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

const reveal = { duration: 1.1, ease: [0.22, 1, 0.36, 1] as const };

export function HomePage() {
  const reduceMotion = useReducedMotion();
  // With reduced motion everything simply renders in its final state.
  const enter = (from: { opacity: number; x?: number; y?: number }) =>
    reduceMotion ? {} : { initial: from, whileInView: { opacity: 1, x: 0, y: 0 }, viewport: { once: true, amount: 0.35 } };

  return (
    <main className="site-shell sky-home">
      <div className="space-backdrop" aria-hidden="true" />
      <HomeHeader />
      <section className="hero" aria-labelledby="hero-title">
        <img className="earth-art" src="/skytrace/earth.webp" alt="" />
        <img className="hero-telescope" src="/skytrace/telescope.webp" alt="" aria-hidden="true" />
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
        <div className="story-visual">
          <motion.img
            className="story-telescope"
            src="/skytrace/telescope.webp"
            alt="NASA SPHEREx space telescope"
            {...enter({ opacity: 0, x: 70 })}
            transition={reveal}
          />
        </div>
        <motion.div className="story-copy" {...enter({ opacity: 0, y: 18 })} transition={{ ...reveal, delay: 0.25 }}>
          <div className="home-eyebrow">POWERED BY SPHEREx</div>
          <h2 id="story-title">See What Time<br /><span>Reveals.</span></h2>
          <p>NASA&apos;s SPHEREx observes the sky in infrared light, revealing what our eyes cannot see. SKYTRACE brings these observations together across time, helping you spot changes, investigate moving-object candidates, and uncover the stories hidden between them.</p>
        </motion.div>
      </section>
      <HomeFooter />
    </main>
  );
}
