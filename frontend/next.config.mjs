/** Serve the supplied standalone homepage, keeping Explorer in the Next.js app. */
const nextConfig = {
  // The Machine Learning tab was removed before the submission; old links go to the Explorer.
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
