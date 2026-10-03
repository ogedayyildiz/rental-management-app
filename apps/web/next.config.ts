import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages are consumed from their compiled output; this lets
  // Next bundle them like app code.
  transpilePackages: ["@rental/shared"],
};

export default nextConfig;
