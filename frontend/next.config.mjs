/** Serve the supplied standalone homepage, keeping Explorer in the Next.js app. */
const nextConfig = {
  // A separate build folder can be used for checks while `next dev` holds .next (NEXT_DIST_DIR).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Keep older bookmarks working while the ML screen is no longer an active product route.
  async redirects() {
    return [{ source: "/machine-learning", destination: "/explore", permanent: false }];
  },
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/skytrace-homepage/index.html" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
