import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": ["./event-dates.jsonc"],
  },
};

export default nextConfig;
