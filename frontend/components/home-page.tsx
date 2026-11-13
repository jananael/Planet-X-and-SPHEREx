"use client";

// Batool's SKYTRACE home page, ported from her Vite/React version into Next.js.
// Design, copy and assets are hers. Two independent telescopes hover in their own sections.
import Link from "next/link";
import { useEffect, useRef } from "react";
import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { Brand } from "./brand";
import { StarryBackground } from "./starry-background";

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
      <p className="home-credit">Data: NASA SPHEREx via NASA/IPAC IRSA · NASA Space Apps Challenge 2026 project, not an official NASA product.</p>
      <nav className="footer-links" aria-label="Footer navigation">
        <Link href="/">Home</Link>
        <Link href="/explore">Explorer</Link>
      </nav>
    </footer>
  );
}

function HeroTelescope() {
  const anchor = useRef<HTMLDivElement>(null);
  const controls = useAnimationControls();

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let generation = 0;
    const random = (range: number) => (Math.random() * 2 - 1) * range;

    async function drift() {
      const current = ++generation;
      controls.stop();
      if (preference.matches) {
        controls.set({ x: 0, y: 0, rotate: 0 });
        return;
      }
      while (current === generation && anchor.current) {
        // Measure the stationary wrapper, never the animated image. Reserve room
        // for rotation and shrink the envelope near the copy or viewport edge.
        const base = anchor.current.getBoundingClientRect();
        const hero = anchor.current.closest(".hero")!;
        const section = hero.getBoundingClientRect();
        const copy = hero.querySelector(".hero-copy")!.getBoundingClientRect();
        const horizontal = Math.max(0, Math.min(24, base.left - section.left - 8, section.right - base.right - 8));
        const crossesCopy = base.right + horizontal + 8 > copy.left && base.left - horizontal - 8 < copy.right;
        const vertical = Math.max(0, Math.min(16, base.top - section.top - 8,
          crossesCopy ? copy.top - base.bottom - 12 : 16));

        // Sample exactly once per completed leg; Motion interpolates the frames.
        await controls.start({
          x: random(horizontal),
          y: random(vertical),
          rotate: random(2.5),
          transition: { duration: 3 + Math.random() * 3, ease: "easeInOut" },
        });
      }
    }
    void drift();
    preference.addEventListener("change", drift);
    return () => {
      generation++;
      controls.stop();
      preference.removeEventListener("change", drift);
    };
  }, [controls]);

  return (
    <div ref={anchor} className="hero-telescope" aria-hidden="true">
      <motion.img animate={controls} className="hero-telescope-float" src="/skytrace/telescope.webp" alt="" width="1000" height="681" />
    </div>
  );
}

export function HomePage() {
  const reduceMotion = useReducedMotion();

  return (
    <main className="site-shell sky-home">
      <div className="space-backdrop" aria-hidden="true" />
      <StarryBackground />
      <HomeHeader />
      <section className="hero" aria-labelledby="hero-title">
        <img className="earth-art" src="/skytrace/earth.webp" alt="" />
        <HeroTelescope />
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
        <div className="story-visual" aria-hidden="true">
          <motion.div
            className="story-telescope-reveal"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: reduceMotion ? 0 : 1.2, ease: "easeInOut" }}
          >
            <img className="story-telescope-float" src="/skytrace/telescope.webp" alt="" width="1000" height="681" />
          </motion.div>
        </div>
        <div className="story-copy">
          <div className="home-eyebrow">POWERED BY SPHEREx</div>
          <h2 id="story-title">See What Time<br /><span>Reveals.</span></h2>
          <p>NASA&apos;s SPHEREx observes the sky in infrared light, revealing what our eyes cannot see. SKYTRACE brings these observations together across time, helping you spot changes, investigate moving-object candidates, and uncover the stories hidden between them.</p>
        </div>
      </section>
      <HomeFooter />
    </main>
  );
}
