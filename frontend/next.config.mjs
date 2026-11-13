/** Serve the supplied standalone homepage, keeping Explorer in the Next.js app. */
const nextConfig = {
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/skytrace-homepage/index.html" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
