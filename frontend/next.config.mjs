/** Serve the supplied standalone homepage, keeping Explorer in the Next.js app. */
const nextConfig = {
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
